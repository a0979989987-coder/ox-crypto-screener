# 美股自動行情接續紀錄 — 2026-10-03

## 交付狀態

已完成幣安股票永續合約的後端、OX 原生 K 線與即時報價接入程式，以及隔離測試資料的驗收。**尚未接通經驗證的真實公開行情，不能宣稱已完成正式上線。** 本次承接 PR #86 的原生介面整合，基線為 `a8a63df450b5a10ac9975481f0682927eccf8e4d`；已核對 main `941b3ed2984a9ce1c8cf405504a11d2fc485c94e`，保留既有加密、台股與新聞修改。

使用者指定的順序仍是美股資料平台優先，無法滿足時才用幣安。既有免費公開資料研究見 [前次紀錄](US_PARITY_REVIEW_2026-10-03.md) 與 [供應商詢問稿](US_PUBLIC_DATA_REQUEST.md)。本次未購買服務、未寄信、未改正式環境設定，也未發布私人收盤資料。

## 真實連線查核

| 查核 | 實際結果 | 意義 |
| --- | --- | --- |
| Alpaca AAPL bars，未帶帳戶憑證 | HTTP 401 | 現有環境沒有可直接驗證的帳戶行情；不能稱為已接通 |
| `https://fapi.binance.com/fapi/v1/exchangeInfo` | HTTP 451，回應 restricted location | 此執行環境無法驗證股票合約目錄、真實 K 線與報價；未改用鏡像或代理 |
| 正式站 `/api/v1/us/health` | HTTP 200；`mode=eod`、`provider=finance-query-eod`、`status=display-unconfirmed`、`intradayEnabled=false` | 正式站仍未啟用新接入 |

Alpaca 官方文件描述免費 Basic 為 IEX 來源且需要 API key/secret，不能將它直接視為全美交易所綜合即時行情或已確認的公開展示方案。Binance 的 REST 與 WebSocket 格式按官方文件實作；目前沒有真實資料成功連線的證據，不宣稱特定股票或數量已通過驗收。

官方參考：

- [Alpaca Market Data](https://docs.alpaca.markets/us/docs/about-market-data-api)
- [Binance USD-M Market Data](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data)
- [Binance Market Streams](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/ws-streams/market)

## 已實作

- 以交易所 `exchangeInfo` 的 EQUITY、USDT、TRADING 與永續合約類型，加上既有美股名錄作精確對照。排除加密同名代號、非交易中與 Pre-IPO 合約，不直接猜測代號拼接。
- REST 目錄、滾動 24 小時報價、分／時／日／週／月 K 線、歷史分頁。檢查 OHLCV 與時間欄位；缺值不補零，也不產生假行情。
- 原生圖表的合約 K 線與 ticker 串流，以及只接受已確認股票合約的清單 ticker 串流。首頁主報價、雷達報價與泡泡詳情共用最新行情。過期／亂序事件丟棄，較慢的 REST 回應不覆蓋更新的串流價格。
- 切換股票、時間級別、市場與背景分頁時清理訂閱；連線逾時、有限退避重連、恢復後 REST 校正及定時更新備援。只有收到有效的新行情才標示串流。
- 合約圖表依 UTC 的實際收線時間處理，週末不套用紐約證交所休市規則。分析只使用已完成 K 線；雷達共用快照目前掃描日 K，畫板另支援日／週／月。
- 快照預設最多掃描成交額前 40 檔合格合約，並行上限 3，保留 SPY 基準（若有上架）。可搜尋、有效報價與實際完成分析的數量分開呈現，不冒充全美市場。短歷史不補造。
- 目錄快取 1 小時，現行 K 線／ticker 5 秒，共用掃描 5 分鐘；請求去重、限流退避。451 停止該實例後續上游請求 1 小時，且不以舊快取冒充成功。
- 介面明示「幣安股票永續合約」、USDT、合約成交量與 24h 漲跌；與美股現貨收盤漲跌分開。手機保留圖表／雷達並排，預設顯示 4 個時間級別，其餘可由級別選單設定。

## 設定與正式啟用條件

預設保留既有 EOD 行為。新 provider 選項是 `US_DATA_PROVIDER=binance-equity`。另以 `US_BINANCE_EXTERNAL_DISPLAY_CONFIRMED` 確認該來源的公開展示條件；既有 `US_EXTERNAL_DISPLAY_CONFIRMED` 不自動沿用。前者未確認時不請求幣安原始行情。`US_BINANCE_SCAN_LIMIT` 預設 40、上限 80。

本次沒有將任何確認旗標設為 true。正式啟用前，仍需取得來源適用條件與公開使用範圍的確認，並在符合供應商服務資格的實際部署環境驗證原端點及 WebSocket。若回傳 451，保留停用與明確錯誤狀態，不繞過限制。

待完成的真實驗收是：股票目錄與合約種類、數筆 REST OHLCV、WebSocket 價格／收線校正、重連、實際可掃描歷史與覆蓋量，以及正式站手機流程。通過後再啟用及部署；目前 PR 保持草稿。

## 測試紀錄

- `npm test`：509 項單元／整合測試通過，其中合約專項 15 項。
- `npm run check`：96 個本機資產、171 個唯一 ID；`git diff --check` 通過。
- `npm run test:us-live`：390／430／1366px 通過。使用真正的 OX UI 與 Lightweight Charts，行情來自隔離的 REST／WebSocket fixtures。驗證分鐘 K 線、報價與清單更新、泡泡詳情報價、切換股票、市場清理、首頁 USDT、無水平溢出與 pageerror；另外驗證 451 時顯示地區錯誤且不產生價格。
- 瀏覽器截圖用於幾何與圖表檢查。測試環境缺 CJK 字型，因此沒有把截圖當成中文字形驗收證據。
- 既有 `npm run test:e2e` 在目前版與未修改基線 `a8a63df` 都停於 `long: strict T1 capacity or exclusion failed`。停止點前的 progressive radar 測試通過；後續未執行，不宣稱完整回歸通過。此次沒有修改 Crypto 篩選邏輯或弱化該斷言。

瀏覽器測試預設使用 Playwright Chromium 與頁面原有圖表載入方式。受限環境可用 `OX_BROWSER_PATH` 指向已安裝瀏覽器、`OX_CHARTS_PATH` 指向相同版本的真實 Lightweight Charts 程式檔；`OX_US_LIVE_QA_DIR` 可指定截圖目錄。測試服務只監聽 127.0.0.1，不需真實帳戶或更改正式環境旗標。
