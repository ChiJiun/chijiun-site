#!/usr/bin/env bash
# 在「站外」那台 VM 上以 root 執行：bash install.sh
# 可重複執行；不會覆蓋已存在的 /etc/chijiun-watchdog.env（裡面有 Telegram token）與已產生的金鑰。
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

# 向 A1 拉取服務清單用的專用金鑰（私鑰只留在這台，root 擁有、權限 600；
# 由 systemd 的 LoadCredential 交給看門狗）。A1 那邊要把公鑰限定成只能 cat 服務清單。
install -d -m 0755 /etc/chijiun-watchdog
[ -e /etc/chijiun-watchdog/svc_key ] || ssh-keygen -q -t ed25519 -N "" -C chijiun-watchdog-svc -f /etc/chijiun-watchdog/svc_key
chown root:root /etc/chijiun-watchdog/svc_key /etc/chijiun-watchdog/svc_key.pub
chmod 600 /etc/chijiun-watchdog/svc_key; chmod 644 /etc/chijiun-watchdog/svc_key.pub
if [ ! -s /etc/chijiun-watchdog/svc_known_hosts ]; then
  echo "還沒有 /etc/chijiun-watchdog/svc_known_hosts（A1 的主機公鑰），看門狗暫時不會拉取服務清單。"
  echo "  在 A1 上看主機公鑰：cat /etc/ssh/ssh_host_ed25519_key.pub"
  echo "  然後在這台：echo '10.0.0.37 ssh-ed25519 <A1 的主機公鑰>' | sudo tee /etc/chijiun-watchdog/svc_known_hosts"
fi
echo "要放到 A1 的 /home/wdsvc/.ssh/authorized_keys 的內容（整行，一行）："
echo "from=\"10.0.0.87\",restrict,command=\"/bin/cat /run/chijiun-hub/services.json\" $(cat /etc/chijiun-watchdog/svc_key.pub)"

systemctl daemon-reload
systemctl enable --now chijiun-watchdog.timer
systemctl list-timers chijiun-watchdog.timer --no-pager
