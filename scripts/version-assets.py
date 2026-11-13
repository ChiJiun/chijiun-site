#!/usr/bin/env python3
"""替網站的 CSS／JS 引用加上內容雜湊版本（?v=xxxxxxxx），避免 Cloudflare 與瀏覽器一直用舊檔。

用法（在 repo 根目錄）：
  python scripts/version-assets.py          # 改完 CSS／JS 後執行，更新所有引用的版本
  python scripts/version-assets.py --check  # 只檢查，有過期的就回傳 1（不改檔）

做法：檔案內容（統一成 LF 換行再算）的 SHA-1 前 8 碼。內容沒變，版本就不會變。
先處理 JS 之間的 import（main.js 引用 data.js），再處理 HTML，所以 main.js 變動時 index.html 也會跟著更新。
"""
import hashlib
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"


def version(path: Path) -> str:
    data = path.read_bytes().replace(b"\r\n", b"\n")
    return hashlib.sha1(data).hexdigest()[:8]


def rewrite(file: Path, pattern: re.Pattern, base: Path):
    """有變動時回傳 (新內容, 檔案)，沒變動回傳 None。"""
    raw = file.read_bytes()
    text = raw.decode("utf-8")

    def sub(m: re.Match) -> str:
        target = (base / m.group("path")).resolve()
        if not target.is_file():
            sys.exit(f"{file}: 找不到引用的檔案 {m.group('path')}")
        return f"{m.group('pre')}{m.group('path')}?v={version(target)}{m.group('post')}"

    new = pattern.sub(sub, text)
    if new == text:
        return None
    return new, file


def main() -> int:
    check = "--check" in sys.argv
    changed = []

    # 1. JS 的 import：from './data.js'
    js_import = re.compile(r"(?P<pre>from\s+['\"])(?P<path>\./[\w./-]+\.js)(?:\?v=\w+)?(?P<post>['\"])")
    # 2. HTML 的 <link href="x.css"> 與 <script src="x.js">（只處理本站相對路徑）
    html_ref = re.compile(
        r"(?P<pre>(?:href|src)=\")(?P<path>(?!https?:|//|data:)[\w./-]+\.(?:css|js))(?:\?v=\w+)?(?P<post>\")"
    )

    for _stage, pattern, files in (
        ("js", js_import, sorted(SITE.glob("*.js"))),
        ("html", html_ref, sorted(SITE.rglob("*.html"))),
    ):
        for f in files:
            result = rewrite(f, pattern, f.parent)
            if not result:
                continue
            new_text, _ = result
            changed.append(f.relative_to(SITE.parent).as_posix())
            if not check:
                # 保留原本的換行風格
                had_crlf = b"\r\n" in f.read_bytes()
                out = new_text.replace("\r\n", "\n")
                if had_crlf:
                    out = out.replace("\n", "\r\n")
                f.write_bytes(out.encode("utf-8"))

    if check:
        if changed:
            print("版本參數過期，請執行 python scripts/version-assets.py：")
            print("\n".join("  " + c for c in changed))
            return 1
        print("版本參數都是最新的。")
        return 0

    print("已更新：" + (", ".join(changed) if changed else "（沒有需要更新的檔案）"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
