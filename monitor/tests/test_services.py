#!/usr/bin/env python3
"""服務自動盤點的單元測試（只用標準函式庫，不需要 Docker 或網路）。

執行：python3 monitor/tests/test_services.py
"""
import importlib.util
import json
import os
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True   # 不要在 repo 裡留下 __pycache__
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, path))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


inv = load("service_inventory", "bin/service-inventory.py")
wd = load("watchdog", "watchdog/watchdog.py")

FAKE_HASH = "$2a$14$abcdefghijklmnopqrstuuJ8dC1F0eXAMPLEhashEXAMPLEhashEXAMPLE"
CADDYFILE = """
{
	metrics {
		per_host
	}
}
(site) {
	root * /var/www/chijiun/site
	file_server
}
chijiun.com, www.chijiun.com {
	tls internal
	import site
}
:80 {
	import site
}
stats.chijiun.com {
	tls internal
	route {
		basic_auth {
			admin %s
		}
		reverse_proxy 127.0.0.1:8100 {
			header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}
		}
	}
}
netdata.chijiun.com {
	tls internal
	route {
		abort @not_cloudflare
		redir https://monitor.chijiun.com/netdata/ permanent   # 只轉址
	}
}
https://dev.chijiun.com:443 {
	reverse_proxy 127.0.0.1:7676
}
""" % FAKE_HASH


def container(name, **kw):
    base = {"name": "/" + name, "image": name + ":latest", "project": "", "service": "", "state": "running",
            "exit": 0, "started": "2026-11-16T12:00:00.123456789Z", "health": None,
            "restart": "unless-stopped", "restarts": 0, "ports": {}}
    base.update(kw)
    return base


CFG = {"names": {"a": {"title": "服務 A", "desc": "說明"}}, "projects": {}, "ignore": ["skip-*"],
       "ignore_domains": ["www.chijiun.com"], "systemd": [], "extra_urls": []}
T0 = 1_800_000_000


def build(now, state, containers, domains=(), units=()):
    return inv.build(now, CFG, state, containers, None, list(domains), None, list(units))


class CaddyfileTest(unittest.TestCase):
    def test_sites(self):
        sites = inv.parse_caddyfile(CADDYFILE)
        by = {h: s for s in sites for h in s["hosts"]}
        self.assertEqual(sorted(by), ["chijiun.com", "dev.chijiun.com", "netdata.chijiun.com", "stats.chijiun.com", "www.chijiun.com"])
        self.assertTrue(by["netdata.chijiun.com"]["redirect_only"])
        self.assertFalse(by["chijiun.com"]["redirect_only"])
        self.assertEqual(by["stats.chijiun.com"]["upstream_ports"], [8100])
        self.assertEqual(by["dev.chijiun.com"]["upstream_ports"], [7676])

    def test_hash_never_leaks(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "Caddyfile")
            with open(p, "w", encoding="utf-8") as f:
                f.write(CADDYFILE)
            domains, err = inv.collect_domains(p)
        self.assertIsNone(err)
        state = {}
        out = build(T0, state, [container("stats-ai", ports={"8080/tcp": [{"HostIp": "127.0.0.1", "HostPort": "8100"}]})], domains)
        text = json.dumps(out) + json.dumps(state)
        self.assertNotIn("$2a$", text)
        self.assertNotIn("admin", text)
        stats = next(d for d in out["domains"] if d["name"] == "stats.chijiun.com")
        self.assertEqual(stats["targets"], ["stats-ai"])
        www = next(d for d in out["domains"] if d["name"] == "www.chijiun.com")
        self.assertTrue(www["ignored"])

    def test_missing_caddyfile_keeps_last_domains(self):
        state = {}
        build(T0, state, [], [{"name": "a.example.com", "redirect_only": True, "upstream_ports": []}])
        out = inv.build(T0 + 60, CFG, state, [], None, None, "讀不到 Caddyfile：PermissionError", [])
        self.assertEqual([d["name"] for d in out["domains"]], ["a.example.com"])
        self.assertTrue(out["domains"][0]["redirect_only"])
        self.assertEqual(out["problems"][0]["status"], "warn")


