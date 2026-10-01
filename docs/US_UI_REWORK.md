# OX 美股 2.0 UI／UX 返工驗收

本次只更新 `feature/us-2.0-20260930` 預覽，不合併正式版。Crypto 基準為 `310be375cab6e3dcb53628fd50b1a43dde587fdd`；返工前及回退點為 `d4a6a9a8d731bbe0f6671ad3c2979f70362645aa`。原始手機問題截圖 IMG_4414／IMG_4415 已實際查看。

## 元件與結構對照

| US 區塊 | 實際 Crypto 基準／重用方式 | US 資料如何隔離 |
| --- | --- | --- |
| OXLIVE、五頁導覽、市場選單 | 直接保留全站原元件，沒有新增跑馬燈或另一套 dock | 僅 US 啟用時更新 OXLIVE 內容 |
| 雷達搜尋／行情 | `index.html` 的 compact-summary／market-line-card 結構，原 editorial-radar／chart-toolbar 宣告透過等 specificity 選擇器接入 US | 獨立股票目錄、quote、US 搜尋 dialog；ETF／ADR／交易所及技術統計移入資料狀態 |
| 雷達圖表／清單 | 原 workspace 的圖表＋scanner 分欄、38px chart-controls、coin-card、radar-combined 分組控制及清單收合過渡 | USChart 及獨立 US 分析引擎保留；沒有借用 Crypto 行情或評分 |
| 畫線／磁吸／樣式／刪除 | 直接使用 `OXChartDrawings`，移除舊 US 浮動大繪圖列 | `ox-us-v2-twelve-data-chart-drawings-v1`，股票＋復權方式分 scope；舊 US 畫線遷移，Crypto key 不讀寫 |
| 指標分類 | 直接使用 `createToolsRail`，同一個橫向滑動與玻璃選中標記 | US tabs／狀態獨立 |
| 型態畫板 | 直接載入最新 Crypto `patterns.css`；相同 px-board、浮動控制、模式切換、結果分組與右下掃描藥丸結構 | US Worker／條件／級別／結果獨立，筆跡手勢在 US 模組處理 |
| 型態結果小圖 | 直接使用 Crypto `candleChart`，只補可選 palette；預設 Crypto／TW 配色不變 | 只傳入該 US 標的的 OHLCV，藍漲紅跌 |
| 熱力圖／工具容器 | 直接使用 Crypto `createToolChart` 與 `flow.css`，移除 US 舊方塊排列；泡泡保留 US 拖曳／縮放並置入相同工具容器 | 平均成交額與完整日報酬由 US snapshot 提供；不稱市值或全市場廣度 |
| 首頁 | ox-editorial-home／ox-home-quote／btc-premium-chart-wrap／ox-home-t1／ox-home-analysis 的原結構及 CSS | SPY／QQQ／IWM 明示 ETF；US 自選、類股 ETF 與已確認事件 |
| 數據／媒體 | 原 media-page／media-card、ox-news-tabs／ox-news-card／日曆與內容分區 | US 新聞／事件／media.json；詳情返回保留列表位置，空內容不造文章 |

美股專屬 MA、VWAP 估計、正常盤／盤前盤後放在既有指標選單。搜尋範圍、有效報價、實際分析、來源／feed／延遲與股票詳情放在行情區的小型資料狀態入口。九級別保留，時間列自己橫向滑動；選擇要顯示的級別與保存操作沿用 Crypto 結構，使用 US 專屬偏好 key。

## 本次修正

