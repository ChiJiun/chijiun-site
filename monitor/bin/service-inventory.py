#!/usr/bin/env python3
"""服務自動盤點：列出這台 VM 上跑了哪些服務，給總覽頁與站外看門狗用。

由 systemd timer 每分鐘執行一次，全程唯讀（只執行 docker ps / docker inspect / systemctl show，
不會啟動、停止或重啟任何東西）：
1. 容器：`docker inspect` 用固定的格式範本只取需要的欄位，
   不讀環境變數、啟動指令、掛載路徑，所以機密不會進到這支程式或它的輸出。
2. 網域：解析 /etc/caddy/Caddyfile 的站點標頭。basic_auth 區塊的內容完全跳過（裡面有密碼雜湊）。
3. systemd 服務：/etc/systemd/system 底下自己放的常駐服務（非 oneshot、非 snap），
   加上設定檔 `systemd` 欄位列出的。
4. 與上次的狀態比對，標出「新發現」「重啟變多」「消失」，寫出：
   - $RUNTIME_DIRECTORY/services.json（再由 root 複製到 /run/chijiun-hub/，總覽頁與小主機讀取；不含機密）
   - $STATE_DIRECTORY/services-state.json（每個項目第一次看到的時間、重啟次數基準、新增／消失事件）

第一次執行（還沒有狀態檔）會把當下看到的全部當成「已知基準」（baseline），不會標成新發現。

人工補充放在 repo 的 monitor/services.json（可以沒有這個檔），格式見 monitor/README.md。

環境變數（測試用，平常不用設）：
  INVENTORY_CONFIG   設定檔路徑，預設是這支程式上一層的 services.json
  CADDYFILE          預設 /etc/caddy/Caddyfile
  SYSTEMD_DIR        預設 /etc/systemd/system
"""
import calendar
import fnmatch
import json
import os
import re
import subprocess
import sys
import time

NEW_DAYS = 7                 # 第一次看到後幾天內標「新發現」
STARTING_GRACE = 300         # health=starting 超過這麼久就提醒
RESTART_WINDOW = 15 * 60     # 這段時間內重啟次數有增加就提醒
MISSING_RUNS = 3             # 連續幾次沒看到才算「消失」（避免重新部署的空檔被當成消失）
FORGET_AFTER = 30 * 86400    # 消失超過這麼久才忘記（期間再出現不算新發現）
EVENT_KEEP = 8 * 86400
DIGEST_WINDOW = 24 * 3600
AUTO_RESTART = {"always", "unless-stopped", "on-failure"}
KIND_LABEL = {"container": "容器", "domain": "網域", "systemd": "系統服務"}

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.environ.get("INVENTORY_CONFIG", os.path.join(HERE, "..", "services.json"))
CADDYFILE = os.environ.get("CADDYFILE", "/etc/caddy/Caddyfile")
SYSTEMD_DIR = os.environ.get("SYSTEMD_DIR", "/etc/systemd/system")

# 只取這些欄位。刻意不碰 .Config.Env、.Config.Cmd、.Args、.Mounts、健康檢查的輸出（.State.Health.Log）。
INSPECT_FORMAT = (
    '{"name":{{json .Name}},"image":{{json .Config.Image}},'
    '"project":{{json (index .Config.Labels "com.docker.compose.project")}},'
    '"service":{{json (index .Config.Labels "com.docker.compose.service")}},'
    '"state":{{json .State.Status}},"exit":{{json .State.ExitCode}},'
    '"started":{{json .State.StartedAt}},'
    '"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},'
    '"restart":{{json .HostConfig.RestartPolicy.Name}},"restarts":{{json .RestartCount}},'
    '"ports":{{json .NetworkSettings.Ports}}}'
)


# ---------- 設定檔 ----------
def load_config(path=CONFIG_PATH):
    """讀人工補充的設定；檔案不存在或格式不對都回傳空設定，不影響盤點。"""
    cfg = {"names": {}, "projects": {}, "ignore": [], "ignore_domains": [], "systemd": [], "extra_urls": []}
    try:
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
    except FileNotFoundError:
        return cfg
    except (OSError, ValueError) as e:
        print(f"設定檔 {path} 讀取失敗，當作沒有設定：{type(e).__name__}", file=sys.stderr)
        return cfg
    if not isinstance(raw, dict):
        return cfg
    for key in ("names", "projects"):
        if isinstance(raw.get(key), dict):
            cfg[key] = raw[key]
    for key in ("ignore", "ignore_domains", "systemd"):
        if isinstance(raw.get(key), list):
            cfg[key] = [str(x) for x in raw[key] if isinstance(x, str) and x.strip()]
    for item in raw.get("extra_urls") or []:
        if isinstance(item, dict) and isinstance(item.get("url"), str) and item["url"].startswith("https://"):
            cfg["extra_urls"].append({"name": str(item.get("name") or item["url"])[:60], "url": item["url"][:200]})
    return cfg