class InventoryTest(unittest.TestCase):
    def test_first_run_is_baseline(self):
        state = {}
        out = build(T0, state, [container("a"), container("b"), container("skip-me")])
        self.assertEqual([c["name"] for c in out["containers"]], ["a", "b"])
        self.assertTrue(all(c["baseline"] and not c["new"] for c in out["containers"]))
        self.assertEqual(out["containers"][0]["title"], "服務 A")
        self.assertEqual(out["digest"]["added"], [])
        self.assertEqual(out["summary"]["new"], 0)

    def test_new_then_not_new_after_7_days(self):
        state = {}
        build(T0, state, [container("a")])
        out = build(T0 + 60, state, [container("a"), container("zz")])
        zz = out["containers"][1]
        self.assertTrue(zz["new"] and not zz["baseline"])
        self.assertEqual([x["name"] for x in out["digest"]["added"]], ["zz"])
        out = build(T0 + 8 * 86400, state, [container("a"), container("zz")])
        self.assertFalse(out["containers"][1]["new"])
        self.assertEqual(out["digest"]["added"], [])

    def test_gone_needs_three_runs_and_return_is_not_new(self):
        state = {}
        build(T0, state, [container("a"), container("b")])
        for i in (1, 2):
            out = build(T0 + 60 * i, state, [container("a")])
            self.assertEqual(out["digest"]["removed"], [])
        out = build(T0 + 180, state, [container("a")])
        self.assertEqual([x["name"] for x in out["digest"]["removed"]], ["b"])
        out = build(T0 + 240, state, [container("a"), container("b")])
        b = out["containers"][1]
        self.assertFalse(b["new"])                      # 回來的不算新發現
        self.assertEqual(out["digest"], {"window_hours": 24, "added": [], "removed": []})

    def test_short_gap_is_not_gone(self):
        state = {}
        build(T0, state, [container("a")])
        build(T0 + 60, state, [])
        out = build(T0 + 120, state, [container("a")])
        self.assertEqual(out["digest"]["removed"], [])
        self.assertFalse(out["containers"][0]["new"])

    def test_transient_container_not_in_digest(self):
        state = {}
        build(T0, state, [container("a")])
        build(T0 + 60, state, [container("a"), container("zz")])
        for i in (2, 3, 4):
            out = build(T0 + 60 * i, state, [container("a")])
        self.assertEqual(out["digest"], {"window_hours": 24, "added": [], "removed": []})

    def test_status_rules(self):
        cases = [
            (container("x", state="exited", exit=137), "bad"),
            (container("x", state="restarting"), "bad"),
            (container("x", health="unhealthy"), "bad"),
            (container("x", health="healthy"), "ok"),
            (container("x", state="exited", exit=0, restart="no"), "ok"),
            (container("x", state="exited", exit=1, restart="no"), "warn"),
            (container("x", state="exited", exit=0, restart="on-failure"), "ok"),
            (container("x", state="exited", exit=2, restart="on-failure"), "bad"),
            (container("x", state="exited", exit=0, restart="always"), "bad"),
            (container("x", state="paused"), "warn"),
        ]
        for raw, want in cases:
            out = build(T0, {}, [raw])
            self.assertEqual(out["containers"][0]["status"], want, raw)

    def test_health_starting_grace(self):
        started = "2026-11-16T12:00:00Z"
        t = inv.parse_time(started)
        c = container("x", health="starting", started=started)
        self.assertEqual(build(t + 200, {}, [c])["containers"][0]["status"], "ok")
        self.assertEqual(build(t + 400, {}, [c])["containers"][0]["status"], "warn")

    def test_restart_count(self):
        state = {}
        st = lambda n, t: build(t, state, [container("x", restarts=n)])["containers"][0]["status"]  # noqa: E731
        self.assertEqual(st(5, T0), "ok")               # 第一次看到：5 是基準，不算增加
        self.assertEqual(st(6, T0 + 60), "warn")        # 增加一次
        self.assertEqual(st(7, T0 + 120), "bad")        # 連續增加
        self.assertEqual(st(7, T0 + 180), "warn")       # 停止增加，15 分鐘內仍提醒
        self.assertEqual(st(7, T0 + 120 + 16 * 60), "ok")
        self.assertEqual(st(0, T0 + 3600), "ok")        # 容器重建，次數歸零不算增加

    def test_docker_unavailable_keeps_state(self):
        state = {}
        build(T0, state, [container("a")])
        out = inv.build(T0 + 60, CFG, state, None, "docker ps 失敗", [], None, [])
        self.assertEqual(out["problems"][0]["status"], "bad")
        self.assertEqual(out["summary"]["bad"], 1)
        self.assertEqual(state["events"], [])           # 讀不到 Docker 不能被當成容器全部消失

    def test_no_secret_fields_and_image_digest(self):
        raw = container("a", image="repo/app:1@sha256:" + "a" * 64)
        raw["env"] = ["TOKEN=secret"]
        out = build(T0, {}, [raw])
        self.assertEqual(out["containers"][0]["image"], "repo/app:1")
        self.assertNotIn("secret", json.dumps(out))

    def test_ports(self):
        ports, public = inv.format_ports({"80/tcp": [{"HostIp": "0.0.0.0", "HostPort": "8080"}, {"HostIp": "::", "HostPort": "8080"}],
                                          "5432/tcp": None})
        self.assertEqual(ports, ["0.0.0.0:8080->80/tcp"])
        self.assertTrue(public)

    def test_systemd(self):
        unit = {"name": "devspace.service", "load": "loaded", "active": "active", "sub": "running",
                "enabled": "enabled", "restart_count": 0, "started_at": T0}
        state = {}
        self.assertEqual(build(T0, state, [], units=[unit])["systemd"][0]["status"], "ok")
        out = build(T0 + 60, state, [], units=[dict(unit, active="failed", sub="failed")])
        self.assertEqual(out["systemd"][0]["status"], "bad")
        out = build(T0 + 120, state, [], units=[dict(unit, active="inactive", sub="dead")])
        self.assertEqual(out["systemd"][0]["status"], "bad")
        out = build(T0 + 180, state, [], units=[dict(unit, active="inactive", sub="dead", enabled="disabled")])
        self.assertEqual(out["systemd"][0]["status"], "ok")

    def test_config_missing_or_broken(self):
        self.assertEqual(inv.load_config("/nonexistent/services.json")["ignore"], [])
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "c.json")
            with open(p, "w") as f:
                f.write("{not json")
            self.assertEqual(inv.load_config(p)["names"], {})
            with open(p, "w") as f:
                json.dump({"extra_urls": [{"name": "x", "url": "http://insecure"}, {"name": "y", "url": "https://ok.example.com/h"}],
                           "systemd": ["a.service", 5]}, f)
            cfg = inv.load_config(p)
            self.assertEqual(cfg["extra_urls"], [{"name": "y", "url": "https://ok.example.com/h"}])
            self.assertEqual(cfg["systemd"], ["a.service"])

    def test_repo_config_is_valid(self):
        cfg = inv.load_config(os.path.join(ROOT, "services.json"))
        self.assertIn("devspace.service", cfg["systemd"])
        self.assertEqual(inv.describe(cfg, "ncu-backend")[0], "NCU 後端")

    def test_corrupt_state_becomes_baseline(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "s.json")
            with open(p, "w") as f:
                f.write("garbage")
            state = inv.load_state(p)
        out = build(T0, state, [container("a")])
        self.assertTrue(out["containers"][0]["baseline"])


