# 美股免費行情顯示

本次依使用者「免費、可靠、能看到美股」要求，預設顯示來源改為 TradingView 官方 Advanced Chart widget。不購買方案、不增加付費基礎設施，不需要 API 金鑰。這是內含行情的官方圖表，**不是可供 OX 下載原始價格的 API**。

## 完成的接入

- 首頁的 SPY／QQQ／IWM 及雷達搜尋到的美股，開啟對應交易所的官方 K 線。
- 支援 1／5／15／30 分、1H／4H、日／週／月的官方時間級別。
- 繪圖、指標、成交量、拖曳／缩放由官方圖表提供；OX 保留搜尋、收藏、底部導覽、展開與清單收合。
- TSM 固定為 NYSE ADR；SPY／IWM 使用 AMEX，QQQ 使用 NASDAQ；不自動跳到其他市場或股票代幣。
- 不以最新取得時間假裝成交時間。美股明確標示延遲資料，實際時刻、feed 及成交量以圖表內資訊為準。
- 圖表自行背景更新，OX 不輪詢或重建圖表。超時提示提供重試／另開圖表，保留已建立的圖表。
- 既有 Twelve Data 原始資料、K 線、掃描與畫線程式保留以供回退；免費模式停用相關價格端點和收集排程，避免消耗舊方案額度。
- 金鑰及原始資料對外授權檢查均未繞過。`externalDisplayConfirmed=false` 仍表示未取得原始資料展示權限，`widgetDisplayAvailable=true` 只代表官方允許嵌入。

## 必須清楚的限制

- 官方市場表將 NASDAQ、NYSE、Arca widgets 列為 Cboe One 延遲來源；不能當成完整全市場即時 feed。
- 官方 widget 不開放價格／指標數值 API。不抓取 iframe 資料、不使用未授權的 Yahoo 私有端點。
- 股票搜尋沿用既有公司目錄（Twelve Data metadata）；不是已驗證的 TradingView 全支援目錄，也不把目錄數計為有效報價數。
- OX 經典／型態畫板／相對強弱／自製泡泡圖需要原始 K 線，目前實際分析數為零。沒有假資料或偽造掃描結果，未將第三方篩選稱為 OX 策略。
- Widget 的時間對齊、指標與交易時段由 TradingView 處理，與原始 API 圖表的口徑分開。
- OX 傳入藍／紅顏色偏好，但免費 widget 實測仍採供應商自身配色；不能聲稱與原生 Crypto K 線完全一致。
- 免費 widget 的畫線不保證切頁／重新整理後保存；原生 OX 畫線儲存架構保留但不套到未知資料上。
- 無法保證任何第三方永遠不中斷，亦未宣稱實體 iPhone 已通過驗收。

## 設定與回退

預設不設環境變數即可使用免費圖表。明確設定 `US_DATA_PROVIDER=twelve-data` 可回退原生接入，該模式仍需原有金鑰及真實展示授權；Actions 收集器亦須該變數及額度／授權條件。不要僅為消除提示而改授權旗標。

回退基準：`9aee54ba98970d187fe34ba7e71348626fcf2223`。其他市場、OX Account／Admin 未修改。

## 驗證

- 173 項 unit tests、build check、Git diff check 通過。
- 原生接入／跨市場回歸：桌面及 390px Chromium 通過，無 app runtime error／重複 timer／橫向溢出。
- 八項啟動、損壞儲存、延後模組與失敗重載情境：390／430px Chromium 與 WebKit 通過。
- `scripts/test-us-free-live.mjs` 使用真實 TradingView 圖表。只隔離初始 Crypto 依賴與非 US 網路；未注入美股行情 fixture。390px Chromium 已驗證真實 SPY 報價、級別切換、首頁返回、TSM ADR、收藏、展開／收合；430px WebKit 已實際載入真實 K 線。其他尺寸與部署結果須以該次實際 log 為準，不將 iframe load 事件當成行情載入證據。

官方依據：

- https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/
- https://www.tradingview.com/widget-docs/markets/north-america/
- https://www.tradingview.com/widget/ （免費標識、無原始價格 API）