def describe(cfg, name):
    """回傳 (白話名稱, 用途說明)。設定檔的值可以是字串或 {"title":…, "desc":…}。"""
    v = cfg["names"].get(name)
    if isinstance(v, str):
        return v, ""
    if isinstance(v, dict):
        return str(v.get("title") or name), str(v.get("desc") or "")
    return name, ""


def ignored(name, patterns):
    return any(fnmatch.fnmatchcase(name, p) for p in patterns)


# ---------- 收集：容器 ----------
def run(cmd, timeout=20):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)


def collect_containers():
    """回傳 (清單, 錯誤訊息)。讀不到 Docker 時清單是 None。"""
    try:
        ids = run(["docker", "ps", "-aq", "--no-trunc"])
        if ids.returncode != 0:
            return None, "docker ps 失敗"
        id_list = ids.stdout.split()
        if not id_list:
            return [], None
        out = run(["docker", "inspect", "--format", INSPECT_FORMAT] + id_list)
    except (OSError, subprocess.SubprocessError) as e:
        return None, f"無法執行 docker：{type(e).__name__}"
    rows = []
    for line in out.stdout.splitlines():
        try:
            rows.append(json.loads(line))
        except ValueError:
            continue
    # inspect 途中剛好有容器被刪掉會回傳非 0，但其他容器的資料仍可用
    if out.returncode != 0 and not rows:
        return None, "docker inspect 失敗"
    return rows, None


def parse_time(s):
    """Docker 的時間（2026-11-16T15:18:04.179480162Z）轉成 epoch 秒；沒有值回傳 None。"""
    if not isinstance(s, str) or s.startswith("0001-"):
        return None
    try:
        return calendar.timegm(time.strptime(s[:19], "%Y-%m-%dT%H:%M:%S"))
    except ValueError:
        return None


def clean_image(image):
    """映像名稱去掉 digest；只有 sha256 的話留短碼。"""
    image = str(image or "")
    image = image.split("@", 1)[0]
    if image.startswith("sha256:"):
        return image[:19]
    return image[:120]


def format_ports(ports):
    """回傳 (對應到主機的埠清單, 是否有對外開放)。只在容器內部開的埠不列。"""
    out, public = [], False
    for cport, binds in sorted((ports or {}).items()):
        for b in binds or []:
            ip, hp = b.get("HostIp") or "0.0.0.0", b.get("HostPort") or ""
            if ip in ("0.0.0.0", "::", ""):
                public = True
                ip = "0.0.0.0"
            text = f"{ip}:{hp}->{cport}"
            if text not in out:
                out.append(text)
    return out[:20], public


def normalize_container(raw):
    ports, public = format_ports(raw.get("ports"))
    return {
        "name": str(raw.get("name") or "").lstrip("/")[:100],
        "project": str(raw.get("project") or "")[:80],
        "service": str(raw.get("service") or "")[:80],
        "image": clean_image(raw.get("image")),
        "state": str(raw.get("state") or "unknown"),
        "exit_code": raw.get("exit") if isinstance(raw.get("exit"), int) else None,
        "health": raw.get("health") if isinstance(raw.get("health"), str) else None,
        "restart_policy": str(raw.get("restart") or "no"),
        "restart_count": raw.get("restarts") if isinstance(raw.get("restarts"), int) else 0,
        "started_at": parse_time(raw.get("started")),
        "ports": ports,
        "public_ports": public,
    }


# ---------- 收集：Caddy 網域 ----------
HANDLERS = {"reverse_proxy", "file_server", "respond", "php_fastcgi", "import", "templates", "invoke", "forward_auth"}
SECRET_BLOCKS = {"basic_auth", "basicauth"}
LOCAL_UPSTREAM = re.compile(r"^(?:127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})$")
HOSTNAME = re.compile(r"^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$")