def services_json(now, containers=(), domains=(), **kw):
    d = {"updated": now, "containers": list(containers), "systemd": [], "domains": list(domains), "problems": [],
         "extra_checks": [], "digest": {"added": [], "removed": []}}
    d.update(kw)
    return json.dumps(d).encode()


class WatchdogParseTest(unittest.TestCase):
    def test_parse_and_sanitize(self):
        raw = services_json(1000, containers=[{"name": "a\nb\x1b[31m", "title": "T" * 500, "status": "bad", "note": "n", "new": True},
                                              {"name": 5}, "junk"],
                            domains=[{"name": "ok.example.com"}, {"name": "bad host"}, {"name": "r.example.com", "redirect_only": True}],
                            extra_checks=[{"name": "x", "url": "http://no"}, {"name": "y", "url": "https://y.example.com/h"}])
        got, err = wd.parse_services(raw, 1100)
        self.assertIsNone(err)
        self.assertEqual(len(got["items"]), 1)
        self.assertNotIn("\n", got["items"][0]["name"])
        self.assertNotIn("\x1b", got["items"][0]["name"])
        self.assertLessEqual(len(got["items"][0]["show"]), 200)
        self.assertEqual([d["name"] for d in got["domains"]], ["ok.example.com", "r.example.com"])
        self.assertEqual(got["extra"], [{"name": "y", "url": "https://y.example.com/h"}])

    def test_stale_and_garbage(self):
        got, err = wd.parse_services(services_json(1000), 1000 + 301)
        self.assertIsNotNone(got)
        self.assertIn("沒有更新", err)
        for raw in (b"", b"not json", b"[]", b'{"updated":"x"}', b"x" * 2_000_000):
            got, err = wd.parse_services(raw, 1000)
            self.assertIsNone(got)
            self.assertTrue(err)

    def test_domain_checks(self):
        domains = [{"name": "chijiun.com"}, {"name": "dev.chijiun.com"}, {"name": "r.chijiun.com", "skip": True}]
        plan = wd.domain_checks(domains, [{"name": "x", "url": "https://x.example.com/h"}], {"https://chijiun.com/"})
        self.assertEqual([p["url"] for p in plan], ["https://dev.chijiun.com/", "https://x.example.com/h"])

    def test_public_https_rejects_unsafe(self):
        for url in ("http://example.com/", "https://10.0.0.37/", "https://169.254.169.254/", "https://user:pw@example.com/",
                    "https://example.com:8443/", "https://localhost/", "file:///etc/passwd"):
            self.assertIsNotNone(wd.public_https(url), url)


