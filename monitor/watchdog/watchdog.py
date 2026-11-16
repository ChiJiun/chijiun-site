#!/usr/bin/env python3
"""站外看門狗：放在另一台 VM 上，定時檢查網站，連續失敗才用 Telegram 通知。

設計重點：
- 只用標準函式庫；每分鐘由 systemd timer 執行一次，狀態存在 $STATE_DIRECTORY/state.json。
- 連續失敗 FAIL_THRESHOLD 次（預設 3，約 3 分鐘）才發出警報，恢復時發一則通知，避免瞬間抖動。
- 每天固定時段（HEARTBEAT_HOUR，台北時間）發一則「看門狗還活著」，看門狗自己掛了也能從沒收到而察覺。
- 沒設定 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 時只寫日誌（journalctl），不會報錯。

服務自動盤點（A1 的 monitor/bin/service-inventory.py 每分鐘產生服務清單）：
- 每分鐘經 Oracle 私有網路，用專用的唯讀 SSH 金鑰向 A1 拉取服務清單。A1 那邊把這把金鑰限定成
  「只能 cat 服務清單」，所以這把金鑰外流也只能讀到清單。
- 清單裡的服務異常（連續 FAIL_THRESHOLD 次）、出現新服務、A1 沒有回報清單，都會通知。
- 清單裡的 Caddy 網域（只做轉址的除外）會自動加做外部檢查，新網域不用改這支程式。
- 清單的內容一律當成不可信的資料：字串會截短並去掉控制字元，網址只接受 https 且必須解析到公網位址。
"""
import ipaddress
import json
import os
import re
import socket
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

# (名稱, 網址, 可接受的狀態碼, 內容必須包含的字串或 None)
CHECKS = [
    ("個人網站 chijiun.com", "https://chijiun.com/", {200}, "翁祺鈞"),
    ("stats-ai", "https://stats.chijiun.com/healthz", {200}, None),
    ("ncu-backend 健康", "https://ncu-backend.chijiun.com/health", {200}, None),
    ("ncu-backend 就緒", "https://ncu-backend.chijiun.com/ready", {200}, None),
    # 未登入的 Kuma 首頁回 200 或轉址到登入頁；只要 Caddy/Kuma 活著就算正常
    ("監控站 monitor", "https://monitor.chijiun.com/", {200, 301, 302}, None),
]

TIMEOUT = int(os.environ.get("CHECK_TIMEOUT", "15"))
FAIL_THRESHOLD = int(os.environ.get("FAIL_THRESHOLD", "3"))
HEARTBEAT_HOUR = int(os.environ.get("HEARTBEAT_HOUR", "9"))  # 台北時間；設 -1 關閉
TZ = timezone(timedelta(hours=8))
UA = "chijiun-watchdog/1.0"
STATE_DIR = os.environ.get("STATE_DIRECTORY", ".")
STATE_FILE = os.path.join(STATE_DIR, "state.json")

