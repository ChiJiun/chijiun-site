# VM 監控站

監控 chijiun.com 所在的 Oracle Always Free VM。只有我自己看得到，不公開。

| 網址 | 內容 | 保護方式 |
| --- | --- | --- |
| `monitor.chijiun.com/overview/` | **白話總覽頁（先看這個）**：服務有沒有活著、VM 用量、會不會被 Oracle 回收，並一鍵連到下面兩個工具 | Caddy `basic_auth`（與 `/netdata/` 共用） |
| `monitor.chijiun.com/dashboard`（根網址 `/` 會轉到 `/overview/`） | Uptime Kuma：服務過去有沒有掛過、回應時間、憑證到期、通知 | 同一組 Caddy `basic_auth`；Kuma 自己的登入可在「設定 → 安全性」停用，全站只用一組帳密 |
| `monitor.chijiun.com/netdata/` | Netdata：每個容器、網路、磁碟、Caddy 流量的詳細圖表 | Caddy `basic_auth`（可再加 Cloudflare Access） |

`/overview/` 與 `/netdata/` 的 basic auth 帳密要更換時，在 VM 上執行 `sudo bash /var/www/chijiun/monitor/bin/set-basic-auth.sh`：互動輸入新帳號與密碼（密碼不顯示、不進指令列），自動備份 Caddyfile、驗證、reload，失敗會還原。Kuma 整個站台也在這組 basic auth 後面（只有恰好 `/` 例外，它只是轉址，讓外部存活檢查能用 302 判斷），所以停用 Kuma 自己的登入（設定 → 安全性 → 停用驗證）後，全站只用這一組帳密；Push 回報走 `127.0.0.1:3001`，不受影響。**順序很重要：要先確認 Caddy 已保護 Kuma，才能停用 Kuma 的登入。**舊的 `/hub/…` 網址會自動轉到 `/overview/…`。

兩個放在同一個網域。Uptime Kuma 官方不支援子路徑，所以 Kuma 放根目錄、Netdata 放 `/netdata/`，不能反過來。為了預設看到白話總覽頁，Caddy 把「恰好是 `/`」的請求轉址到 `/overview/`；總覽頁不能叫 `/dashboard`，因為 Kuma 內部自己用了這個路徑；Kuma 的入口是 `https://monitor.chijiun.com/dashboard`（其他 Kuma 路徑與 Push 網址不受影響）。舊的 `netdata.chijiun.com` 只做轉址，指向 `/netdata/`。

兩個服務都只聽 `127.0.0.1`（Kuma 3001、Netdata 19999），Oracle 防火牆不需要開新埠，外面只能經過 Caddy 進來。

## 總覽頁（`hub/`）

Kuma 與 Netdata 是給維運人員看的專業介面，不容易一眼看出「現在到底有沒有問題」。`hub/index.html` 是一個單檔的靜態頁，用白話整理最重要的三件事，並提供兩個大按鈕連到 Kuma 與 Netdata。不需要 build，也不依賴外部資源。

- **服務有沒有活著**：個人網站、stats-ai、ncu-backend（含「檢索」「PDF 對話」兩個子系統是否就緒），並顯示所選時間範圍內的正常率。資料來自 Netdata 的 HTTP 檢查（`/etc/netdata/go.d/httpcheck.conf`，每 10 秒從 VM 本機檢查）。
- **趨勢圖**（可切換 1 小時、6 小時、24 小時、7 天；滑鼠移上去或手指按住會顯示該時間點的數字）：CPU、記憶體、網路流量、各容器的 CPU 與記憶體、各網域每分鐘請求數、各服務的回應時間。圖是頁面自己用 SVG 畫的，沒有外部函式庫。Netdata 的歷史只從安裝那一刻開始，資料不夠長時頁面會註明。
- **VM 用量**：CPU、記憶體、磁碟，資料來自 Netdata。
- **站外看門狗**：顯示小主機從外面檢查網站的結果（見下方「站外看門狗」）。
- **VM 上跑了哪些服務**：自動盤點的容器（依 compose 專案分組）、systemd 服務與 Caddy 網域，各有狀態燈、「新發現」標籤與重啟次數；清單超過 5 分鐘沒更新會明顯警告（見下方「服務自動盤點」）。
- **Netdata 導覽**：[`hub/netdata-guide.html`](hub/netdata-guide.html) 用白話教怎麼看 Netdata（含「Skip and use the dashboard anonymously」這個容易卡住的登入畫面）。
- **會不會被 Oracle 回收**：讀 `idle-sampler.py` 輸出的摘要。它每分鐘把摘要寫到 `/run/private/chijiun-monitor/summary.json`，再由 root（`ExecStartPost=-+…`）複製到 `/run/chijiun-hub/summary.json`，因為 DynamicUser 的目錄 Caddy 讀不到。
- 頁面每 10 秒自動更新；最上方的橫幅會彙整「一切正常」或「有 N 項需要注意」。

