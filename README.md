# chijiun-site

翁祺鈞（Chi-Jiun Wong）的個人網站：https://chijiun.com/

目前是純靜態網站，沒有 build 步驟、沒有相依套件，跑在一台 Oracle Cloud 的 Always Free 主機上。之後可能改寫成動態版（有後端），所以 repo 取名 `chijiun-site`，不綁定靜態或 GitHub Pages。

## 部署方式

- 網站由主機上的 Caddy 提供，網域的 DNS 在 Cloudflare，指向這台主機。
- 主機上的 `/var/www/chijiun` 是這個 repo 的複本，由 systemd timer 每 2 分鐘執行一次 `git pull --ff-only`，所以 push 到 `main` 之後約 2 分鐘內會自動更新。
- 完整的申請與部署流程，寫在文章 `site/blog/oracle-free-arm-vm.html`（對外網址 `/blog/oracle-free-arm-vm.html`）。
- 原本的 GitHub Pages 已停用，`.github/workflows/deploy.yml` 只保留手動觸發（`workflow_dispatch`），push 不會再觸發它。

## 結構

- `site/data.js`：全部內容（自介、研究、經歷、作品、技能鍵盤）。改內容只要改這個檔案。
- `site/index.html`：頁面骨架。
- `site/styles.css`：樣式；深色、淺色兩套配色，980px 以下首屏改成單欄。
- `site/main.js`：互動。
  - 背景點陣會被滑鼠推開，按鍵或點擊會起漣漪。
  - 首屏鍵盤：按實體鍵盤的字母鍵或點鍵帽，顯示那項技能用在哪裡；數字鍵 1、2、3、0 跳到各區塊。
  - 「經歷」是一個編輯器視窗：點一下之後用 `j`/`k` 移動、`h`/`l` 切換檔案、Enter 開連結。
  - `:` 或 `/` 開指令列（`:theme`、`:e awards`、`:sound`、`:blog`、`:help`），Ctrl K 搜尋。
- 聯絡表單：在 `data.js` 的 `contact` 填入 Web3Forms 的 access key（或 email）後才會顯示。
- `site/blog/`：文章區，一樣是純靜態、沒有 build 步驟。
  - `index.html`：文章列表。新增文章時，在 `post-list` 裡複製一個 `<li class="post-item">`。
  - `oracle-free-arm-vm.html`：文章本體，以它為範本複製即可；文章裡不要放 OCID、IP、信箱、金鑰。
  - `blog.css`：文章專用樣式，配色與 nav、footer 沿用 `site/styles.css`。
  - `toc.js`：文章目錄。依文章裡有 `id` 的 `h2`、`h3` 自動產生，寬螢幕（1300px 以上）固定在右側，窄螢幕是右下角的「目錄」按鈕。新文章只要幫標題加上 `id`，並載入 `<script src="toc.js" defer>`。
- `site/404.html`：找不到的網址導回首頁。

## 本機預覽

```bash
python -m http.server 8000 -d site
```

然後打開 http://localhost:8000 。
