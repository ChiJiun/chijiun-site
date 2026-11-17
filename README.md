# chijiun-site

翁祺鈞（Chi-Jiun Wong）的個人網站：https://chijiun.com/

目前是純靜態網站，沒有 build 步驟、不用安裝相依套件（字體與 shader 函式庫都是放在 repo 裡的現成檔案），跑在一台 Oracle Cloud 的 Always Free 主機上。之後可能改寫成動態版（有後端），所以 repo 取名 `chijiun-site`，不綁定靜態或 GitHub Pages。

## 部署方式

- 網站由主機上的 Caddy 提供，網域的 DNS 在 Cloudflare，指向這台主機。
- 主機上的 `/var/www/chijiun` 是這個 repo 的複本，由 systemd timer 每 2 分鐘執行一次 `git pull --ff-only`，所以 push 到 `main` 之後約 2 分鐘內會自動更新。
- 完整的申請與部署流程，寫在文章 `site/blog/oracle-free-arm-vm.html`（對外網址 `/blog/oracle-free-arm-vm.html`）。
- Cloudflare 會快取靜態檔（瀏覽器快取 4 小時），所以 HTML 引用 CSS／JS 時帶有內容雜湊的版本參數（`styles.css?v=xxxxxxxx`）。改了 `site/` 底下的 `.css`／`.js` 之後，執行 `python scripts/version-assets.py` 更新版本再 push；`--check` 只檢查不改檔。
- 原本的 GitHub Pages 已停用，`.github/workflows/deploy.yml` 只保留手動觸發（`workflow_dispatch`），push 不會再觸發它。

## 結構