Caddy 的路由（細節見 [`Caddyfile.snippet`](Caddyfile.snippet)）：`/overview/` 是靜態頁、`/overview/data/` 是摘要 JSON、`/overview/api/` 轉給 Netdata 的 API（路徑改寫成 `/api/`）。三者都在 `basic_auth` 後面。

Kuma 本身無法加自訂連結，所以「從 Kuma 回到總覽頁」只能靠書籤，或之後在 Kuma 建一個狀態頁，把連結寫在說明裡。

## 外部存活檢查（GitHub Actions）

[`.github/workflows/uptime-check.yml`](../.github/workflows/uptime-check.yml) 每 10 分鐘從 GitHub 的主機（VM 之外）檢查網站與健康檢查端點，失敗時 workflow 會失敗，GitHub 會寄失敗通知。用來補上「整台 VM 停機時，VM 上的 Kuma 與 Netdata 也跟著停」的盲點。GitHub 的排程只是盡力而為，可能延遲數分鐘；Public repo 若 60 天沒有活動，排程會被自動停用。

## 站外看門狗（`watchdog/`）

放在另一台 Always Free 小主機（E2.1.Micro，目前是 `e2-free-1`）上，不依賴 A1 那台 VM。每分鐘檢查 `chijiun.com`（含內容比對）、`stats` 與 `ncu-backend` 的健康檢查、`monitor`，**連續 3 次失敗（約 3 分鐘）才用 Telegram 通知**，恢復時也會通知；每天台北時間 9 點發一則「全部正常」回報，沒收到就代表看門狗自己出問題。補上 Kuma 與 Netdata 跟著 A1 一起停機時沒人通知的缺口。

- 只用 Python 標準函式庫，systemd timer 執行（`DynamicUser`、唯讀檔案系統、記憶體上限 100 MB），小主機 1 GB 綽綽有餘。
- 安裝：把 `watchdog/` 複製到小主機，`sudo bash install.sh`。可重複執行，不會覆蓋已填好的設定。
- 通知設定在小主機的 `/etc/chijiun-watchdog.env`（權限 600）：填 `TELEGRAM_BOT_TOKEN` 與 `TELEGRAM_CHAT_ID`，下一分鐘生效，不用重啟。沒填時只寫日誌（`journalctl -u chijiun-watchdog`），不會報錯。
- 通知沒送成功（沒設定或 Telegram 暫時失敗）不會標記為「已通知」，下一分鐘會再試。
- 要比對內容或指定狀態碼的網址寫在 `watchdog.py` 開頭的 `CHECKS`；改完重新執行 `install.sh`。Caddy 的網域與 `monitor/services.json` 的 `extra_urls` 會自動加做「活著就好」的外部檢查，不用改程式（見「服務自動盤點」）。
- 它也每分鐘向 A1 拉取服務清單，負責「服務異常／新服務／A1 沒有回報清單」的通知（見「服務自動盤點」）。
- 注意：它只確認「從外面連得進來」，不看 VM 內部用量；用量與閒置回收風險仍看 `/overview/`。

### 總覽頁怎麼拿到看門狗的結果

總覽頁第 2 節顯示小主機最近一次的檢查結果、小主機自己的記憶體／負載／開機時間，超過 5 分鐘沒更新會標紅並進橫幅。資料流：

