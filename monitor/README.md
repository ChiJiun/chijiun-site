# VM 監控站

監控 chijiun.com 所在的 Oracle Always Free VM。只有我自己看得到，不公開。

| 網址 | 內容 | 保護方式 |
| --- | --- | --- |
| `monitor.chijiun.com` | Uptime Kuma：服務是否存活、通知、閒置風險、部署同步 | Kuma 自己的登入（可再加 Cloudflare Access） |
| `netdata.chijiun.com` | Netdata：CPU、記憶體、磁碟、網路的即時圖表 | Caddy `basic_auth`（可再加 Cloudflare Access） |

兩個服務都只聽 `127.0.0.1`（Kuma 3001、Netdata 19999），Oracle 防火牆不需要開新埠，外面只能經過 Caddy 進來。

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

1. **Cloudflare DNS**：新增 `monitor`、`netdata` 兩筆 A 記錄，指向 VM 的公網 IP，橘雲（proxied）。
2. **Caddy**：把 [`Caddyfile.snippet`](Caddyfile.snippet) 併進 `/etc/caddy/Caddyfile`。先執行 `caddy hash-password` 取得雜湊貼進 `basic_auth`，再 `sudo systemctl reload caddy`。
3. **Kuma 管理員**：打開 `https://monitor.chijiun.com`，第一次進去先建立管理員帳號（請盡快做，這個畫面在建立前是誰都能建）。
4. **在 Kuma 建立監控項目**：
   - HTTP(s)：`https://chijiun.com/`，間隔 60 秒，重試 2～3 次；另外可加一個 Keyword 型，確認頁面含「翁祺鈞」。
   - HTTP(s)：`https://monitor.chijiun.com/`、`https://netdata.chijiun.com/`（後者回 401 算正常，在「Accepted Status Codes」加 `401`）。
   - Push「Oracle 閒置回收風險」：Heartbeat Interval 120 秒。
   - Push「部署同步」：Heartbeat Interval 300 秒，重試 2 次。
   - 通知方式（email 或 Telegram）在 Settings → Notifications 設定，並套用到上面所有監控。
5. **填入 Push 網址**：把兩個 Push 監控頁面顯示的網址（`http://127.0.0.1:3001/api/push/<token>`，不含 `?` 後面）貼進 `/etc/chijiun-monitor.env` 的 `IDLE_PUSH_URL`、`SYNC_PUSH_URL`。timer 每次執行都會重新讀檔，不用重啟。

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
