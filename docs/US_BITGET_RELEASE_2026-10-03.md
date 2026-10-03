# 美股合約即時行情正式接入

使用者要求依序嘗試美股平台、幣安、Bitget，若無可行來源才移除美股。本次找到可用的 Bitget 公開股票永續合約資料，保留美股市場並接通原生功能。

## 來源與範圍

- Alpaca 無金鑰請求 401；Binance 原端點 451，不繞過地區限制。
- Bitget 公開 REST 與 WebSocket 實測成功。不需要帳戶金鑰、不下單、不存取帳戶資料。
- 目錄要求 `isRwa=YES`、USDT、正常交易、永續合約，再與既有美股名錄精確對照；STOCK 後綴按交易所的股票合約代號處理，排除同名加密貨幣。
- 驗收當時可對照 281 個股票／ETF 合約，281 個有效報價。它們是 Bitget USDT 合約，非美股現貨綜合行情，亦非全美市場覆蓋。
- 首批按合約成交額選 80 檔進行已完成 UTC 日 K 分析，71 檔歷史足夠，9 檔不足 60 根；不补造、不给不足历史的标的假评级。
- 型態畫板預設掃描 80 檔的 1H／4H，另可選日／週／月。泡泡共用真實報價，量比與平均成交額來自完整日 K。

## 實作

新增 Bitget 合約對照、OHLCV、報價解析與後端路由。分鐘到月 K 支援歷史分頁，依 Bitget 的 endTime 取整規則保留跨頁邊界。K 線收線使用 UTC，含週末。

原生 K 線與報價透過 WebSocket 更新；含 heartbeat、斷線重連、切換與背景頁清理、亂序事件排除。清單訂閱最多 80 檔，每條連線最多 40 個 ticker；選中圖表獨立訂閱，全目錄另每 15 秒以 REST 校正。快照分析每 5 分鐘刷新。後端請求去重與限速，錯誤保留真實失敗狀態。

Bitget 是未指定 `US_DATA_PROVIDER` 時的正式預設。既有明確指定的來源保留自己的設定／權限；私人資料路徑不變。`publicMarketData` 表示使用交易所無需登入的公開行情介面，不聲稱取得美股交易所資料授權。

## 驗證

- 單元／整合回歸、建置與 diff 檢查。
- 直接接 Bitget 取得 AAPL 報價及 400 根日 K；驗證歷史跨頁連續性。
- 手機 390px 與桌面 1366px 真實 REST／WebSocket 驗收：原生分鐘 K、ticker／candle 推送、50 個泡泡、24 張型態瀏覽結果、兩者跳轉雷達；無 JavaScript 錯誤或横向溢出。結果數字會隨行情改變。
- `scripts/test-us-bitget-live.cjs` 不注入模擬行情或假 socket，可指定 `OX_US_LIVE_BASE` 對正式網址執行。測試機缺 CJK 字型，版面幾何及功能通過不等於中文字型視覺驗收。

官方文件：
- https://www.bitget.com/docs/classic/websocket/intro
- https://www.bitget.com/docs/classic/websocket/contract/public/Tickers-Channel
- https://www.bitget.com/docs/classic/websocket/contract/public/Candlesticks-Channel
- https://www.bitget.com/docs/catalog/classic-contract-market

本次不改加密、台股的資料／篩選規則，亦不會將其他來源的價格混入 Bitget 合約 K 線。