1. 小主機的 `watchdog.py` 每分鐘寫 `status.json`（只有檢查結果與主機用量，**不含 token**），root 複製到 `/run/chijiun-watchdog/status.json`。
2. A1 的 `chijiun-pull-watchdog.timer` 每分鐘跑 [`bin/pull-watchdog.sh`](bin/pull-watchdog.sh)，經 Oracle 私有網路（`10.0.0.87`）用 SSH 拉取，驗證是合法 JSON 才放到 `/run/chijiun-hub/watchdog.json`，總覽頁讀 `/overview/data/watchdog.json`。拉取失敗不動舊檔，所以過期會被發現。
3. SSH 金鑰是**專用的唯讀金鑰**：私鑰只在 A1（`/etc/chijiun-monitor/pull_key`，擁有者 `chijiun-pull`，權限 600）；公鑰放在小主機 `wdread` 帳號（無 sudo、無密碼），並以 `restrict,command="/bin/cat /run/chijiun-watchdog/status.json"` 限定。拿到這把金鑰也只能讀那個檔案，不能登入或執行別的指令。A1 用 `StrictHostKeyChecking=yes` 與寫死的主機公鑰（`/etc/chijiun-monitor/pull_known_hosts`）確認對方身分。
4. 不開任何對外埠：兩台在同一個私有網段，只用既有的 SSH 22。

安裝（A1 上 `sudo bash monitor/install.sh` 第 6 步會建使用者、金鑰與 timer）後，要手動做兩件事：把印出的公鑰放進小主機 `wdread` 的 `authorized_keys`（含上面的 `restrict,command=…` 前綴），並把小主機的主機公鑰寫進 A1 的 `pull_known_hosts`。

## 服務自動盤點

目的：VM 上新部署的服務不用改任何監控設定，就會自動出現在總覽頁（第 3 節「VM 上跑了哪些服務」），並由站外看門狗用 Telegram 通知新增與異常。

### 運作方式

1. **A1 盤點**（[`bin/service-inventory.py`](bin/service-inventory.py)，`chijiun-service-inventory.timer` 每分鐘一次）。全程唯讀，只執行 `docker ps`、`docker inspect`、`systemctl show`，不會啟動、停止或重啟任何東西：
   - **容器**：名稱、compose 專案、映像（不含 digest）、狀態、健康檢查、重啟設定、重啟次數、啟動時間、對應到主機的埠。`docker inspect` 用固定的格式範本只取這些欄位，**不讀環境變數、啟動指令、掛載路徑**。
   - **網域**：解析 `/etc/caddy/Caddyfile` 的站點標頭。`basic_auth` 區塊的內容完全跳過（裡面有密碼雜湊），其他行只取指令名稱與 `reverse_proxy` 後面的本機埠；只有 `redir` 的站點（例如 `netdata.chijiun.com`）標成「只轉址」。
   - **systemd 服務**：`/etc/systemd/system` 底下自己放的常駐服務（一般檔案、非 snap、非 oneshot，目前是 `devspace.service`），加上設定檔 `systemd` 欄位列出的。
   - 輸出 `/run/chijiun-hub/services.json`（權限 644，先寫暫存檔再改名；**不含機密**），總覽頁讀 `/overview/data/services.json`。
   - 狀態存在 `/var/lib/chijiun-services/services-state.json`：每個項目第一次看到的時間、重啟次數基準、最近的新增／消失事件。**第一次執行會把當下看到的全部當成「已知基準」（`baseline: true`），不會標成新發現**；狀態檔壞掉時也一樣重新建立基準。
2. **小主機看門狗**（[`watchdog/watchdog.py`](watchdog/watchdog.py)）每分鐘經私有網路拉取這份清單，負責通知，並對清單裡的網域自動加做外部檢查。
3. **每天的摘要**：清單的 `digest` 欄位是「過去 24 小時淨新增／消失的項目」，看門狗的每日 9 點回報會附上服務總數、異常數與這份摘要。

### 判斷規則

