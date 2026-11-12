# chijiun.github.io

翁祺鈞（Chi-Jiun Wong）的個人網站：https://chijiun.github.io/

純靜態單頁，沒有 build 步驟、沒有相依套件。

## 結構

- `site/data.js`：全部內容（自介、研究、經歷、作品、技能鍵盤）。改內容只要改這個檔案。
- `site/index.html`：頁面骨架。
- `site/styles.css`：樣式；深色、淺色兩套配色，980px 以下首屏改成單欄。
- `site/main.js`：互動。
  - 背景點陣會被滑鼠推開，按鍵或點擊會起漣漪。
  - 首屏鍵盤：按實體鍵盤的字母鍵或點鍵帽，顯示那項技能用在哪裡；數字鍵 1、2、3、0 跳到各區塊。
  - 「經歷」是一個編輯器視窗：點一下之後用 `j`/`k` 移動、`h`/`l` 切換檔案、Enter 開連結。
  - `:` 或 `/` 開指令列（`:theme`、`:e awards`、`:sound`、`:help`），Ctrl K 搜尋。
- 聯絡表單：在 `data.js` 的 `contact` 填入 Web3Forms 的 access key（或 email）後才會顯示。
- `site/404.html`：找不到的網址導回首頁。
- `.github/workflows/deploy.yml`：push 到 `main` 時把 `site/` 部署到 GitHub Pages。

## 本機預覽

```bash
python -m http.server 8000 -d site
```

然後打開 http://localhost:8000 。
