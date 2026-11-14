#!/usr/bin/env bash
# 在 Oracle VM 上安裝監控：Uptime Kuma（Docker）＋ Netdata ＋ 兩個回報用的 systemd timer。
# 用法：在 VM 上，於 repo 目錄執行  sudo bash monitor/install.sh
# 可重複執行；已存在的東西會略過，不會覆蓋 /etc/chijiun-monitor.env 與 Caddyfile。
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "請用 sudo 執行：sudo bash monitor/install.sh" >&2
  exit 1
fi

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ "$REPO" != "/var/www/chijiun" ]; then
  echo "注意：repo 在 $REPO，但 systemd unit 寫死 /var/www/chijiun/monitor/…；請確認路徑一致。" >&2
fi

echo "==> 1/6 安裝相依套件（docker.io、curl、python3）"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io curl python3
systemctl enable --now docker

echo "==> 2/6 Uptime Kuma（只聽 127.0.0.1:3001）"
if docker ps -a --format '{{.Names}}' | grep -qx uptime-kuma; then
  echo "    已存在，略過"
else
  docker run -d --restart=unless-stopped \
    -p 127.0.0.1:3001:3001 \
    -v uptime-kuma:/app/data \
    --name uptime-kuma \
    louislam/uptime-kuma:2
fi

echo "==> 3/6 Netdata（官方 kickstart，穩定版、關閉匿名統計）"
if command -v netdata >/dev/null 2>&1; then
  echo "    已安裝，略過"
else
  tmp="$(mktemp -d)"
  curl -fsSL https://get.netdata.cloud/kickstart.sh -o "$tmp/netdata-kickstart.sh"
  sh "$tmp/netdata-kickstart.sh" --stable-channel --disable-telemetry --dont-wait
  rm -rf "$tmp"
fi
# 預設會聽所有網卡的 19999；改成只聽 localhost，由 Caddy 加上密碼後轉發
#（kickstart 安裝後會建立一份只有註解的 netdata.conf，所以不能用「檔案不存在」來判斷）
mkdir -p /etc/netdata
touch /etc/netdata/netdata.conf
if ! grep -Eq '^\s*bind to\s*=\s*(127\.0\.0\.1|localhost)' /etc/netdata/netdata.conf; then
  if grep -Eq '^\s*\[web\]' /etc/netdata/netdata.conf; then
    echo "    警告：netdata.conf 已有 [web] 區段，請手動加上  bind to = 127.0.0.1  再 restart netdata" >&2
  else
    printf '\n[web]\n\tbind to = 127.0.0.1\n' >> /etc/netdata/netdata.conf
    systemctl restart netdata
  fi
fi

echo "==> 4/6 回報用設定檔 /etc/chijiun-monitor.env"
if [ -e /etc/chijiun-monitor.env ]; then
  echo "    已存在，略過"
else
  install -m 600 /dev/null /etc/chijiun-monitor.env
  cat > /etc/chijiun-monitor.env <<'EOF'
# 在 Uptime Kuma 建立 Push 監控後，把它的網址（不含 ? 後面的參數）貼在這裡。
# 例：http://127.0.0.1:3001/api/push/xxxxxxxx
IDLE_PUSH_URL=
SYNC_PUSH_URL=
# 選填：
# IDLE_ALERT_PERCENT=25
# IDLE_LINK_MBPS=1000
# IDLE_MIN_DAYS=1
# SYNC_MAX_AGE_MIN=15
EOF
fi

echo "==> 5/6 安裝並啟用 systemd timer"
install -m 644 "$REPO"/monitor/systemd/chijiun-idle-sampler.service /etc/systemd/system/
install -m 644 "$REPO"/monitor/systemd/chijiun-idle-sampler.timer   /etc/systemd/system/
install -m 644 "$REPO"/monitor/systemd/chijiun-sync-report.service  /etc/systemd/system/
install -m 644 "$REPO"/monitor/systemd/chijiun-sync-report.timer    /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now chijiun-idle-sampler.timer chijiun-sync-report.timer

echo "==> 6/6 站外看門狗的拉取服務（讓總覽頁顯示小主機看門狗的結果）"
# 專用使用者 + 專用 SSH 金鑰；私鑰只留在這台。公鑰要放到小主機的 wdread 帳號，
# 並限定成只能執行 cat 狀態檔（見 monitor/README.md「站外看門狗」）。已存在就略過。
getent passwd chijiun-pull >/dev/null || useradd --system --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin chijiun-pull
install -d -m 0755 /etc/chijiun-monitor
[ -e /etc/chijiun-monitor/pull_key ] || ssh-keygen -q -t ed25519 -N "" -C chijiun-pull@a1 -f /etc/chijiun-monitor/pull_key
chown chijiun-pull:chijiun-pull /etc/chijiun-monitor/pull_key
chmod 600 /etc/chijiun-monitor/pull_key; chmod 644 /etc/chijiun-monitor/pull_key.pub
install -m 644 "$REPO"/monitor/systemd/chijiun-pull-watchdog.service /etc/systemd/system/
install -m 644 "$REPO"/monitor/systemd/chijiun-pull-watchdog.timer   /etc/systemd/system/
systemctl daemon-reload
if [ -s /etc/chijiun-monitor/pull_known_hosts ]; then
  systemctl enable --now chijiun-pull-watchdog.timer
else
  echo "    還沒有 /etc/chijiun-monitor/pull_known_hosts（小主機的主機公鑰），先不啟用拉取 timer。"
  echo "    取得小主機公鑰後：echo '10.0.0.87 <小主機 /etc/ssh/ssh_host_ed25519_key.pub 前兩欄>' | sudo tee /etc/chijiun-monitor/pull_known_hosts"
  echo "    再執行 sudo systemctl enable --now chijiun-pull-watchdog.timer"
fi
echo "    要放到小主機 wdread 帳號的公鑰："; cat /etc/chijiun-monitor/pull_key.pub

echo
echo "完成。接下來（細節見 monitor/README.md）："
echo "  1. Cloudflare 新增 monitor、netdata 兩筆橘雲 DNS 記錄"
echo "  2. 把 monitor/Caddyfile.snippet 併進 /etc/caddy/Caddyfile，填入 basic_auth 雜湊，reload caddy"
echo "  3. 開 https://monitor.chijiun.com 建立 Kuma 管理員帳號，新增監控項目"
echo "  4. 把兩個 Push 網址填進 /etc/chijiun-monitor.env"
echo
echo "目前只聽本機的服務："
ss -ltn | grep -E ':(3001|19999)\b' || true
