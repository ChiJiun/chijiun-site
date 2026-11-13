#!/usr/bin/env bash
# 回報網站部署同步狀態給 Uptime Kuma 的 Push 監控。
#
# 檢查三件事：
#   1. VM 上的 HEAD 是否等於 GitHub 的 main（落後代表 git pull 沒成功）。
#   2. 工作目錄是否有未提交的變更（會讓 git pull --ff-only 失敗）。
#   3. 最近一次 fetch 是否在 SYNC_MAX_AGE_MIN 分鐘內（sync timer 掛掉時會偵測到）。
# 這支 script 本身掛掉或沒執行時，Kuma 的 Push 監控會因為收不到心跳而判定 down。
#
# 環境變數（寫在 /etc/chijiun-monitor.env）：
#   SYNC_PUSH_URL      Uptime Kuma Push 監控的網址（不含 query），必填。
#   SYNC_REPO          repo 路徑，預設 /var/www/chijiun。
#   SYNC_BRANCH        分支，預設 main。
#   SYNC_MAX_AGE_MIN   fetch 的最長容許間隔（分鐘），預設 15。
set -u

REPO="${SYNC_REPO:-/var/www/chijiun}"
BRANCH="${SYNC_BRANCH:-main}"
MAX_AGE_MIN="${SYNC_MAX_AGE_MIN:-15}"
export GIT_TERMINAL_PROMPT=0
export HOME="${HOME:-/tmp}"

# 服務用 DynamicUser 執行，不是 repo 擁有者，所以明確指定 safe.directory；
# --no-optional-locks 讓 git status 不會嘗試寫入 repo。
g() { git --no-optional-locks -c "safe.directory=$REPO" -C "$REPO" "$@"; }

report() {
  local status="$1" msg="$2"
  echo "$status: $msg"
  if [ -z "${SYNC_PUSH_URL:-}" ]; then
    return 0
  fi
  curl -fsS -m 20 -G "$SYNC_PUSH_URL" \
    --data-urlencode "status=$status" \
    --data-urlencode "msg=${msg:0:240}" >/dev/null || {
    echo "回報 Uptime Kuma 失敗" >&2
    return 1
  }
}

if ! local_head="$(g rev-parse HEAD 2>/dev/null)"; then
  report down "讀不到 $REPO 的 git 狀態"
  exit $?
fi
short="${local_head:0:7}"

remote_url="$(g config remote.origin.url 2>/dev/null)"
remote_head="$(git ls-remote "$remote_url" "refs/heads/$BRANCH" 2>/dev/null | cut -f1)"
if [ -z "$remote_head" ]; then
  report down "無法從 GitHub 取得 $BRANCH 的最新 commit（VM 目前在 $short）"
  exit $?
fi

problems=()
if [ "$local_head" != "$remote_head" ]; then
  problems+=("落後 GitHub：VM $short、遠端 ${remote_head:0:7}")
fi
if [ -n "$(g status --porcelain 2>/dev/null)" ]; then
  problems+=("工作目錄有未提交變更，ff-only pull 可能失敗")
fi
fetch_head="$REPO/.git/FETCH_HEAD"
if [ -f "$fetch_head" ]; then
  age_min=$(( ( $(date +%s) - $(stat -c %Y "$fetch_head") ) / 60 ))
  if [ "$age_min" -gt "$MAX_AGE_MIN" ]; then
    problems+=("已 $age_min 分鐘沒有 fetch，sync timer 可能停了")
  fi
else
  problems+=("找不到 FETCH_HEAD，從未 fetch 過")
fi

if [ "${#problems[@]}" -gt 0 ]; then
  # 不用 IFS 串接：在 systemd 的 C locale 下，多位元組的分隔字元會只取第一個位元組而亂碼
  joined=""
  for p in "${problems[@]}"; do
    joined="${joined:+$joined；}$p"
  done
  report down "$joined"
else
  subject="$(g log -1 --format=%s 2>/dev/null)"
  report up "已同步 $short：$subject"
fi
exit $?