| 情況 | 狀態 |
| --- | --- |
| 重啟設定是 `always`／`unless-stopped`／`on-failure` 的容器沒有在跑（含手動 `docker stop`） | 異常 |
| 健康檢查 `unhealthy` | 異常 |
| 健康檢查 `starting` 超過 5 分鐘 | 注意 |
| 重啟次數比上次多（15 分鐘內） | 注意 |
| 重啟次數連續兩次盤點都增加，或 15 分鐘內增加 3 次以上（疑似一啟動就當掉） | 異常 |
| 重啟設定是 `no` 的一次性容器正常結束（exit 0）；`on-failure` 的容器正常結束 | 正常（忽略） |
| 重啟設定是 `no` 的容器以錯誤結束 | 注意 |
| systemd 服務 `failed`，或設定開機啟動卻沒有在跑 | 異常 |
| 讀不到 Docker | 異常（項目名稱「Docker」）；這時不會把容器當成全部消失 |
| 第一次看到未滿 7 天、而且不是基準 | 加上 `new: true`（「新發現」，**不等於異常**） |

「消失」要連續 3 次盤點（約 3 分鐘）都沒看到才算，避免重新部署的空檔被當成消失；消失後 30 天內再出現，不會再被當成新發現。

### 通知（小主機，Telegram）

沿用看門狗原本的原則：連續 3 次才通知、恢復時通知一次、**送出成功才標記已通知**（失敗下一分鐘再試）。訊息只有名稱、狀態與白話說明。

- **服務異常**：清單裡某個項目連續 3 次都是「異常」→ 通知；恢復時通知。
- **新服務**：出現 `new: true` 的容器／系統服務／網域 → 每個只通知一次，並提醒「已自動納入監控，如需補充網址請告訴我」。
- **A1 沒有回報服務清單**：拉不到清單，或清單的 `updated` 超過 5 分鐘，連續 3 次 → 通知；恢復時通知。這段期間仍會用上次的網域清單繼續做外部檢查。
- **每日 9 點回報**：外部檢查項數、服務總數、異常與注意數、過去 24 小時新增／消失。
- **網域外部檢查**：清單裡每個網域（排除只轉址與 `ignore_domains`）自動 `GET https://<網域>/`，不跟隨轉址，HTTP 狀態 < 500 就算活著（401／403／404／301／302 都算；Cloudflare 的 52x／530 與其他 5xx 算失敗）。結果併入 `status.json` 的 `checks`（多了 `kind` 與 `domain` 欄位，原有欄位不變），總覽頁第 2 節會列出。網址已經有寫死檢查的（`chijiun.com/`、`monitor.chijiun.com/`）不重複。

### 信任邊界（小主機 → A1 的唯讀 SSH）

方向與「總覽頁怎麼拿到看門狗的結果」相反，做法相同：

- 私鑰只在小主機（`/etc/chijiun-watchdog/svc_key`，root 擁有、權限 600），由 systemd `LoadCredential` 只交給看門狗服務。
- 公鑰放在 A1 的 `wdsvc` 帳號（無密碼、無 sudo；shell 是 `/bin/sh`，因為 sshd 要用它執行限定的指令）。家目錄、`.ssh` 與 `authorized_keys` 都是 **root 擁有**，這個帳號自己改不了。`authorized_keys` 內容：

  ```
  from="10.0.0.87",restrict,command="/bin/cat /run/chijiun-hub/services.json" ssh-ed25519 AAAA… chijiun-watchdog-svc
  ```

  `restrict` 關掉終端機、轉送埠、agent 等所有功能，`command=` 讓它不管要求執行什麼都只會 `cat` 那個檔，`from=` 限定只能從小主機的私有 IP 連。
