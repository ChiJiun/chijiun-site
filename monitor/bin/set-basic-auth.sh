#!/usr/bin/env bash
# 在 VM 上互動式更換監控站（/hub/ 與 /netdata/）的 basic auth 帳號與密碼。
# 用法：sudo bash /var/www/chijiun/monitor/bin/set-basic-auth.sh
# 密碼只在這個終端機輸入（不會顯示、不會寫進任何檔案或指令列），Caddyfile 只存 bcrypt 雜湊。
# 流程：備份 → 只改 monitor.chijiun.com 區塊裡那一行 → caddy validate → reload；
# 任何一步失敗都會還原備份。
set -euo pipefail

CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
ACCOUNTS="${ACCOUNTS:-/opt/chijiun-monitor-accounts.txt}"

if [ "$(id -u)" -ne 0 ]; then
  echo "請用 sudo 執行：sudo bash $0" >&2
  exit 1
fi
command -v caddy >/dev/null || { echo "找不到 caddy" >&2; exit 1; }

read -r -p "新的帳號（3～32 字，限英數與 . _ -）: " NEW_USER
if ! [[ "$NEW_USER" =~ ^[A-Za-z0-9._-]{3,32}$ ]]; then
  echo "帳號格式不符，未做任何修改。" >&2
  exit 1
fi

echo "接著輸入新密碼兩次（輸入時不會顯示字元；建議 12 字以上）："
NEW_HASH="$(caddy hash-password)"
if ! [[ "$NEW_HASH" =~ ^\$2[aby]\$[0-9]+\$.{53}$ ]]; then
  echo "沒有取得有效的雜湊（兩次密碼不一致或取消），未做任何修改。" >&2
  exit 1
fi

BACKUP="$CADDYFILE.bak-$(date +%Y%m%d-%H%M%S)"
cp -a "$CADDYFILE" "$BACKUP"
echo "已備份：$BACKUP"
restore() { echo "失敗，還原備份。" >&2; cp -a "$BACKUP" "$CADDYFILE"; }

# 只改 monitor.chijiun.com 區塊內「帳號 $2a$…」那一行，且必須剛好一行
NEW_USER="$NEW_USER" NEW_HASH="$NEW_HASH" CADDYFILE="$CADDYFILE" python3 - <<'PY' || { restore; exit 1; }
import os, re, sys
p = os.environ["CADDYFILE"]
s = open(p, encoding="utf-8").read()
start = s.find("\nmonitor.chijiun.com {")
if start < 0:
    sys.exit("找不到 monitor.chijiun.com 區塊")
end = s.find("\n}\n", start)
if end < 0:
    sys.exit("找不到區塊結尾")
block = s[start:end]
pat = re.compile(r"^(\s*)[A-Za-z0-9._-]+(\s+)\$2[aby]\$\d+\$\S+\s*$", re.M)
if len(pat.findall(block)) != 1:
    sys.exit(f"區塊內的帳號行不是剛好一行（找到 {len(pat.findall(block))} 行），不修改")
new_block = pat.sub(lambda m: f"{m.group(1)}{os.environ['NEW_USER']}{m.group(2)}{os.environ['NEW_HASH']}", block)
open(p, "w", encoding="utf-8").write(s[:start] + new_block + s[end:])
print("已更新帳號行")
PY

if ! caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
  caddy validate --config "$CADDYFILE" --adapter caddyfile 2>&1 | tail -3 >&2
  restore; exit 1
fi
systemctl reload caddy

# 舊的帳號檔裡存的是舊密碼，改成只留說明（不刪檔）
if [ -e "$ACCOUNTS" ]; then
  printf '%s\n' "monitor.chijiun.com 的 basic auth 帳號：$NEW_USER" "密碼由使用者自訂，不在此保存（Caddyfile 內只有 bcrypt 雜湊）。" > "$ACCOUNTS"
  chmod 600 "$ACCOUNTS"
fi

echo
echo "完成。帳號：$NEW_USER，舊密碼已失效。"
echo "請用新帳密開 https://monitor.chijiun.com/hub/ 確認（瀏覽器若快取舊帳密，關掉分頁或用無痕視窗）。"
echo "若要還原：sudo cp -a $BACKUP $CADDYFILE && sudo systemctl reload caddy"
