# US 原生版進度與驗收 — 2026-10-01 台北時間

## 結論：完整公開成品尚未完成

目前的原生介面已用真實日線、分鐘／小時 OHLCV 及 400 檔候選的私人快照驗證；
這不代表免費公開分鐘行情、長期盤中穩定性或實體 iPhone 驗收已完成。正式環境的資料來源設定
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

### 2026-10-01 延續驗收：七個級別及全池容量

20 檔資料已完成 1D／1m／5m／15m／30m／1H／4H。4H 使用同來源的真實
1H 組成，按 NY 09:30 與 13:30 分桶；正常最後一桶只有 150 分鐘，提前收盤
依日曆縮短。缺少組成 K 棒則捨棄該桶，不跨夜、補棒或把日線冒充盤中線。
官方 API 的絕對日期範圍請求實測曾回傳 1D，已因級別不符拒絕。
批次回應的 interval 為 null 時，只接受來源 meta.dataGranularity 的確認，
不以请求参数推定級別；metadata 衝突或股票代號不符均拒絕。

全池從現有目錄選 400 個候選（種子＋非 complex stock），不是聲稱選定了
400 檔流動性最好的股票。使用官方 `/v2/charts` 每批 5 檔、依序、間隔 2 秒；
舊資料重用快取，遇到 HTTP 或批次內的上游 quota 錯誤即停止。
這次補齊資料的批次請求共 50 次，約 267 秒（包含快取處理與分析），沒有 429；
此前 300 檔的補齊 run 是 76 次批次請求，不能把 warm-cache 耗時當成全冷啟動耗時。

| 級別 | 至少 60 根有效歷史 | 與 SPY 最新交易日期一致、進入分析 |
| --- | ---: | ---: |
| 1D | 351 | 335 |
| 1H | 364 | 347 |
| 4H | 332 | 309 |

最終 349 檔不同標的、991 筆跨級別分析，日期均為 2026-09-30。
56 筆過期分析已剔除；查不到、歷史不足及缺少組成 K 棒均列入失敗紀錄。
這是一次來源與容量驗證，不代表所有標的可交易、成交量涵蓋全市場或
尖峰多使用者／長期盤中壓力測試已通過。

Chromium／WebKit 均在 390／430px 通過七個級別（20 檔資料），以及全池
1D／1H／4H 圖表與型態切換。每根呈現的 OHLC 與來源尾端資料逐根比對；
時間級別玻璃指示器的位置也檢查。全池四種工具分別呈現 50／100／50／50
筆結果，首頁 35 個多空候選，沒有 app errors 或橫向溢出。
首頁必須有有效圖表尺寸及實際上漲 K 線像素才算繪出，避免資料文字已更新
但截圖拍到空白畫布的測試假陽性。測試環境使用繁中字型，未修改產品字型。

`--offline` 可從同一份原始快取重新分析，零外部請求，保留原始取得時間。
本次離線重算约 124 秒，結果相同。共享分析只對每個級別計算一次已收線
SPY 基準，保留相對強弱的同時間比較與未收線排除規則。
完整測試 180 項通過，build check 85 assets／177 unique IDs 通過。

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
- 初次分鐘資料只驗證 Chromium；後續 WebKit、1H／4H 型態與全池驗證如上。
  實體手機與長期盤中驗證仍未完成，首頁候選仍採日線分析。
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

### 新供應商後端接線（2026-10-01）

- 新增正式 `finance-query` adapter；`US_DATA_PROVIDER=finance-query` 可選用 Finance Query / Yahoo，無需 API 金鑰。未設定供應商時仍維持現行 widget。
- 原生 `quote-v2` / `chart-v2` 現已支援此 adapter，公開展示確認仍須獨立設定，不會因新增來源自動變成已確認。
- 支援已驗證的 1m／5m／15m／30m／1H／4H／1D，未驗證的週線、月線與盤前盤後不開放。4H 從 1H 正常盤資料依紐約開盤時間聚合。
- 報價時間維持 Unix 秒；漲跌幅由昨收計算，避免上游比率與百分比單位混用。價格調整方式與延遲保留 unknown。
- 後端快取隔離供應商；同一來源 1H／4H 及初次／尾端更新共用上游結果。429 保持退避，不更換身分或繞過限流。
- 歷史續載僅在來源已驗證的 range 內本地篩選；來源曾將絕對日期分線要求回傳為日線，因此不使用此方式，也不保證無限歷史。
- 舊版 Twelve Data 行情及搜尋路由在新來源模式停用，避免切換後仍消耗舊供應商額度。

### 真正後端 API 的私人原生驗收入口

執行 `US_PRIVATE_INPUT=/tmp/ox-us-private-frames/evaluation.json npm run dev -- --us-private --port 4186`。
若不指定 `US_PRIVATE_INPUT`，原生圖表仍直接讀取新來源，掃描列表則明確顯示尚未指定快照。

- 僅綁定 `127.0.0.1`，拒絕外部 socket、Host、Origin 與 cross-site API 請求；私有 API 全部 `no-store`，未啟用 CORS。
- 明確回傳 `privateValidation=true` 與 `externalDisplayConfirmed=false`。本機頁面可驗收；公開網域不因 private flag 解鎖。
- 私人 API 使用與正式 adapter 相同的報價、級別驗證、正常盤過濾、4H 聚合、快取、限流與錯誤處理。Vercel handler 不啟用這個入口。
- `scripts/test-us-native-live.cjs` 在 390／430 手機尺寸逐根比對七種級別的真實後端 OHLC；不攔截美股 API，也不以 fixture 代替美股資料。其他市場仍使用既有 UI 測試隔離資料。
- 級別選單及首頁週期依 capability 限縮；換來源或原級別不再支援時清除舊圖表資料再載入，避免新標籤配舊 K 線。
- 供應商提供較長 `Retry-After` 時保留原退避時間；私人驗收遇到 429 等候後最多重試一次，不更換供應商身分。驗收腳本若遇超過 60 秒的要求則停止，不縮短要求。
- 此入口不等於公開成品連結；不能用公開部署、reverse proxy 或 tunnel 將私人原始資料轉為公開展示。
- 本輪真正後端驗收：Chromium 與 WebKit，各 390／430 寬度，七種級別全部逐根 OHLC 相符；首頁正常載入，無 JavaScript 例外或橫向溢出。一般回傳尾段 400 根；30m 為來源提供的 273 根，不補造資料。
- WebKit 初次完整驗收遇到本機每分鐘 8 次額度保護，等候後又遇上游日線逾時；重跑最後通過，保留 429 與逾時問題紀錄，不代表來源持續穩定或無限額度。測試共 189 項通過。