- 小主機用 `StrictHostKeyChecking=yes` 與寫死的 A1 主機公鑰（`/etc/chijiun-watchdog/svc_known_hosts`）確認對方身分；走 Oracle 私有網路（A1 是 `10.0.0.37`），不開新的埠。
- **風險**：這把金鑰如果被拿走（等於小主機被入侵），對方能做的只有「從小主機的 IP 讀服務清單」：容器名稱、映像名稱、狀態、埠、網域。清單不含任何機密，但它等於一份「這台 VM 上跑了什麼」的地圖。不能登入 A1、不能執行別的指令。
- 反方向：清單的內容對小主機來說是**不可信的資料**。看門狗會把字串截短並去掉控制字元才放進通知；清單給的網域與額外網址只接受 `https`、必須是網域名稱（不是 IP）、而且解析結果全是公網位址才會去連，所以就算 A1 被入侵，也不能叫小主機去連私有網段或雲端的 metadata 位址。
- A1 的盤點程式以專用的系統使用者 `chijiun-inventory`（不能登入）加上 `docker` 群組執行（讀容器清單需要；`docker` 群組實際上等同能控制 Docker）。所以程式是由 `install.sh` 複製到 root 擁有的 `/opt/chijiun-monitor/` 再執行，**不直接跑 repo 裡的檔案**，避免「能 push 到 repo」就等於「能在 VM 上以 docker 權限執行程式」。代價是改了 `bin/service-inventory.py` 之後要在 A1 重新複製（見下方）。`monitor/services.json` 只是資料，push 後直接生效。

### 人工補充：`monitor/services.json`

這個檔可以不存在。改完 push，約 3 分鐘內生效（不用重啟任何東西）。

```json
{
  "names": {
    "ncu-backend": { "title": "NCU 後端", "desc": "顯示在名稱下面的一行說明" },
    "devspace.service": "DevSpace"
  },
  "projects": { "mvdis-watch": "mvdis-watch（監理站監看）" },
  "ignore": ["tmp-*"],
  "ignore_domains": ["www.chijiun.com"],
  "systemd": ["devspace.service"],
  "extra_urls": [{ "name": "mvdis 對外網址", "url": "https://mvdis.chijiun.com/" }]
}
```

- `names`：容器名稱、systemd 單元名稱或網域 → 白話名稱（字串，或 `title`＋`desc`）。沒寫的直接顯示原本的名稱。
- `projects`：compose 專案 → 總覽頁的分組標題。
- `ignore`：不要盤點的容器或 systemd 服務（可用 `*` 萬用字元）。被忽略的不顯示、不通知。
- `ignore_domains`：仍然列出，但不做外部檢查。目前放了 `www.chijiun.com`：Caddyfile 有這個站點，但 DNS 沒有這筆記錄（2026-11-17 從小主機實測查不到），不忽略的話會一直報異常；補上 DNS 之後把它拿掉即可。
- `systemd`：額外要關注的 systemd 服務（自動發現沒抓到的，例如 oneshot 或套件裝的）。
- `extra_urls`：VM 上看不到網域的服務（例如經 Cloudflare Tunnel 對外、主機名設定在 Cloudflare 那邊的），在這裡補上要從外面檢查的網址；只接受 `https://`，判斷標準與網域檢查相同（HTTP < 500 算活著）。
  - `https://mvdis.chijiun.com/`：mvdis 的對外網址，**由使用者提供**，2026-11-17 實測 `GET /` 回 HTTP 200。（實測時 `/healthz` 也回 200，其餘常見健康檢查路徑為 404；目前先檢查 `/`。）

### 安裝與更新

- A1：`sudo bash monitor/install.sh` 的第 7 步會複製程式到 `/opt/chijiun-monitor/`、安裝並啟用 timer、建立 `wdsvc` 帳號。只想更新盤點程式時：

  ```bash
  sudo install -m 0755 /var/www/chijiun/monitor/bin/service-inventory.py /opt/chijiun-monitor/service-inventory.py
  ```
- 小主機：把 `watchdog/` 複製過去，`sudo bash install.sh`。它會產生拉取用的金鑰並印出要放到 A1 `/home/wdsvc/.ssh/authorized_keys` 的那一行；另外要把 A1 的主機公鑰寫進小主機的 `/etc/chijiun-watchdog/svc_known_hosts`（指令會印出來）。金鑰或 `svc_known_hosts` 還沒設定時，看門狗照常做外部檢查，只是不拉清單、也不會因此通知。

### 檢查方式