def site_hosts(tokens):
    """站點標頭的位址轉成網域清單；:80、IP、萬用字元、localhost 這類不是網域的都略過。"""
    hosts = []
    for tok in tokens:
        for addr in tok.split(","):
            addr = addr.strip().lower()
            addr = re.sub(r"^https?://", "", addr).split("/", 1)[0]
            addr = re.sub(r":\d+$", "", addr)
            if HOSTNAME.match(addr) and not re.match(r"^[\d.]+$", addr) and addr not in hosts:
                hosts.append(addr)
    return hosts


def parse_caddyfile(text):
    """回傳 [{hosts, redirect_only, upstream_ports}]。

    只認得「一行一個指令、大括號獨立成 token」的常見寫法。basic_auth 區塊內的行完全不看，
    其他行也只取第一個字（指令名稱）與 reverse_proxy 後面的本機位址，所以雜湊不會被帶出去。
    """
    sites, stack, cur = [], [], None
    for raw in text.splitlines():
        toks = raw.split()
        for i, t in enumerate(toks):          # 去掉註解
            if t.startswith("#"):
                toks = toks[:i]
                break
        if not toks:
            continue
        if toks[0] == "}":
            if stack:
                stack.pop()
            if not stack:
                cur = None
            if toks[-1] != "{":
                continue
            toks = toks[1:]                   # 「} else {」這類寫法：關一層再開一層
            if not stack and toks == ["{"]:
                continue
        opens = toks[-1] == "{"
        if not stack:
            if not opens:
                continue
            head = toks[:-1]
            if not head:
                stack.append("(global)")
            elif head[0].startswith("("):
                stack.append("(snippet)")
            else:
                cur = {"hosts": site_hosts(head), "directives": set(), "upstream_ports": []}
                sites.append(cur)
                stack.append("(site)")
            continue
        secret = any(s in SECRET_BLOCKS for s in stack)
        if cur is not None and not secret:
            cur["directives"].add(toks[0])
            if toks[0] == "reverse_proxy":
                for t in toks[1:]:
                    m = LOCAL_UPSTREAM.match(t)
                    if m and int(m.group(1)) not in cur["upstream_ports"]:
                        cur["upstream_ports"].append(int(m.group(1)))
        if opens:
            stack.append(toks[0])
    out = []
    for s in sites:
        if not s["hosts"]:
            continue
        handlers = s["directives"] & HANDLERS
        out.append({"hosts": s["hosts"], "redirect_only": "redir" in s["directives"] and not handlers,
                    "upstream_ports": s["upstream_ports"]})
    return out


def collect_domains(path=CADDYFILE):
    """回傳 (清單, 錯誤訊息)。讀不到 Caddyfile 時清單是 None。"""
    try:
        with open(path, encoding="utf-8") as f:
            sites = parse_caddyfile(f.read())
    except (OSError, UnicodeDecodeError) as e:
        return None, f"讀不到 Caddyfile：{type(e).__name__}"
    domains = {}
    for s in sites:
        for h in s["hosts"]:
            domains.setdefault(h, {"name": h, "redirect_only": s["redirect_only"], "upstream_ports": s["upstream_ports"]})
    return list(domains.values()), None


# ---------- 收集：systemd 服務 ----------
UNIT_NAME = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.@:-]{0,120}$")
SHOW_PROPS = "Id,Type,LoadState,ActiveState,SubState,UnitFileState,NRestarts,ActiveEnterTimestampMonotonic"


def systemctl_show(unit):
    try:
        out = run(["systemctl", "show", unit, "-p", SHOW_PROPS], timeout=10)
    except (OSError, subprocess.SubprocessError):
        return None
    if out.returncode != 0:
        return None
    return dict(line.split("=", 1) for line in out.stdout.splitlines() if "=" in line)


def uptime_seconds():
    try:
        with open("/proc/uptime") as f:
            return float(f.read().split()[0])
    except (OSError, ValueError):
        return None