# 服務清單的拉取設定。私鑰由 systemd 的 LoadCredential 交給這支程式（只有這個服務讀得到）。
SVC_HOST = os.environ.get("SVC_HOST", "10.0.0.37")          # A1 的私有 IP
SVC_USER = os.environ.get("SVC_USER", "wdsvc")
SVC_KEY = os.environ.get("SVC_KEY") or os.path.join(os.environ.get("CREDENTIALS_DIRECTORY", "/nonexistent"), "svc_key")
SVC_KNOWN_HOSTS = os.environ.get("SVC_KNOWN_HOSTS", "/etc/chijiun-watchdog/svc_known_hosts")
SVC_STALE = int(os.environ.get("SVC_STALE", "300"))        # 清單超過這麼久沒更新就算過期
SVC_MAX_BYTES = 1_000_000
MAX_DOMAINS, MAX_EXTRA = 40, 20
NOTIFIED_KEEP = 30 * 86400
HOSTNAME = re.compile(r"^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):  # 不跟隨轉址，直接看原始狀態碼
        return None


def check(url, ok_codes, needle):
    """ok_codes 是 None 時用「活著就好」的標準：HTTP 狀態 < 500（401/403/404/轉址都算活著）。"""
    opener = urllib.request.build_opener(NoRedirect, urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    started = time.monotonic()
    try:
        try:
            resp = opener.open(req, timeout=TIMEOUT)
            code, body = resp.status, resp.read(200_000)
        except urllib.error.HTTPError as e:
            code, body = e.code, b""
    except Exception as e:  # noqa: BLE001  連線、逾時、憑證錯誤都算失敗
        return False, f"連線失敗：{type(e).__name__}: {str(e)[:80]}", None
    ms = int((time.monotonic() - started) * 1000)
    if ok_codes is None:
        if code >= 500:
            why = "Cloudflare 連不到主機" if code == 530 or 520 <= code <= 527 else "伺服器錯誤"
            return False, f"HTTP {code}（{why}）", ms
        return True, f"HTTP {code}", ms
    if code not in ok_codes:
        return False, f"HTTP {code}（預期 {'/'.join(map(str, sorted(ok_codes)))}）", ms
    if needle and needle.encode() not in body:
        return False, f"HTTP {code} 但內容不含「{needle}」", ms
    return True, f"HTTP {code}", ms


def public_https(url):
    """清單給的網址只接受 https、主機是網域（不是 IP）、而且解析出來全是公網位址。

    清單來自 A1；萬一 A1 被入侵，也不能叫這台去連私有網段或雲端的 metadata 位址。
    回傳 None 代表可以檢查，否則回傳拒絕的原因。
    """
    try:
        u = urllib.parse.urlsplit(url)
        host = (u.hostname or "").lower()
        if u.scheme != "https" or u.username or u.password or u.port not in (None, 443) or not HOSTNAME.match(host):
            return "網址格式不接受"
        infos = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return "DNS 查不到這個網域"
    except (ValueError, OSError):
        return "網址格式不接受"
    for info in infos:
        if not ipaddress.ip_address(info[4][0]).is_global:
            return "解析到非公網位址，不檢查"
    return None


def check_alive(url):
    why = public_https(url)
    if why:
        return False, why, None
    return check(url, None, None)


def send_telegram(text):
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat:
        print("[未設定 Telegram，只寫日誌]", text.replace("\n", " | "))
        return False
    data = urllib.parse.urlencode({"chat_id": chat, "text": text[:3900], "disable_web_page_preview": "true"}).encode()
    try:
        urllib.request.urlopen(f"https://api.telegram.org/bot{token}/sendMessage", data=data, timeout=15).read()
        print("已送出 Telegram：" + " | ".join(text.splitlines()[:2])[:160])   # 日誌留一筆，方便事後核對發過什麼
        return True
    except Exception as e:  # noqa: BLE001  錯誤訊息可能含 token，只印型別
        print(f"Telegram 發送失敗：{type(e).__name__}", file=sys.stderr)
        return False


def load_state():
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_state(state):
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False)
    os.replace(tmp, STATE_FILE)


def host_stats():
    """小主機自己的用量，讀 /proc，失敗就回傳空的。"""
    out = {}
    try:
        with open("/proc/loadavg") as f:
            out["load1"] = float(f.read().split()[0])
        mem = {}
        with open("/proc/meminfo") as f:
            for line in f:
                k, v = line.split(":")
                mem[k] = int(v.split()[0])
        out["mem_total_mb"] = round(mem["MemTotal"] / 1024)
        out["mem_used_pct"] = round(100 * (1 - mem["MemAvailable"] / mem["MemTotal"]), 1)
        with open("/proc/uptime") as f:
            out["uptime_s"] = int(float(f.read().split()[0]))
    except (OSError, ValueError, KeyError):
        pass
    return out


# ---------- 服務清單（來自 A1） ----------
def clean(value, limit=80):
    """清單裡的字串一律當成不可信：轉字串、去掉控制字元與換行、截短。"""
    text = "".join(ch for ch in str(value if value is not None else "") if ch.isprintable())
    return text[:limit]


def fetch_services_raw():
    """用唯讀金鑰向 A1 拉取服務清單的原始內容。回傳 (bytes 或 None, 錯誤訊息)。"""
    if not os.path.isfile(SVC_KEY) or not os.path.isfile(SVC_KNOWN_HOSTS):
        return None, "尚未設定拉取金鑰"
    cmd = ["/usr/bin/ssh", "-T", "-F", "/dev/null", "-i", SVC_KEY,
           "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
           "-o", "StrictHostKeyChecking=yes", "-o", f"UserKnownHostsFile={SVC_KNOWN_HOSTS}",
           "-o", "GlobalKnownHostsFile=/dev/null", f"{SVC_USER}@{SVC_HOST}"]
    try:
        p = subprocess.run(cmd, capture_output=True, timeout=25, check=False, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        return None, "連線逾時"
    except OSError as e:
        return None, f"無法執行 ssh：{type(e).__name__}"
    if p.returncode != 0:
        # ssh 的錯誤訊息只寫進日誌，不放進通知
        print("拉取服務清單失敗：" + clean(p.stderr.decode("utf-8", "replace"), 200), file=sys.stderr)
        return None, "SSH 連線失敗"
    return p.stdout, None


def parse_services(raw, now):
    """驗證並整理清單。回傳 (清單 dict 或 None, 錯誤訊息)。清單過期時兩個都有值。"""
    if raw is None or len(raw) > SVC_MAX_BYTES:
        return None, "內容太大或是空的"
    try:
        d = json.loads(raw.decode("utf-8"))
        if not isinstance(d, dict) or not isinstance(d.get("updated"), int):
            raise ValueError
    except (ValueError, UnicodeDecodeError):
        return None, "內容不是預期的格式"

    def rows(key):
        return [r for r in d.get(key) or [] if isinstance(r, dict) and isinstance(r.get("name"), str) and r["name"]]

    items = []
    for kind, label, key in (("container", "容器", "containers"), ("systemd", "系統服務", "systemd")):
        for r in rows(key)[:200]:
            name = clean(r["name"])
            title = clean(r.get("title") or name)
            items.append({
                "key": f"{kind}:{name}", "kind": kind, "label": label, "name": name,
                "show": title if title == name else f"{title}（{name}）",
                "status": r.get("status") if r.get("status") in ("ok", "warn", "bad") else "ok",
                "note": clean(r.get("note"), 120), "new": r.get("new") is True, "image": clean(r.get("image"), 60),
            })
    for r in [p for p in d.get("problems") or [] if isinstance(p, dict)][:10]:
        name = clean(r.get("name") or "盤點程式")
        items.append({"key": f"problem:{name}", "kind": "problem", "label": "盤點", "name": name, "show": name,
                      "status": r.get("status") if r.get("status") in ("warn", "bad") else "warn",
                      "note": clean(r.get("note"), 120), "new": False, "image": ""})
    domains = []
    for r in rows("domains")[:MAX_DOMAINS * 2]:
        name = clean(r["name"], 253).lower()
        if not HOSTNAME.match(name):
            continue
        domains.append({"key": f"domain:{name}", "kind": "domain", "label": "網域", "name": name, "show": name,
                        "skip": r.get("redirect_only") is True or r.get("ignored") is True, "new": r.get("new") is True})
    extra = []
    for r in [x for x in d.get("extra_checks") or [] if isinstance(x, dict)][:MAX_EXTRA]:
        url = clean(r.get("url"), 200)
        if url.startswith("https://"):
            extra.append({"name": clean(r.get("name") or url, 60), "url": url})
    dg = d.get("digest") if isinstance(d.get("digest"), dict) else {}

    def names(key):
        return [f"{clean(x.get('kind_label'), 10)} {clean(x.get('name'))}".strip()
                for x in dg.get(key) or [] if isinstance(x, dict)][:20]

    inv = {"updated": d["updated"], "items": items, "domains": domains, "extra": extra,
           "added": names("added"), "removed": names("removed")}
    age = now - d["updated"]
    if age > SVC_STALE:
        return inv, f"清單已 {int(age // 60)} 分鐘沒有更新"
    return inv, None


def domain_checks(domains, extra, static_urls):
    """由清單產生外部檢查：每個網域（跳過只做轉址／設定忽略的）GET https://<網域>/，加上額外指定的網址。"""
    out, seen = [], set(static_urls)
    for d in domains:
        if d.get("skip"):
            continue
        url = f"https://{d['name']}/"
        if url in seen:      # 已經有寫死的檢查（更嚴格），不重複
            continue
        seen.add(url)
        out.append({"name": f"網域 {d['name']}", "url": url, "kind": "domain", "domain": d["name"]})
        if len(out) >= MAX_DOMAINS:
            break
    for e in extra[:MAX_EXTRA]:
        if e["url"] not in seen:
            seen.add(e["url"])
            out.append({"name": f"額外 {e['name']}", "url": e["url"], "kind": "extra", "domain": None})
    return out


def track(st, failing, now_hm):
    """共用的「連續失敗才警報」計數。回傳 "alert"（這次該發警報）/ "recovered"（剛恢復）/ None。"""
    if not failing:
        was = st.get("alerted")
        st.update(fails=0, alerted=False, since=None)
        return "recovered" if was else None
    st["fails"] = st.get("fails", 0) + 1
    st["since"] = st.get("since") or now_hm
    if st["fails"] >= FAIL_THRESHOLD and not st.get("alerted"):
        return "alert"
    return None


def write_status(results, checks, svc_status):
    """給總覽頁讀的摘要。不含 token 或任何機密；只有檢查結果、服務清單的拉取狀況與主機用量。"""
    status = {
        "updated": int(time.time()),
        "host": os.uname().nodename,
        "threshold": FAIL_THRESHOLD,
        "telegram": bool(os.environ.get("TELEGRAM_BOT_TOKEN", "").strip() and os.environ.get("TELEGRAM_CHAT_ID", "").strip()),
        "checks": [dict(r, fails=checks[r["name"]]["fails"], alerted=checks[r["name"]]["alerted"]) for r in results],
        "services": svc_status,
        "host_stats": host_stats(),
    }
    tmp = os.path.join(STATE_DIR, "status.json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(status, f, ensure_ascii=False)
    os.replace(tmp, os.path.join(STATE_DIR, "status.json"))


def main():
    state = load_state()
    checks = state.setdefault("checks", {})
    now = datetime.now(TZ)
    now_ts, hm = int(time.time()), now.strftime("%H:%M")
    summary, results = [], []

    # --- 1. 拉取 A1 的服務清單 ---
    raw, pull_err = fetch_services_raw()
    configured = pull_err != "尚未設定拉取金鑰"
    inv = None
    if raw is not None:
        inv, pull_err = parse_services(raw, now_ts)
    if inv is not None:
        # 記住最近一次的網域與額外網址：A1 整台停機拉不到清單時，網域照樣檢查（那正是最需要檢查的時候）
        state["svc_cache"] = {"domains": inv["domains"], "extra": inv["extra"]}
    cache = state.get("svc_cache") or {"domains": [], "extra": []}
    fresh = inv is not None and pull_err is None

    # --- 2. 外部檢查：寫死的 + 清單裡的網域 + 額外網址 ---
    plan = [{"name": n, "url": u, "kind": "static", "domain": None, "codes": c, "needle": k} for n, u, c, k in CHECKS]
    for p in plan:   # 寫死的檢查如果剛好就是某網域的首頁，標上網域，總覽頁可以對應
        parts = urllib.parse.urlsplit(p["url"])
        if parts.path == "/" and any(d["name"] == parts.hostname for d in cache["domains"]):
            p["domain"] = parts.hostname
    plan += domain_checks(cache["domains"], cache["extra"], {p["url"] for p in plan})
    with ThreadPoolExecutor(max_workers=6) as pool:
        outcomes = list(pool.map(lambda p: check(p["url"], p["codes"], p["needle"]) if p["kind"] == "static"
                                 else check_alive(p["url"]), plan))

    down, up, mark = [], [], []
    for p, (ok, detail, ms) in zip(plan, outcomes):
        name = p["name"]
        st = checks.setdefault(name, {"fails": 0, "alerted": False, "since": None})
        results.append({"name": name, "ok": ok, "detail": detail, "ms": ms, "kind": p["kind"], "domain": p["domain"]})
        summary.append(f"{'OK ' if ok else 'NG '} {name}: {detail}" + (f" {ms}ms" if ms is not None else ""))
        since, fails = st.get("since") or hm, st.get("fails", 0) + 1
        event = track(st, not ok, hm)
        if event == "alert":
            down.append(f"🔴 {name} 異常（自 {since} 起連續 {fails} 次）：{detail}")
            mark.append(st)
        elif event == "recovered":
            up.append(f"✅ {name} 已恢復（{detail}）")
    active = {p["name"] for p in plan}
    for name in [n for n in checks if n not in active]:   # 網域從清單移除後，不再檢查
        if checks[name].get("alerted"):
            up.append(f"ℹ️ {name} 已不在檢查清單中，停止檢查")
        del checks[name]

    print(" ; ".join(summary))
    # 通知沒送成功（沒設定或 Telegram 暫時失敗）就不標記已警報，下一分鐘會再試
    if down and send_telegram("【看門狗】網站異常\n" + "\n".join(down) + "\n（來自站外檢查）"):
        for st in mark:
            st["alerted"] = True
    if up:
        send_telegram("【看門狗】\n" + "\n".join(up))

    # --- 3. 服務清單：拉不到／過期、服務異常、新服務 ---
    svc = state.setdefault("svc", {})
    pull = state.setdefault("svc_pull", {"fails": 0, "alerted": False, "since": None})
    notified = state.setdefault("svc_new", {})
    if configured:
        since, fails = pull.get("since") or hm, pull.get("fails", 0) + 1
        event = track(pull, not fresh, hm)
        if event == "alert":
            if send_telegram(f"【看門狗】A1 沒有回報服務清單\n🔴 自 {since} 起連續 {fails} 次：{pull_err}\n"
                             "可能是 A1 停機、盤點程式停了，或私有網路不通。這段期間無法得知容器是否正常。"):
                pull["alerted"] = True
        elif event == "recovered":
            send_telegram("【看門狗】\n✅ A1 的服務清單已恢復回報")
    if fresh:
        down, up, mark, fresh_new = [], [], [], []
        for it in inv["items"]:
            st = svc.setdefault(it["key"], {"fails": 0, "alerted": False, "since": None})
            st["show"] = it["show"]
            since, fails = st.get("since") or hm, st.get("fails", 0) + 1
            event = track(st, it["status"] == "bad", hm)
            if event == "alert":
                down.append(f"🔴 {it['label']} {it['show']} 異常（自 {since} 起連續 {fails} 次）：{it['note']}")
                mark.append(st)
            elif event == "recovered":
                up.append(f"✅ {it['label']} {it['show']} 已恢復（{it['note']}）")
        present = {it["key"] for it in inv["items"]}
        for key in [k for k in svc if k not in present]:
            if svc[key].get("alerted"):
                up.append(f"ℹ️ {svc[key].get('show') or key} 已從 A1 移除，不再追蹤")
            del svc[key]
        if down and send_telegram("【看門狗】VM 上的服務異常\n" + "\n".join(down) + "\n（來自 A1 的服務盤點）"):
            for st in mark:
                st["alerted"] = True
        if up:
            send_telegram("【看門狗】\n" + "\n".join(up))

        # 新服務：每個只通知一次，送出成功才記下來
        for it in inv["items"] + inv["domains"]:
            if it["new"] and it["key"] not in notified:
                extra = f"（映像 {it['image']}）" if it.get("image") else ""
                if it["kind"] == "domain":
                    extra = "（只做轉址或已設定忽略，不做外部檢查）" if it.get("skip") else "（已自動加入外部檢查）"
                fresh_new.append((it["key"], f"🆕 {it['label']} {it['show']}{extra}"))
        if fresh_new and send_telegram("【看門狗】發現新服務\n" + "\n".join(line for _, line in fresh_new[:20])
                                       + "\n已自動納入監控，如需補充網址請告訴我。"):
            for key, _ in fresh_new[:20]:
                notified[key] = now_ts
        for key in [k for k, t in notified.items() if now_ts - t > NOTIFIED_KEEP]:
            del notified[key]

    # --- 4. 每日回報 ---
    today = now.strftime("%Y-%m-%d")
    if HEARTBEAT_HOUR >= 0 and now.hour >= HEARTBEAT_HOUR and state.get("heartbeat") != today:
        bad = [n for n, s in checks.items() if s["alerted"]] + [s.get("show") or k for k, s in svc.items() if s.get("alerted")]
        lines = [f"【看門狗】每日回報：{'全部正常' if not bad else '異常中：' + '、'.join(bad)}（{len(plan)} 項外部檢查）"]
        if fresh:
            its = [i for i in inv["items"] if i["kind"] != "problem"]
            n_bad = sum(1 for i in inv["items"] if i["status"] == "bad")
            n_warn = sum(1 for i in inv["items"] if i["status"] == "warn")
            lines.append(f"VM 上的服務：共 {len(its)} 個，異常 {n_bad} 個、需注意 {n_warn} 個；網域 {len(inv['domains'])} 個")
            lines.append("過去 24 小時新增：" + ("、".join(inv["added"]) or "無") + "；消失：" + ("、".join(inv["removed"]) or "無"))
        elif configured:
            lines.append(f"VM 上的服務：A1 沒有回報服務清單（{pull_err}）")
        if send_telegram("\n".join(lines)):
            state["heartbeat"] = today

    svc_status = {"configured": configured, "ok": fresh, "error": None if fresh else pull_err,
                  "fails": pull.get("fails", 0), "alerted": bool(pull.get("alerted")),
                  "list_updated": inv["updated"] if inv else None,
                  "alerting": [s.get("show") or k for k, s in svc.items() if s.get("alerted")]}
    if fresh:
        svc_status.update(total=sum(1 for i in inv["items"] if i["kind"] != "problem"),
                          bad=sum(1 for i in inv["items"] if i["status"] == "bad"),
                          warn=sum(1 for i in inv["items"] if i["status"] == "warn"))
    print(f"服務清單：{'正常' if fresh else pull_err}")
    save_state(state)
    write_status(results, checks, svc_status)


if __name__ == "__main__":
    main()
