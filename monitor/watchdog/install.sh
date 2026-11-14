#!/usr/bin/env bash
# 在「站外」那台 VM 上以 root 執行：bash install.sh
# 可重複執行；不會覆蓋已存在的 /etc/chijiun-watchdog.env（裡面有 Telegram token）。
set -euo pipefail
cd "$(dirname "$0")"

install -d -m 0755 /opt/chijiun-watchdog
install -m 0755 watchdog.py /opt/chijiun-watchdog/watchdog.py
install -m 0644 chijiun-watchdog.service chijiun-watchdog.timer /etc/systemd/system/

if [ ! -e /etc/chijiun-watchdog.env ]; then
  install -m 0600 /dev/null /etc/chijiun-watchdog.env
  cat > /etc/chijiun-watchdog.env <<'ENV'
# 填入後不需重啟，下一分鐘的檢查就會讀到。
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
# 連續失敗幾次才警報（每分鐘一次）
FAIL_THRESHOLD=3
# 每日回報時間（台北時間的小時，-1 關閉）
HEARTBEAT_HOUR=9
ENV
  chmod 600 /etc/chijiun-watchdog.env
  echo "已建立 /etc/chijiun-watchdog.env，請填入 TELEGRAM_BOT_TOKEN 與 TELEGRAM_CHAT_ID"
fi

systemctl daemon-reload
systemctl enable --now chijiun-watchdog.timer
systemctl list-timers chijiun-watchdog.timer --no-pager