def collect_systemd(cfg, directory=SYSTEMD_DIR):
    """自己放在 /etc/systemd/system 的常駐服務（一般檔案、非 snap、非 oneshot），加上設定檔指定的。"""
    wanted = {}  # 單元名稱 -> 是否為設定檔指定
    try:
        for e in os.scandir(directory):
            n = e.name
            if (n.endswith(".service") and "@" not in n and not n.startswith("snap.")
                    and e.is_file(follow_symlinks=False)):
                wanted[n] = False
    except OSError:
        pass
    for n in cfg["systemd"]:
        if UNIT_NAME.match(n):   # 名稱會當成 systemctl 的參數，只接受單純的單元名稱
            wanted[n if n.endswith(".service") else n + ".service"] = True
    up, now, out = uptime_seconds(), time.time(), []
    for unit, explicit in sorted(wanted.items()):
        p = systemctl_show(unit)
        if p is None:
            continue
        if not explicit and (p.get("LoadState") != "loaded" or p.get("Type") == "oneshot"):
            continue
        started = None
        try:
            mono = int(p.get("ActiveEnterTimestampMonotonic") or 0) / 1e6
            if mono and up is not None and p.get("ActiveState") == "active":
                started = int(now - (up - mono))
        except ValueError:
            pass
        out.append({
            "name": unit[:100], "load": p.get("LoadState", ""), "active": p.get("ActiveState", ""),
            "sub": p.get("SubState", ""), "enabled": p.get("UnitFileState", ""),
            "restart_count": int(p["NRestarts"]) if p.get("NRestarts", "").isdigit() else 0,
            "started_at": started,
        })
    return out


# ---------- 判斷 ----------
RANK = {"ok": 0, "warn": 1, "bad": 2}


def worse(a, b):
    return a if RANK[a] >= RANK[b] else b


def track_restarts(st, count, now):
    """比對重啟次數。回傳 None / "warn"（最近有自動重啟）/ "bad"（連續增加，疑似一直當掉重啟）。"""
    prev = st.get("restarts")
    times = [t for t in st.get("inc_times", []) if now - t <= RESTART_WINDOW]
    if isinstance(prev, int) and count > prev:
        times.append(now)
        st["streak"] = st.get("streak", 0) + 1
    else:
        st["streak"] = 0      # 次數變小代表容器被重建，重設基準
    st["restarts"], st["inc_times"] = count, times
    if st["streak"] >= 2 or len(times) >= 3:
        return "bad"
    return "warn" if times else None


def minutes(sec):
    return max(1, int(round(sec / 60)))


def judge_container(c, st, now):
    """回傳 (status, note)。規則見 monitor/README.md「服務自動盤點」。"""
    state, policy, code = c["state"], c["restart_policy"], c["exit_code"]
    if state == "running":
        if c["health"] == "unhealthy":
            status, note = "bad", "執行中，但健康檢查失敗（unhealthy）"
        elif c["health"] == "starting":
            age = now - c["started_at"] if c["started_at"] else 0
            if age > STARTING_GRACE:
                status, note = "warn", f"啟動 {minutes(age)} 分鐘了，健康檢查還沒通過"
            else:
                status, note = "ok", "剛啟動，健康檢查進行中"
        else:
            status, note = "ok", "執行中，健康檢查通過" if c["health"] == "healthy" else "執行中"
    elif state == "paused":
        status, note = "warn", "被暫停（paused）"
    elif policy in AUTO_RESTART:
        if policy == "on-failure" and state == "exited" and code == 0:
            status, note = "ok", "已正常結束（只在失敗時才會自動重啟）"
        else:
            tail = f"，結束代碼 {code}" if state in ("exited", "dead") and code is not None else ""
            status, note = "bad", f"應該常駐卻沒有在跑（狀態 {state}{tail}）"
    elif state == "created" or (state == "exited" and code == 0):
        status, note = "ok", "一次性工作，已正常結束" if state == "exited" else "已建立但沒有啟動（一次性）"
    else:
        tail = f"，結束代碼 {code}" if code is not None else ""
        status, note = "warn", f"一次性容器沒有正常結束（狀態 {state}{tail}）"
    r = track_restarts(st, c["restart_count"], now)
    if r == "bad":
        status, note = "bad", note + "；重啟次數持續增加，疑似一直當掉重啟"
    elif r == "warn":
        status, note = worse(status, "warn"), note + f"；最近 {RESTART_WINDOW // 60} 分鐘內自動重啟過"
    return status, note


def judge_systemd(u, st, now):
    active, sub = u["active"], u["sub"]
    if u["load"] != "loaded":
        return "warn", "設定檔有列這個服務，但系統上找不到"
    if active == "active":
        status, note = "ok", "執行中"
    elif active == "failed":
        status, note = "bad", "啟動失敗或異常結束（failed）"
    elif active in ("activating", "deactivating", "reloading"):
        status, note = "warn", f"狀態轉換中（{active}/{sub}）"
    elif u["enabled"] in ("enabled", "enabled-runtime"):
        status, note = "bad", "設定為開機啟動，但現在沒有在跑"
    else:
        status, note = "ok", "沒有在跑（未設定開機啟動）"
    r = track_restarts(st, u["restart_count"], now)
    if r == "bad":
        status, note = "bad", note + "；重啟次數持續增加，疑似一直當掉重啟"
    elif r == "warn":
        status, note = worse(status, "warn"), note + f"；最近 {RESTART_WINDOW // 60} 分鐘內自動重啟過"
    return status, note