class WatchdogFlowTest(unittest.TestCase):
    """用假的拉取結果與假的 Telegram，跑完整的 main()，確認通知只發一次、恢復也會通知。"""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.sent = []
        self.clock = [2_000_000_000]
        self.raw = None
        self.fail_urls = set()
        wd.STATE_DIR = self.dir.name
        wd.STATE_FILE = os.path.join(self.dir.name, "state.json")
        wd.HEARTBEAT_HOUR = -1
        wd.fetch_services_raw = lambda: (self.raw, None) if self.raw is not None else (None, "SSH 連線失敗")
        wd.check = lambda url, codes, needle: (url not in self.fail_urls, "HTTP 200" if url not in self.fail_urls else "HTTP 502", 5)
        wd.check_alive = lambda url: wd.check(url, None, None)
        wd.send_telegram = lambda text: (self.sent.append(text), True)[1]
        wd.host_stats = lambda: {}
        wd.time.time = lambda: self.clock[0]
        if not hasattr(os, "uname"):
            os.uname = lambda: type("U", (), {"nodename": "test"})()

    def tearDown(self):
        self.dir.cleanup()

    def tick(self, containers, domains=(), **kw):
        self.clock[0] += 60
        self.raw = None if containers is None else services_json(self.clock[0], containers, domains, **kw)
        wd.main()
        with open(os.path.join(self.dir.name, "status.json"), encoding="utf-8") as f:
            return json.load(f)

    def test_bad_alert_once_then_recover(self):
        ok = {"name": "a", "status": "ok", "note": "執行中"}
        bad = {"name": "a", "status": "bad", "note": "應該常駐卻沒有在跑"}
        self.tick([ok])
        self.tick([bad]); self.tick([bad])
        self.assertEqual(self.sent, [])
        st = self.tick([bad])
        self.assertEqual(len(self.sent), 1)
        self.assertIn("服務異常", self.sent[0])
        self.assertEqual(st["services"]["alerting"], ["a"])
        for _ in range(5):
            self.tick([bad])
        self.assertEqual(len(self.sent), 1)             # 不重複洗版
        self.tick([ok])
        self.assertEqual(len(self.sent), 2)
        self.assertIn("已恢復", self.sent[1])
        self.tick([ok])
        self.assertEqual(len(self.sent), 2)

    def test_new_service_notified_once(self):
        new = {"name": "zz", "status": "ok", "note": "執行中", "new": True, "image": "busybox"}
        self.tick([{"name": "a", "status": "ok"}])
        self.tick([{"name": "a", "status": "ok"}, new])
        self.assertEqual(len(self.sent), 1)
        self.assertIn("發現新服務", self.sent[0])
        self.assertIn("已自動納入監控，如需補充網址請告訴我", self.sent[0])
        for _ in range(3):
            self.tick([{"name": "a", "status": "ok"}, new])
        self.tick([{"name": "a", "status": "ok"}])       # 消失
        self.tick([{"name": "a", "status": "ok"}, new])  # 又出現，仍不重複通知
        self.assertEqual(len(self.sent), 1)

    def test_new_not_marked_when_telegram_fails(self):
        new = {"name": "zz", "status": "ok", "new": True}
        wd.send_telegram = lambda text: False
        self.tick([new]); self.tick([new])
        wd.send_telegram = lambda text: (self.sent.append(text), True)[1]
        self.tick([new])
        self.assertEqual(len(self.sent), 1)

    def test_pull_failure_and_stale(self):
        self.tick([{"name": "a", "status": "ok"}], domains=[{"name": "dev.example.com"}])
        self.tick(None); self.tick(None)
        self.assertEqual(self.sent, [])
        st = self.tick(None)
        self.assertEqual(len(self.sent), 1)
        self.assertIn("A1 沒有回報服務清單", self.sent[0])
        self.assertFalse(st["services"]["ok"])
        # 拉不到清單時，網域照樣用上次的清單檢查
        self.assertIn("網域 dev.example.com", [c["name"] for c in st["checks"]])
        self.tick(None)
        self.assertEqual(len(self.sent), 1)
        self.tick([{"name": "a", "status": "ok"}], domains=[{"name": "dev.example.com"}])
        self.assertEqual(len(self.sent), 2)
        self.assertIn("已恢復回報", self.sent[1])
        # 過期的清單也算沒有回報
        for _ in range(3):
            self.clock[0] += 60
            self.raw = services_json(self.clock[0] - 400, [{"name": "a", "status": "bad"}])
            wd.main()
        self.assertEqual(len(self.sent), 3)
        self.assertIn("沒有更新", self.sent[2])

    def test_domain_check_alert_and_status_compat(self):
        doms = [{"name": "chijiun.com"}, {"name": "dev.example.com"}, {"name": "r.example.com", "redirect_only": True}]
        st = self.tick([], domains=doms)
        names = [c["name"] for c in st["checks"]]
        self.assertEqual(names[:5], [c[0] for c in wd.CHECKS])     # 既有 5 項順序與名稱不變
        self.assertEqual(names[5:], ["網域 dev.example.com"])
        for c in st["checks"]:
            for field in ("name", "ok", "detail", "ms", "fails", "alerted"):
                self.assertIn(field, c)
        self.assertEqual(st["checks"][0]["domain"], "chijiun.com")
        self.fail_urls.add("https://dev.example.com/")
        for _ in range(3):
            st = self.tick([], domains=doms)
        self.assertEqual(len(self.sent), 1)
        self.assertIn("網域 dev.example.com 異常", self.sent[0])
        self.tick([], domains=doms[:1])                             # 網域從清單移除
        self.assertIn("停止檢查", self.sent[1])

    def test_daily_report(self):
        wd.HEARTBEAT_HOUR = 0
        self.tick([{"name": "a", "status": "ok"}, {"name": "b", "status": "warn"}],
                  digest={"added": [{"kind_label": "容器", "name": "b"}], "removed": []})
        self.assertEqual(len(self.sent), 1)
        self.assertIn("每日回報：全部正常", self.sent[0])
        self.assertIn("共 2 個，異常 0 個、需注意 1 個", self.sent[0])
        self.assertIn("新增：容器 b；消失：無", self.sent[0])
        self.tick([{"name": "a", "status": "ok"}])
        self.assertEqual(len(self.sent), 1)


if __name__ == "__main__":
    sys.exit(unittest.main(verbosity=1))
