#!/usr/bin/env bash
# 在 A1 上執行：經 Oracle 私有網路，用唯讀 SSH 金鑰向小主機拉取看門狗的狀態摘要，
# 放到 $RUNTIME_DIRECTORY/watchdog.json（再由 root 複製到 /run/chijiun-hub/，總覽頁讀取）。
# 小主機那把金鑰被限定成「只能執行 cat 狀態檔」，拿到也不能登入或做別的事。
# 拉取失敗時不動舊檔，總覽頁會從檔案的 updated 欄位發現資料過期。
set -u
HOST="${WATCHDOG_HOST:-10.0.0.87}"
KEY="${PULL_KEY:-/etc/chijiun-monitor/pull_key}"
KNOWN="${PULL_KNOWN_HOSTS:-/etc/chijiun-monitor/pull_known_hosts}"
OUT="${RUNTIME_DIRECTORY:-/tmp}/watchdog.json"

# -T：不要配置終端機；stderr 分開收，不然 ssh 的提示文字會混進 JSON
errf="$(mktemp)"; trap 'rm -f "$errf"' EXIT
json="$(ssh -T -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10 \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$KNOWN" "wdread@$HOST" 2>"$errf")" || {
  echo "拉取失敗：$(head -c 200 "$errf")" >&2; exit 1; }

# 內容必須是合法 JSON 且有 updated 欄位，才覆蓋
if ! printf '%s' "$json" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert isinstance(d.get("updated"),int)'; then
  echo "拉取到的內容不是預期的 JSON，略過" >&2; exit 1
fi
printf '%s' "$json" > "$OUT.tmp" && mv "$OUT.tmp" "$OUT"
echo "已更新 $OUT（$(printf '%s' "$json" | wc -c) bytes）"
