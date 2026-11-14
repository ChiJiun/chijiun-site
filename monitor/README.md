# VM 監控站

監控 chijiun.com 所在的 Oracle Always Free VM。只有我自己看得到，不公開。

| 網址 | 內容 | 保護方式 |
| --- | --- | --- |
| `monitor.chijiun.com/hub/` | **白話總覽頁（先看這個）**：服務有沒有活著、VM 用量、會不會被 Oracle 回收，並一鍵連到下面兩個工具 | Caddy `basic_auth`（與 `/netdata/` 共用） |
| `monitor.chijiun.com/` | Uptime Kuma：服務過去有沒有掛過、回應時間、憑證到期、通知 | Kuma 自己的登入（可再加 Cloudflare Access） |
| `monitor.chijiun.com/netdata/` | Netdata：每個容器、網路、磁碟、Caddy 流量的詳細圖表 | Caddy `basic_auth`（可再加 Cloudflare Access） |

兩個放在同一個網域。Uptime Kuma 官方不支援子路徑，所以 Kuma 放根目錄、Netdata 放 `/netdata/`，不能反過來。舊的 `netdata.chijiun.com` 只做轉址，指向 `/netdata/`。

兩個服務都只聽 `127.0.0.1`（Kuma 3001、Netdata 19999），Oracle 防火牆不需要開新埠，外面只能經過 Caddy 進來。

## 總覽頁（`hub/`）

Kuma 與 Netdata 是給維運人員看的專業介面，不容易一眼看出「現在到底有沒有問題」。`hub/index.html` 是一個單檔的靜態頁，用白話整理最重要的三件事，並提供兩個大按鈕連到 Kuma 與 Netdata。不需要 build，也不依賴外部資源。

- **服務有沒有活著**：個人網站、stats-ai、ncu-backend（含「檢索」「PDF 對話」兩個子系統是否就緒），並顯示所選時間範圍內的正常率。資料來自 Netdata 的 HTTP 檢查（`/etc/netdata/go.d/httpcheck.conf`，每 10 秒從 VM 本機檢查）。
- **趨勢圖**（可切換 1 小時、6 小時、24 小時、7 天；滑鼠移上去或手指按住會顯示該時間點的數字）：CPU、記憶體、網路流量、各容器的 CPU 與記憶體、各網域每分鐘請求數、各服務的回應時間。圖是頁面自己用 SVG 畫的，沒有外部函式庫。Netdata 的歷史只從安裝那一刻開始，資料不夠長時頁面會註明。
- **VM 用量**：CPU、記憶體、磁碟，資料來自 Netdata。
- **會不會被 Oracle 回收**：讀 `idle-sampler.py` 輸出的摘要。它每分鐘把摘要寫到 `/run/private/chijiun-monitor/summary.json`，再由 root（`ExecStartPost=-+…`）複製到 `/run/chijiun-hub/summary.json`，因為 DynamicUser 的目錄 Caddy 讀不到。
- 頁面每 10 秒自動更新；最上方的橫幅會彙整「一切正常」或「有 N 項需要注意」。

Caddy 的路由（細節見 [`Caddyfile.snippet`](Caddyfile.snippet)）：`/hub/` 是靜態頁、`/hub/data/` 是摘要 JSON、`/hub/api/` 轉給 Netdata 的 API（路徑改寫成 `/api/`）。三者都在 `basic_auth` 後面。

Kuma 本身無法加自訂連結，所以「從 Kuma 回到總覽頁」只能靠書籤，或之後在 Kuma 建一個狀態頁，把連結寫在說明裡。

## 外部存活檢查（GitHub Actions）

[`.github/workflows/uptime-check.yml`](../.github/workflows/uptime-check.yml) 每 10 分鐘從 GitHub 的主機（VM 之外）檢查網站與健康檢查端點，失敗時 workflow 會失敗，GitHub 會寄失敗通知。用來補上「整台 VM 停機時，VM 上的 Kuma 與 Netdata 也跟著停」的盲點。GitHub 的排程只是盡力而為，可能延遲數分鐘；Public repo 若 60 天沒有活動，排程會被自動停用。

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

- **監控站跟著被監控的 VM 一起死**：VM 整台停機時，Kuma 也跟著停，不會有人通知你。要真的偵測整機掛掉，需要一個放在 VM 之外的監控（例如免費的 UptimeRobot 或 Cloudflare Health Checks 盯 `https://chijiun.com/`）。這是目前設計最大的缺口。
- Uptime Kuma 的監控項目是存在它自己的資料庫，不在 repo 裡；要備份請備份 Docker volume `uptime-kuma`。
- VM 用的是臨時（ephemeral）公網 IP，不要停止或刪除 VM，否則 IP 會變，Cloudflare 的 DNS 記錄要跟著改。