- 取消搜尋、統計、獨立巨大報價卡與多排厚重控制的堆疊，圖表直接接在緊湊行情區下。
- 雷達同 Crypto 左圖右清單；收合使用原分欄過渡，沒有殘留空白。圖表展開另有退出控制及安全區處理。
- 收藏只更新星星節點，黃色回饋；不重排結果、不跳回頂部。T1／T2／T3 短按循環，按住滿兩秒立即開選單。
- 畫板控制浮在整個繪圖區上，筆跡在控制下方；短按控制正常，拖曳可進入繪圖，不用全頁 preventDefault。
- 畫板狀態分成正在取得／分析、該級別無資料、取得失敗、分析完成但無符合標的。切到未收集級別不再提示「請選日線」，舊 Worker 結果不能蓋過新級別。
- 授權阻擋時停止載入與無效輪詢，呈現精簡原因及有效重試操作；空圖縮短，沒有假 K 線或永遠旋轉的載入動畫。
- 消除 feature 版共用新聞隱藏規則與 US workspace 的衝突，數據／媒體正常顯示；離頁釋放 chart、Worker、observer、timer 及工具 listener。
- 保留 Provider／股票目錄／九級別／OHLCV 合併／歷史續載／共用快取與分析架構。沒有改供應商、啟用付費服務或更改會員權限。

## 資料阻礙與證據

「美股對外展示授權尚未確認」來自 `server/markets/us/service.js` 自己的檢查：`capabilities()` 讀取後端 `US_EXTERNAL_DISPLAY_CONFIRMED`；未確認時回 `403 LICENSE_NOT_CONFIRMED`，發生在上游行情請求之前。這不能據以判定 Twelve Data 故障，也不能當作供應商授權拒絕回應。本次保留檢查，沒有設定旗標、繞過或公開私下行情快照。

預覽網址另外受到 Vercel sign-in protection；未登入的檢查回 302。這次無法從該受保護部署讀取目前環境變數，也沒有聲稱已確認它的旗標值。使用者可在原已授權 Vercel 工作階段開預覽。

可搜尋目錄維持 **17,240**。本次 UI 測試使用隔離的九檔 fixture，不列入有效報價／實際掃描數。公開行情及掃描仍需原資料展示授權／共用收集設定；前次私下二十檔驗證見 `US_2_0.md`，不等同本次公開實盤驗收。300～500 檔目標、完整財報來源及 US 媒體內容仍不是已接通的成果。

九級別、歷史深度、更新頻率及方案限制沒有改變：初載約400根，正常盤60秒／休市300秒增量 OHLCV 輪詢，向左續載。沒有把輪詢寫成逐筆即時，也沒有用 quote 補造成交量。完整口徑與額度估算見 `US_2_0.md`。

## 驗收紀錄

- `npm test`：28 個測試檔通過；`npm run check`：85 本機資源、177 唯一 ID 通過；`git diff --check` 通過。
- Chromium：360／390／430／768／1366px 五頁、搜尋 ADR → 圖表、收藏、畫線保存、圖表展開／收合、雷達短按／長按、多空、泡泡、熱力圖點擊、畫板 → 雷達、跨 US／TW／Crypto 返回及新聞詳情返回通過；各寬度 overflow 為0，沒有 runtime error。
- 停留同標的、推進測試時鐘後確實自行請求增量 OHLCV，畫線仍保存。這是隔離 fixture 驗證，**不是實盤行情驗證**。
- 390／430／1366px 已輸出 Crypto／返工前 US／返工後 US 的雷達、指標／畫板、首頁及其餘頁面；補充選單、清單收合、正常 K 線、畫板結果、共用畫線工具畫面。授權被阻擋的狀態與 fixture 畫面分開標示。
- Crypto 返工前／後三個寬度的 OXLIVE、行情區、雷達工具列、圖表與 dock 幾何均維持原值；同一組 shared CSS 宣告直接接入 US。手機左右邊距12px、雷達工具列38px、正常圖表在844px viewport 為524px。
- WebKit／實體 iPhone、真實盤前盤後、實盤更新／斷線重連與長時間多人效能**未實測**。不能把本機 fixture 截圖當作受保護 Vercel 部署已接通真實資料。

## 部署與回退

沿用原 GitHub feature 分支觸發 Vercel preview，PR #36 保持 draft。沒有合併 main、沒有覆蓋全站正式環境。回退可在 feature 分支 revert 本次 UI commit；或回到返工前提交 `d4a6a9a8d731bbe0f6671ad3c2979f70362645aa`，避免 force push 覆蓋後續工作。

預覽：https://ox-crypto-screener-git-feature-us-20-20260930-ox-lab.vercel.app
