# US 原生版進度與驗收 — 2026-09-30 UTC

## 結論：完整公開成品尚未完成

目前的原生介面已用真實日線與私人分鐘 OHLCV 驗證；這不代表免費公開分鐘行情、
300–500 檔全池掃描或實體 iPhone 驗收已完成。正式環境的資料來源設定
沒有改動，沒有購買資料方案、繞過額度、改寫授權旗標，或發布私人資料。

程式保存在 `feature/us-radar-parity-20260930`。正式站尚未切換原生來源。

## 本次完成的修改

- 移除 Forex 的模組、樣式及市場切換入口；不刪除使用者先前的收藏資料。
- 行情請求以兩個 upstream 工作槽排隊，避免第三個並發請求直接失敗。
- 合併同一請求；標準 400 根初載和 8 根更新共用後端資料快取。
- 429／暫時性失敗可保留有效報價與 K 線，明示舊資料並保留原始取得時間。
  400／401／403／404 不以舊資料掩蓋；快取有期限與容量上限。
- 原生圖表接用 Crypto 共用的拖曳／雙指縮放及畫線元件；畫線與視窗依
  股票、來源、復權口徑分開，離頁釋放事件與圖表資源。
- 原生首頁採多空 T1／T2／T3 候選欄。顯示真實距關鍵位數值，沒有杜撰
  Crypto OX 分數；日線結果不冒充盤中掃描。
- 修正 WebKit 畫板 ResizeObserver 警告及首頁價格標籤的尺寸／定位。
- 資料來源標示跟隨實際 provider，不再把私人 FinMind 日線標成 Twelve Data。
- 後端拒絕兩種 `privateValidation` 快照旗標，避免驗證檔意外公開。

## 真實資料及手機驗證

`scripts/collect-us-private-eod.mjs --private-validation` 在 repository 外收集
20 檔 FinMind 日線，每檔至少 688 根，自 2024-01-01 起，無缺失標的。
這次只驗證 1D；分鐘／小時資料沒有驗證，也沒有以日線替代。

`scripts/test-us-native-private.cjs` 僅在 loopback 使用上述資料；API 攔截
是私人測試接線，不是 production provider，也沒有宣告對外顯示已授權。

| 引擎 | 寬度 | 右側列表 | 原生圖表手勢 | 首頁候選 | 四種分析工具 | App errors |
| --- | ---: | --- | --- | ---: | --- | ---: |
| Chromium | 390 | 同 Crypto，124px | 通過 | 16 | 各 20 檔 | 0 |
| Chromium | 430 | 同 Crypto，124px | 通過 | 16 | 各 20 檔 | 0 |
| WebKit | 390 | 同 Crypto，124px | 通過 | 16 | 各 20 檔 | 0 |
| WebKit | 430 | 同 Crypto，124px | 通過 | 16 | 各 20 檔 | 0 |

另驗證搜尋 TSM 真實收盤價、收藏、清單收合／展開、共享畫線儲存、
模擬 429 保留舊資料、型態畫板、泡泡／熱力／相對強弱／量價排行、
首頁候選跳轉，以及新聞／媒體頁的導覽。所有手機情境無橫向溢出。
媒體頁沒有已發布文章或影片，未生成內容冒充成品。

桌面與 390px 跨市場 regression 通過，未發現 app runtime／console error、
本地 404 或重複 timer。手勢測試使用瀏覽器模擬觸控，不是實體 iPhone 測試。

## 仍需解決的資料條件

### 新來源實測：Finance Query（私人驗證）

- 官方提供無金鑰的免費 hosted API，預設來源為 Yahoo Finance。
- `scripts/collect-us-private-intraday.mjs --private-validation` 依序收集 20 檔，
  每檔 1,254 根日線與 1,950 根正常交易時段的一分鐘 OHLCV，40 次正常請求
  均成功，沒有 429。這不能推論額度無限、盤中延遲已確認或 300–500 檔容量已通過。
- 回傳的每檔第 1,951 列是收盤時間的終端報價；按 NY session 範圍排除，
  不當成開於 16:00 的正常分鐘 K 棒，也不補造缺失 K 棒。
- Chromium 在 390／430px 原生圖表已通過 TSM 日線／一分鐘切換；確認畫面
  最後一根的時間與收盤價與來源完全一致，使用實際 400 根分鐘 K 線。
  手勢、畫線、429 保留、20 檔四種分析工具及 15 個首頁候選也通過，無 app errors。
- 本次分鐘資料尚未完成 WebKit／實體手機驗證。型態與首頁仍是日線分析，
  不能描述成盤中全池掃描。
- JSON 保留在 repository 外，快照有 privateValidation 標記；不進正式服務。
  快取檔沿用原始取得時間，不把本地重讀算成新行情。
- 官方文件明示全球 token bucket／429，且提醒 Yahoo 服務條件；
  hosted API 免費與程式 MIT license 都沒有證明取得公開分發行情的授權。

https://verdenroz.github.io/finance-query/
https://verdenroz.github.io/finance-query/server/api/openapi/

| 已查證選項 | 目前限制 |
| --- | --- |
| FinMind | Keyless 日線實測成功；分鐘資料是 backer／sponsor 能力。服務存取不等於對外散布授權。 |
| Finance Query | 無金鑰 hosted 日線／分鐘實測成功；全球 token bucket 限流，Yahoo 原始資料對外展示權與延遲尚未确认。 |
| Twelve Data | 已有 adapter；免費方案有 credit 限制，公開分發須依帳號權限／add-on，不能只修改程式旗標。 |
| Alpaca | 可用免費 IEX／延遲歷史機制，但需帳號金鑰及用途權限；目前沒有可用設定。 |
| Tiingo | 免費方案是內部使用、50 requests/hour、1000/day，不是免費公開分發方案。 |
| Databento | 免費 credit 是試用；免交易所授權費與分發權的 Mini feed 仍需有效訂閱，不是永久免費資料。 |
| Yahoo／Stooq | 普通歷史 HTTP 檢查分別遇到 429／404 或 JS challenge，未建立可靠正式來源，也沒有繞過限制。 |

這是已查證來源的結果，不是斷言所有可能的美股免費來源都不存在。
目前沒有驗證到同時符合「免費、持續提供原始分鐘 OHLCV、可公開展示」
的可用接法。這是完整成品／正式上線的阻擋條件。

現有快取與併發保護是 warm-instance 範圍，不是跨 Vercel 實例的全域額度鎖；
CDN 及 request coalescing 能減少重複讀取，不能把有限供應商額度變成無限。

### 官方依據

- https://finmind.github.io/tutor/UnitedStatesMarket/Technical/
- https://finmind.github.io/quickstart/
- https://finmind.github.io/Disclaimer/
- https://finmind.github.io/PrivacyPolicy/
- https://support.twelvedata.com/en/articles/9935903-us-equities-market-data
- https://twelvedata.com/terms
- https://docs.alpaca.markets/docs/market-data-faq
- https://www.tiingo.com/products/iex-api
- https://databento.com/stocks

不要把此 checkpoint 部署或描述成已通過完整公開美股原生版驗收。