def reconcile(kind, present, state, now, first_run):
    """更新某一類項目的 first_seen／消失紀錄。present 是 {名稱: 顯示名稱}。回傳目前存在項目的狀態字典。"""
    items, events = state["items"], state["events"]
    for name in present:
        key = f"{kind}:{name}"
        st = items.get(key)
        if st is None:
            st = items[key] = {"first_seen": now, "baseline": bool(first_run)}
            if not first_run:
                events.append({"t": now, "type": "added", "kind": kind, "name": name})
        elif st.get("gone_since"):
            st["gone_since"] = None
            events.append({"t": now, "type": "added", "kind": kind, "name": name})
        st["missing"], st["last_seen"] = 0, now
    for key in [k for k in items if k.startswith(kind + ":")]:
        name, st = key.split(":", 1)[1], items[key]
        if name in present:
            continue
        if st.get("gone_since"):
            if now - st["gone_since"] > FORGET_AFTER:
                del items[key]
            continue
        st["missing"] = st.get("missing", 0) + 1
        if st["missing"] >= MISSING_RUNS:
            st["gone_since"] = now
            events.append({"t": now, "type": "removed", "kind": kind, "name": name})
    return {name: items[f"{kind}:{name}"] for name in present}


def is_new(st, now):
    return (not st.get("baseline")) and now - st.get("first_seen", 0) < NEW_DAYS * 86400