```bash
# A1：盤點有在跑、清單內容
systemctl list-timers chijiun-service-inventory.timer
journalctl -u chijiun-service-inventory.service -n 5 --no-pager
python3 -m json.tool /run/chijiun-hub/services.json | head -40
# 小主機：有沒有拉到清單（每分鐘一行「服務清單：正常」）
journalctl -u chijiun-watchdog.service -n 6 --no-pager
python3 -c 'import json; print(json.load(open("/run/chijiun-watchdog/status.json"))["services"])'
# 小主機：確認金鑰真的只能讀清單（不管要求執行什麼，都只會印出清單）
sudo ssh -T -F /dev/null -i /etc/chijiun-watchdog/svc_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile=/etc/chijiun-watchdog/svc_known_hosts wdsvc@10.0.0.37 id | head -c 80
# 本機：單元測試（不需要 Docker 或網路）
python3 monitor/tests/test_services.py
```

想重新建立基準（例如狀態檔亂掉）：在 A1 刪掉 `/var/lib/chijiun-services/services-state.json`，下一分鐘會把當下的全部重新當成基準。

### 已知限制

- 盤點每分鐘一次，存活不到一分鐘的容器看不到。
- 容器「消失」（被 `docker rm`）只會出現在每日回報與總覽頁的「過去 24 小時」，不會即時通知；只有「還在、但沒在跑」才算異常。
- 只看得到 Caddyfile 裡的網域。經 Cloudflare Tunnel 對外的主機名設定在 Cloudflare，VM 上看不到，要用 `extra_urls` 補。
- Caddyfile 解析只認「一行一個指令、大括號獨立成字」的常見寫法；`import` 進來的其他檔案裡的站點不會被看到。
- 網域外部檢查只確認「連得進來、不是 5xx」，不看內容；要比對內容的仍寫在 `watchdog.py` 的 `CHECKS`。


## 監控項目

| 想知道的事 | 怎麼做 |
| --- | --- |
| 資源使用率 | Netdata，裝好就有 |
| 網站與 Caddy 是否活著、掛了通知 | Uptime Kuma 的 HTTP 監控（手動在 Kuma 建立，見下方） |
| Oracle 閒置回收風險 | `bin/idle-sampler.py`，每分鐘取樣，算 7 天的 95 百分位，回報給 Kuma 的 Push 監控 |
| 部署同步狀態 | `bin/sync-report.sh`，每 2 分鐘比對 VM 的 HEAD 與 GitHub 的 main，回報給 Kuma 的 Push 監控 |

### 閒置回收的判定

依 [Oracle 官方 Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm)：7 天內 CPU 第 95 百分位、網路使用率、記憶體使用率（僅 A1）**三項都低於 20%**，閒置的 Always Free 主機可能被回收。官方頁面沒寫回收前的通知與停機流程。

`idle-sampler.py` 的做法與限制：

- 三項取樣來源是 VM 內的 `/proc`，不是 Oracle 的 OCI Monitoring，數字會有落差，只當預警。
- 網路使用率 = 實體網卡 rx+tx 速率 ÷ `IDLE_LINK_MBPS`（預設 1000 Mbit/s），頻寬是估計值。
- 警戒值預設 25%（比官方 20% 多留緩衝）：三項 p95 **同時**低於 25% 才回報 down；只要任何一項高於就是 up。
- 樣本累積未滿 1 天不會報 down，避免剛安裝時誤報。
- 樣本存在 `/var/lib/chijiun-monitor/samples.csv`（最多 7 天，約 10,080 筆），重開機不會消失。

## 安裝（在 VM 上）

repo 已經在 `/var/www/chijiun`（systemd timer 每 2 分鐘 `git pull`），所以 push 之後約 2 分鐘 VM 上就有 `monitor/`。

```bash
cd /var/www/chijiun
sudo bash monitor/install.sh
```

它會：安裝 Docker、以 Docker 跑 Uptime Kuma（`louislam/uptime-kuma:2`，資料在 volume `uptime-kuma`）、用官方 kickstart 安裝 Netdata 並改成只聽 localhost、建立 `/etc/chijiun-monitor.env`（權限 600）、啟用兩個 systemd timer。可重複執行。

之後手動做的事：