- `site/data.js`：全部內容（自介、研究、經歷、作品、技能鍵盤）。改內容只要改這個檔案。
- `site/index.html`：頁面骨架。
- `site/styles.css`：樣式；深色（近黑配琥珀）、淺色（紙色配深橘）兩套配色，都寫在檔案開頭的變數裡，要換主色只改 `--accent`、`--accent-rgb`、`--ink`、`--fx`。直角、髮絲線格線；980px 以下首屏改成單欄。
- `site/fonts/`：自架的拉丁字體（Archivo、JetBrains Mono，SIL OFL 1.1，授權在 `OFL.txt`）。中文用系統字體，不另外載入。
- `site/vendor/`：首屏背景用的 [Shaders](https://shaders.com)（MIT）精簡版，預先打包好直接提交。只有要升級版本或換元件時才執行 `node scripts/build-shaders.mjs` 重新產生（需要 Node 與 npm，在暫存資料夾安裝，不會在 repo 留下 `node_modules`），跑完再執行 `python scripts/version-assets.py`；檔名帶版本號，升級時要同步改 `main.js` 裡的 import。`shaders-LICENSE.txt` 是它與內含相依套件（TypeGPU 等）的授權全文，由同一支腳本產生。
- `site/main.js`：互動。
  - 首屏背景是 WebGPU 的抖色雜訊（Shaders）：會稍微跟著滑鼠偏移，按鍵時閃一下，隨深淺色換色。檔案約 1.3 MB（gzip 約 310 KB），所以只在寬螢幕（981px 以上）、瀏覽器支援 WebGPU、沒開「減少動態效果」與省流量模式時才延遲載入；遙測已關閉。訪客可以用 `:fx` 關掉（會記在瀏覽器裡）。
  - 其他情況（手機、不支援 WebGPU、載入失敗）改用點陣背景：會被滑鼠推開，按鍵或點擊會起漣漪。
  - 首屏鍵盤：按實體鍵盤的字母鍵或點鍵帽，顯示那項技能用在哪裡（一進頁面先選好第一項，鍵帽外框與讀出框的色條對應，頁面上不另外寫操作說明）；數字鍵 1、2、3、0 跳到各區塊。
  - 「經歷」是一個編輯器視窗：點一下之後用 `j`/`k` 移動、`h`/`l` 切換檔案、Enter 開連結。
  - `:` 或 `/` 開指令列（`:theme`、`:e awards`、`:sound`、`:fx`、`:blog`、`:help`），Ctrl K 搜尋。
- 聯絡表單：前端在 `site/`，寄信的後端是 `worker/contact/` 的 Cloudflare Worker（見下方「聯絡表單後端」）。
  - `data.js` 的 `contact.endpoint`（`/api/contact`）與 `contact.turnstileSiteKey` 都填了，表單才會交給 Worker 寄信；這兩個值本來就是公開的。
  - 還沒設定、Turnstile 載入失敗、或 Worker 回錯誤／逾時：改用 `email` 開啟訪客自己的郵件程式，內容會先帶好。
  - 防垃圾信：Cloudflare Turnstile（大多數人看不到，疑似機器人才要點一下）、隱藏的 `botcheck` 蜜罐欄位、Worker 端的來源網域檢查與每 IP 限流。
- `site/blog/`：文章區，一樣是純靜態、沒有 build 步驟。
  - `index.html`：文章列表，一列一篇，只放日期與標題。新增文章時，在 `post-list` 裡複製一個 `<li>`。
  - `oracle-free-arm-vm.html`：文章本體，以它為範本複製即可；文章裡不要放 OCID、IP、信箱、金鑰。
  - `blog.css`：文章專用樣式，配色與 nav、footer 沿用 `site/styles.css`。
  - `toc.js`：文章目錄。依文章裡有 `id` 的 `h1`～`h6` 自動產生，並保留標題層級的父子關係（`h1` 是文章標題、`h2` 是章節、`h3` 是小節，跳級時掛在最近的上一層）；有子層級的項目可以個別展開或收合，捲動時會自動展開目前所在章節。寬螢幕（1360px 以上）固定在右側，窄螢幕是右下角的「目錄」按鈕。新文章只要幫標題加上 `id`，並載入 `<script src="toc.js" defer>`。
- `site/404.html`：找不到的網址導回首頁。

## 聯絡表單後端（Cloudflare Worker）

`worker/contact/` 只處理 `chijiun.com/api/contact`，其他網址照常由主機上的 Caddy 提供。它檢查來源網域、欄位、Turnstile 與限流，然後用 Email Routing 的 `send_email` 從 `contact@chijiun.com` 寄到站長信箱，Reply-To 設成訪客的 email。

秘密值不在 repo 裡，也不會送到瀏覽器：

| 名稱 | 放哪裡 | 公開？ |
| --- | --- | --- |
| Turnstile site key | `site/data.js` 的 `contact.turnstileSiteKey` | 公開（設計如此） |
| Turnstile secret key | `wrangler secret put TURNSTILE_SECRET` | 秘密 |
| 收件信箱 | `wrangler secret put MAIL_TO` | 秘密 |
| 寄件人、允許的網域 | `worker/contact/wrangler.toml` 的 `[vars]` | 公開 |

第一次設定（在 Cloudflare 後台與本機各做一次）：

1. Cloudflare 後台 → chijiun.com → Email → Email Routing：啟用（會新增 MX、SPF、DKIM 記錄），在 Destination addresses 加入收件信箱並點驗證信。
2. Cloudflare 後台 → Turnstile：新增 widget，hostname 填 `chijiun.com`、模式選 Managed，記下 site key 與 secret key。
3. 本機：
   ```bash
   cd worker/contact
   npm ci
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put TURNSTILE_SECRET
   npx wrangler secret put MAIL_TO
   ```
   （secret 還沒設好之前，Worker 一律回 503，前端會改開郵件程式，不會出錯。）
4. 把 site key 填進 `site/data.js` 的 `contact.turnstileSiteKey`，執行 `python scripts/version-assets.py` 後 push。

本機測試：把 `worker/contact/.dev.vars.example` 複製成 `.dev.vars`（裡面是 Cloudflare 公開的 Turnstile 測試金鑰），執行 `npm run dev`；本機不會真的寄信，信件內容會印在終端機並存成檔案。

## 本機預覽

```bash
python -m http.server 8000 -d site
```

然後打開 http://localhost:8000 。