def build_digest(events, now):
    """過去 24 小時淨新增／消失的項目（期間內出現又消失、或消失又回來的不列）。"""
    seq = {}
    for e in events:
        if now - e["t"] <= DIGEST_WINDOW:
            seq.setdefault((e["kind"], e["name"]), []).append(e["type"])
    added, removed = [], []
    for (kind, name), types in sorted(seq.items()):
        item = {"kind": kind, "kind_label": KIND_LABEL.get(kind, kind), "name": name}
        if types[0] == "added" and types[-1] == "added":
            added.append(item)
        elif types[0] == "removed" and types[-1] == "removed":
            removed.append(item)
    return {"window_hours": DIGEST_WINDOW // 3600, "added": added, "removed": removed}


def build(now, cfg, state, raw_containers, docker_err, domains, caddy_err, units):
    """純函式：依收集到的資料與上次的狀態，產生要輸出的 services.json 內容（同時更新 state）。"""
    first_run = not state.get("baseline_at")
    if first_run:
        state.update(version=1, baseline_at=now)
    state.setdefault("items", {})
    state.setdefault("events", [])
    problems = []

    # --- 容器 ---
    containers = []
    if raw_containers is None:
        problems.append({"status": "bad", "name": "Docker", "note": f"讀不到容器清單（{docker_err}），容器狀態未知"})
    else:
        rows = [normalize_container(r) for r in raw_containers]
        rows = [c for c in rows if c["name"] and not ignored(c["name"], cfg["ignore"])]
        sts = reconcile("container", {c["name"]: 1 for c in rows}, state, now, first_run)
        for c in sorted(rows, key=lambda c: (c["project"] == "", c["project"], c["name"])):
            st = sts[c["name"]]
            status, note = judge_container(c, st, now)
            title, desc = describe(cfg, c["name"])
            containers.append(dict(
                c, key="container:" + c["name"], title=title, desc=desc, status=status, note=note,
                project_title=str(cfg["projects"].get(c["project"]) or c["project"] or ""),
                first_seen=st["first_seen"], baseline=bool(st.get("baseline")), new=is_new(st, now)))

    # --- systemd 服務 ---
    services = []
    units = [u for u in units if not ignored(u["name"], cfg["ignore"])]
    sts = reconcile("systemd", {u["name"]: 1 for u in units}, state, now, first_run)
    for u in units:
        st = sts[u["name"]]
        status, note = judge_systemd(u, st, now)
        title, desc = describe(cfg, u["name"])
        services.append(dict(
            u, key="systemd:" + u["name"], title=title, desc=desc, status=status, note=note,
            first_seen=st["first_seen"], baseline=bool(st.get("baseline")), new=is_new(st, now)))

    # --- 網域 ---
    out_domains = []
    if domains is None:
        problems.append({"status": "warn", "name": "Caddyfile", "note": f"{caddy_err}，網域清單沿用上次的結果"})
        domains = [dict(st["last"], name=k.split(":", 1)[1]) for k, st in state["items"].items()
                   if k.startswith("domain:") and not st.get("gone_since") and isinstance(st.get("last"), dict)]
        sts = {d["name"]: state["items"]["domain:" + d["name"]] for d in domains}
    else:
        sts = reconcile("domain", {d["name"]: 1 for d in domains}, state, now, first_run)
    port_owner = {}
    for c in containers:
        for p in c["ports"]:
            port_owner[p.split("->")[0].rsplit(":", 1)[-1]] = c["name"]
    for d in sorted(domains, key=lambda d: d["name"]):
        st = sts[d["name"]]
        st["last"] = {"redirect_only": bool(d.get("redirect_only")), "upstream_ports": list(d.get("upstream_ports") or [])}
        skip = ignored(d["name"], cfg["ignore_domains"])
        targets = [port_owner[str(p)] for p in d.get("upstream_ports") or [] if str(p) in port_owner]
        if skip:
            note = "已設定不做外部檢查（monitor/services.json 的 ignore_domains）"
        elif d.get("redirect_only"):
            note = "只做轉址，不另外做外部檢查"
        else:
            note = "由站外看門狗每分鐘從外面檢查"
        title, desc = describe(cfg, d["name"])
        out_domains.append({
            "key": "domain:" + d["name"], "name": d["name"], "title": title, "desc": desc,
            "redirect_only": bool(d.get("redirect_only")), "ignored": skip,
            "upstream_ports": list(d.get("upstream_ports") or []), "targets": sorted(set(targets)),
            "status": "ok", "note": note,
            "first_seen": st["first_seen"], "baseline": bool(st.get("baseline")), "new": is_new(st, now)})

    state["events"] = [e for e in state["events"] if now - e["t"] <= EVENT_KEEP]
    items = containers + services
    count = lambda s: sum(1 for i in items if i["status"] == s) + sum(1 for p in problems if p["status"] == s)  # noqa: E731
    return {
        "version": 1,
        "updated": int(now),
        "host": os.uname().nodename if hasattr(os, "uname") else "",
        "baseline_at": int(state["baseline_at"]),
        "summary": {"total": len(items), "containers": len(containers), "systemd": len(services),
                    "domains": len(out_domains), "ok": count("ok"), "warn": count("warn"), "bad": count("bad"),
                    "new": sum(1 for i in items + out_domains if i["new"])},
        "problems": problems,
        "containers": containers,
        "systemd": services,
        "domains": out_domains,
        "extra_checks": cfg["extra_urls"][:20],
        "digest": build_digest(state["events"], now),
    }


# ---------- 讀寫 ----------
def load_state(path):
    """沒有狀態檔、或檔案壞掉，都當作第一次執行（全部視為已知基準），避免誤報一堆「新服務」。"""
    try:
        with open(path, encoding="utf-8") as f:
            state = json.load(f)
        if isinstance(state, dict) and isinstance(state.get("items"), dict) and isinstance(state.get("events"), list):
            return state
    except FileNotFoundError:
        pass
    except (OSError, ValueError) as e:
        print(f"狀態檔讀取失敗，重新建立基準：{type(e).__name__}", file=sys.stderr)
    return {}


def write_json(path, data, mode=0o644):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.chmod(tmp, mode)
    os.replace(tmp, path)


def main():
    state_path = os.path.join(os.environ.get("STATE_DIRECTORY", "."), "services-state.json")
    out_path = os.path.join(os.environ.get("RUNTIME_DIRECTORY", "."), "services.json")
    now = int(time.time())
    cfg = load_config()
    state = load_state(state_path)
    raw_containers, docker_err = collect_containers()
    domains, caddy_err = collect_domains()
    units = collect_systemd(cfg)
    out = build(now, cfg, state, raw_containers, docker_err, domains, caddy_err, units)
    write_json(state_path, state)
    write_json(out_path, out)
    s = out["summary"]
    print(f"容器 {s['containers']}、系統服務 {s['systemd']}、網域 {s['domains']}；"
          f"正常 {s['ok']}、注意 {s['warn']}、異常 {s['bad']}、新發現 {s['new']}"
          + ("；" + "；".join(p["note"] for p in out["problems"]) if out["problems"] else ""))


if __name__ == "__main__":
    main()