1. **Cloudflare DNS**：新增 `monitor` 一筆 A 記錄，指向 VM 的公網 IP，橘雲（proxied）。（`netdata` 那筆只在需要保留舊網址轉址時才要。）
2. **Caddy**：把 [`Caddyfile.snippet`](Caddyfile.snippet) 併進 `/etc/caddy/Caddyfile`。先執行 `caddy hash-password` 取得雜湊貼進 `basic_auth`，再 `sudo systemctl reload caddy`。
3. **Kuma 管理員**：打開 `https://monitor.chijiun.com`，第一次進去先建立管理員帳號（請盡快做，這個畫面在建立前是誰都能建）。
4. **在 Kuma 建立監控項目**：
   - HTTP(s)：`https://chijiun.com/`，間隔 60 秒，重試 2～3 次；另外可加一個 Keyword 型，確認頁面含「翁祺鈞」。
   - HTTP(s)：`https://monitor.chijiun.com/netdata/`（未登入回 401 算正常，在「Accepted Status Codes」加 `401`）。
   - Push「Oracle 閒置回收風險」：Heartbeat Interval 120 秒。
   - Push「部署同步」：Heartbeat Interval 300 秒，重試 2 次。
   - 通知方式（email 或 Telegram）在 Settings → Notifications 設定，並套用到上面所有監控。
5. **填入 Push 網址**：把兩個 Push 監控頁面顯示的網址（`http://127.0.0.1:3001/api/push/<token>`，不含 `?` 後面）貼進 `/etc/chijiun-monitor.env` 的 `IDLE_PUSH_URL`、`SYNC_PUSH_URL`。timer 每次執行都會重新讀檔，不用重啟。

## 其他指標：Docker 容器與 Caddy

Netdata 裝好後就會自動收集這些，不用另外安裝收集器（在 Netdata v2.12.3、Caddy v2.11.9 實測）：

- **Docker 容器**：每個容器各自的 CPU、記憶體、網路、磁碟 I/O（圖表前綴 `cgroup_<容器名>`），以及容器狀態與健康檢查（`docker_local`）。新容器啟動後會自動出現。
- **Caddy 程序與上游**：Caddy 本身的記憶體、CPU、goroutine，以及各個 `reverse_proxy` 上游是否健康。Netdata 自動讀取 Caddy admin API 的 `http://127.0.0.1:2019/metrics`。
- **Caddy 請求量、延遲、狀態碼（依網域分開）**：這個**預設沒有**，要在 `/etc/caddy/Caddyfile` 最前面加上全域設定，再 `sudo systemctl reload caddy`：

  ```caddyfile
  {
  	metrics {
  		per_host
  	}
  }
  ```

  `per_host` 會讓指標帶上網域標籤，才分得出 `chijiun.com`、`stats`、`monitor` 各自的流量。Caddy 只會為 Caddyfile 裡設定過的網域建立標籤，亂打 Host 標頭的流量歸在 `_other`，不會讓圖表數量無限增加。每多一種狀態碼或 HTTP 方法就會多幾張圖。

在 Netdata 的搜尋框輸入 `caddy`、`cgroup` 或 `docker` 找對應的圖表。

## 驗證

```bash
# 兩個服務只應該聽 127.0.0.1
ss -ltn | grep -E ':(3001|19999)\b'
# timer 有在跑
systemctl list-timers 'chijiun-*'
# 手動跑一次看輸出
sudo systemctl start chijiun-idle-sampler.service chijiun-sync-report.service
journalctl -u chijiun-idle-sampler.service -u chijiun-sync-report.service -n 20 --no-pager
```

## 已知限制

- **監控站跟著被監控的 VM 一起死**：VM 整台停機時，Kuma 也跟著停。已由 GitHub Actions 與小主機上的站外看門狗補上；看門狗要填好 Telegram 設定才會通知。
- Uptime Kuma 的監控項目是存在它自己的資料庫，不在 repo 裡；要備份請備份 Docker volume `uptime-kuma`。
- VM 用的是臨時（ephemeral）公網 IP，不要停止或刪除 VM，否則 IP 會變，Cloudflare 的 DNS 記錄要跟著改。
