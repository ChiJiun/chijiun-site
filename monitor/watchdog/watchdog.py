#!/usr/bin/env python3
"""站外看門狗：放在另一台 VM 上，定時檢查網站，連續失敗才用 Telegram 通知。

設計重點：
- 只用標準函式庫；每分鐘由 systemd timer 執行一次，狀態存在 $STATE_DIRECTORY/state.json。
- 連續失敗 FAIL_THRESHOLD 次（預設 3，約 3 分鐘）才發出警報，恢復時發一則通知，避免瞬間抖動。
- 每天固定時段（HEARTBEAT_HOUR，台北時間）發一則「看門狗還活著」，看門狗自己掛了也能從沒收到而察覺。
- 沒設定 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 時只寫日誌（journalctl），不會報錯。
"""
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
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


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):  # 不跟隨轉址，直接看原始狀態碼
        return None


def check(url, ok_codes, needle):
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
    if code not in ok_codes:
        return False, f"HTTP {code}（預期 {'/'.join(map(str, sorted(ok_codes)))}）", ms
    if needle and needle.encode() not in body:
        return False, f"HTTP {code} 但內容不含「{needle}」", ms
    return True, f"HTTP {code}", ms


def send_telegram(text):
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat:
        print("[未設定 Telegram，只寫日誌]", text.replace("\n", " | "))
        return False
    data = urllib.parse.urlencode({"chat_id": chat, "text": text, "disable_web_page_preview": "true"}).encode()
    try:
        urllib.request.urlopen(f"https://api.telegram.org/bot{token}/sendMessage", data=data, timeout=15).read()
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


def main():
    state = load_state()
    checks = state.setdefault("checks", {})
    now = datetime.now(TZ)
    lines_down, lines_up, summary, pending_alert = [], [], [], []

    for name, url, codes, needle in CHECKS:
        ok, detail, ms = check(url, codes, needle)
        st = checks.setdefault(name, {"fails": 0, "alerted": False, "since": None})
        summary.append(f"{'OK ' if ok else 'NG '} {name}: {detail}" + (f" {ms}ms" if ms is not None else ""))
        if ok:
            if st["alerted"]:
                lines_up.append(f"✅ {name} 已恢復（{detail}）")
            st.update(fails=0, alerted=False, since=None)
        else:
            st["fails"] += 1
            st["since"] = st["since"] or now.strftime("%H:%M")
            if st["fails"] >= FAIL_THRESHOLD and not st["alerted"]:
                lines_down.append(f"🔴 {name} 異常（自 {st['since']} 起連續 {st['fails']} 次）：{detail}")
                pending_alert.append(name)

    print(" ; ".join(summary))
    # 通知沒送成功（沒設定或 Telegram 暫時失敗）就不標記已警報，下一分鐘會再試
    if lines_down and send_telegram("【看門狗】網站異常\n" + "\n".join(lines_down) + "\n（來自站外檢查）"):
        for n in pending_alert:
            checks[n]["alerted"] = True
    if lines_up:
        send_telegram("【看門狗】\n" + "\n".join(lines_up))

    today = now.strftime("%Y-%m-%d")
    if HEARTBEAT_HOUR >= 0 and now.hour >= HEARTBEAT_HOUR and state.get("heartbeat") != today:
        bad = [n for n, s in checks.items() if s["alerted"]]
        if send_telegram(f"【看門狗】每日回報：{'全部正常' if not bad else '異常中：' + '、'.join(bad)}（{len(CHECKS)} 項檢查）"):
            state["heartbeat"] = today

    save_state(state)


if __name__ == "__main__":
    main()
