#!/usr/bin/env python3
"""Oracle Always Free 閒置回收風險監控。

Oracle 的判定（官方 Always Free Resources 頁面）：7 天內 CPU 第 95 百分位、
網路使用率、記憶體使用率（僅 A1）三項「同時」低於 20%，就可能被回收。

這支程式由 systemd timer 每分鐘執行一次：
1. 讀 /proc 取得 CPU、記憶體、網路的當下使用率，附加到樣本檔。
2. 只保留最近 7 天的樣本，算三項的第 95 百分位。
3. 三項都低於「警戒值」（預設 25%，比 Oracle 的 20% 多留一點緩衝）時，
   對 Uptime Kuma 的 Push 監控回報 down，由 Kuma 發通知。

環境變數（寫在 /etc/chijiun-monitor.env）：
  IDLE_PUSH_URL        Uptime Kuma Push 監控的網址（不含 query）。沒設就只印出結果。
  IDLE_ALERT_PERCENT   警戒值，預設 25。
  IDLE_LINK_MBPS       網卡頻寬（Mbit/s），算網路使用率用，預設 1000。這是估計值。
  IDLE_MIN_DAYS        樣本至少累積幾天才會發 down，預設 1（避免剛安裝時誤報）。
"""
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

WINDOW_SECONDS = 7 * 24 * 3600
OFFICIAL_THRESHOLD = 20.0


def read_cpu():
    """回傳 (total, idle) jiffies。"""
    with open("/proc/stat") as f:
        parts = f.readline().split()[1:9]
    values = [int(x) for x in parts]
    total = sum(values)
    idle = values[3] + values[4]  # idle + iowait
    return total, idle


def read_mem_percent():
    info = {}
    with open("/proc/meminfo") as f:
        for line in f:
            key, _, rest = line.partition(":")
            info[key] = int(rest.split()[0])
    return 100.0 * (1.0 - info["MemAvailable"] / info["MemTotal"])


def read_net_bytes():
    """所有實體網卡的 rx+tx bytes；排除 lo 與 docker 的虛擬網卡。"""
    total = 0
    with open("/proc/net/dev") as f:
        for line in list(f)[2:]:
            name, _, rest = line.partition(":")
            name = name.strip()
            if name == "lo" or name.startswith(("docker", "veth", "br-")):
                continue
            fields = rest.split()
            total += int(fields[0]) + int(fields[8])
    return total


def percentile95(values):
    """nearest-rank 第 95 百分位。"""
    ordered = sorted(values)
    index = math.ceil(0.95 * len(ordered)) - 1
    return ordered[max(index, 0)]


def trim(samples, now):
    cutoff = now - WINDOW_SECONDS
    return [s for s in samples if s[0] >= cutoff]


def summarize(samples, alert_percent, min_days, now):
    """回傳 (status, message, cpu_p95)。samples: [(ts, cpu, mem, net), ...]"""
    if not samples:
        return "up", "尚無樣本，累積中", 0.0
    days = (now - samples[0][0]) / 86400.0
    cpu = percentile95([s[1] for s in samples])
    mem = percentile95([s[2] for s in samples])
    net = percentile95([s[3] for s in samples])
    detail = (
        f"CPU p95 {cpu:.1f}% / 記憶體 p95 {mem:.1f}% / 網路 p95 {net:.2f}%"
        f"（Oracle 門檻 {OFFICIAL_THRESHOLD:.0f}%、警戒 {alert_percent:.0f}%）"
        f"，樣本 {days:.1f} 天"
    )
    if days < min_days:
        return "up", f"累積中（未滿 {min_days:g} 天）：{detail}", cpu
    if cpu < alert_percent and mem < alert_percent and net < alert_percent:
        return "down", f"接近閒置回收門檻：{detail}", cpu
    return "up", detail, cpu


def load_samples(path):
    samples = []
    try:
        with open(path) as f:
            for line in f:
                parts = line.strip().split(",")
                if len(parts) == 4:
                    samples.append((int(parts[0]), float(parts[1]), float(parts[2]), float(parts[3])))
    except FileNotFoundError:
        pass
    return samples


def write_atomic(path, text):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        f.write(text)
    os.replace(tmp, path)


def push(url, status, message, ping):
    query = urllib.parse.urlencode({"status": status, "msg": message[:240], "ping": f"{ping:.1f}"})
    sep = "&" if "?" in url else "?"
    with urllib.request.urlopen(f"{url}{sep}{query}", timeout=20) as resp:
        resp.read()


def main():
    state_dir = os.environ.get("STATE_DIRECTORY", "/var/lib/chijiun-monitor")
    os.makedirs(state_dir, exist_ok=True)
    state_path = os.path.join(state_dir, "last.json")
    samples_path = os.path.join(state_dir, "samples.csv")

    alert_percent = float(os.environ.get("IDLE_ALERT_PERCENT", "25"))
    link_mbps = float(os.environ.get("IDLE_LINK_MBPS", "1000"))
    min_days = float(os.environ.get("IDLE_MIN_DAYS", "1"))
    push_url = os.environ.get("IDLE_PUSH_URL", "").strip()

    now = int(time.time())
    cpu_total, cpu_idle = read_cpu()
    net_bytes = read_net_bytes()
    mem = read_mem_percent()

    previous = None
    try:
        with open(state_path) as f:
            previous = json.load(f)
    except (FileNotFoundError, ValueError):
        pass
    write_atomic(
        state_path,
        json.dumps({"ts": now, "cpu_total": cpu_total, "cpu_idle": cpu_idle, "net_bytes": net_bytes}),
    )

    samples = load_samples(samples_path)
    if previous:
        elapsed = now - previous["ts"]
        d_total = cpu_total - previous["cpu_total"]
        d_idle = cpu_idle - previous["cpu_idle"]
        d_net = net_bytes - previous["net_bytes"]
        # 計數器歸零（重開機）或時間異常就略過這一筆
        if elapsed > 0 and d_total > 0 and d_idle >= 0 and d_net >= 0:
            cpu = 100.0 * (1.0 - d_idle / d_total)
            net = 100.0 * (d_net * 8.0 / elapsed) / (link_mbps * 1e6)
            samples.append((now, cpu, mem, net))

    samples = trim(samples, now)
    write_atomic(samples_path, "".join(f"{t},{c:.3f},{m:.3f},{n:.4f}\n" for t, c, m, n in samples))

    status, message, ping = summarize(samples, alert_percent, min_days, now)
    print(f"{status}: {message}")
    if push_url:
        try:
            push(push_url, status, message, ping)
        except (urllib.error.URLError, OSError) as exc:
            print(f"回報 Uptime Kuma 失敗：{exc}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
