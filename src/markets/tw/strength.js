/*
 * OX v4.0 Modular
 * Taiwan Indicator Center
 *
 * Internal router key:
 * strength
 *
 * User-facing name:
 * 指標
 *
 * Responsibility:
 * - Provider-agnostic TW indicator library.
 * - Let users search / filter / select indicators.
 * - Persist "My Indicators" locally.
 * - Display normalized indicator readings when data exists.
 * - Never call TWSE / TPEX / broker APIs directly.
 * - Never mix Crypto / US / Forex data.
 *
 * Future normalized state example:
 *
 * state.data.indicators = {
 *
 *   volumeRatio: {
 *     value: 2.13,
 *     display: "2.13x",
 *     status: "ready",
 *     note: "高於近 20 日均量"
 *   },
 *
 *   relativeStrength: {
 *     value: 84,
 *     display: "84",
 *     status: "ready",
 *     note: "市場前段"
 *   }
 *
 * }
 */


const ROOT_ID =
  "market-unavailable-card";


const STORAGE_KEY =
  "ox-tw-my-indicators-v1";


/* ========================================================================== */
/* Indicator library                                                          */
/* ========================================================================== */

const CATEGORIES =
  Object.freeze([
    {
      id: "all",
      label: "全部"
    },

    {
      id: "market",
      label: "市場"
    },

    {
      id: "priceVolume",
      label: "價量"
    },

    {
      id: "technical",
      label: "技術"
    },

    {
      id: "chips",
      label: "籌碼"
    },

    {
      id: "institution",
      label: "法人"
    },

    {
      id: "fundamental",
      label: "基本面"
    },

    {
      id: "theme",
      label: "題材"
    },

    {
      id: "event",
      label: "事件"
    },

    {
      id: "derivatives",
      label: "期權"
    }
  ]);


/*
 * 指標定義只是功能目錄。
 *
 * 它不代表目前已經有資料。
 *
 * 真正數值只能從：
 * state.data.indicators
 *
 * 進來。
 */
const INDICATORS =
  Object.freeze([

    /* ---------------------------------------------------------------------- */
    /* Market                                                                 */
    /* ---------------------------------------------------------------------- */

    {
      id: "marketBreadth",
      category: "market",
      name: "市場廣度",
      short: "Breadth",
      description:
        "比較上漲與下跌家數，判斷行情是否真正全面擴散。",
      source:
        "上市 / 上櫃漲跌家數"
    },

    {
      id: "advanceDeclineRatio",
      category: "market",
      name: "漲跌家數比",
      short: "A/D Ratio",
      description:
        "觀察上漲家數相對下跌家數，避免只被權值股指數誤導。",
      source:
        "市場廣度"
    },

    {
      id: "newHighLow",
      category: "market",
      name: "新高新低",
      short: "High / Low",
      description:
        "追蹤市場創近期新高與新低的股票數量。",
      source:
        "20 / 60 日新高新低"
    },

    {
      id: "limitUpDown",
      category: "market",
      name: "漲跌停結構",
      short: "Limit Structure",
      description:
        "觀察漲停與跌停家數，辨識市場短線情緒。",
      source:
        "漲停 / 跌停"
    },

    {
      id: "marketTurnover",
      category: "market",
      name: "市場成交額",
      short: "Turnover",
      description:
        "追蹤上市與上櫃總成交金額及量能變化。",
      source:
        "市場成交額"
    },

    {
      id: "taiexVsTpex",
      category: "market",
      name: "加權 vs 櫃買",
      short: "TAIEX / TPEX",
      description:
        "比較大型權值股與中小型股環境是否同步。",
      source:
        "TAIEX / TPEX"
    },


    /* ---------------------------------------------------------------------- */
    /* Price / Volume                                                         */
    /* ---------------------------------------------------------------------- */

    {
      id: "changePct",
      category: "priceVolume",
      name: "漲跌幅",
      short: "Change %",
      description:
        "目前股價相對前一交易日收盤的變動幅度。",
      source:
        "即時行情"
    },

    {
      id: "volumeRatio",
      category: "priceVolume",
      name: "量比",
      short: "Volume Ratio",
      description:
        "比較目前成交量與基準均量，快速找出異常放量股票。",
      source:
        "成交量 / 均量"
    },

    {
      id: "turnoverRank",
      category: "priceVolume",
      name: "成交額排名",
      short: "Turnover Rank",
      description:
        "找出今天真正有大量資金交易的股票。",
      source:
        "成交金額"
    },

    {
      id: "volumeRank",
      category: "priceVolume",
      name: "成交量排名",
      short: "Volume Rank",
      description:
        "依成交張數追蹤市場最活躍股票。",
      source:
        "成交量"
    },

    {
      id: "vwap",
      category: "priceVolume",
      name: "VWAP",
      short: "VWAP",
      description:
        "觀察價格相對成交量加權平均價格的位置。",
      source:
        "盤中價量"
    },

    {
      id: "amplitude",
      category: "priceVolume",
      name: "振幅",
      short: "Range",
      description:
        "衡量當日高低價格區間與波動程度。",
      source:
        "最高 / 最低"
    },

    {
      id: "turnoverRate",
      category: "priceVolume",
      name: "週轉率",
      short: "Turnover Rate",
      description:
        "觀察股票籌碼在市場中的換手活躍程度。",
      source:
        "成交量 / 流通股數"
    },


    /* ---------------------------------------------------------------------- */
    /* Technical                                                              */
    /* ---------------------------------------------------------------------- */

    {
      id: "relativeStrength",
      category: "technical",
      name: "相對強弱 RS",
      short: "RS",
      description:
        "比較個股與市場基準的價格表現，找出真正強於大盤的標的。",
      source:
        "個股 / 指數"
    },

    {
      id: "maAlignment",
      category: "technical",
      name: "均線排列",
      short: "MA Structure",
      description:
        "判斷短中長期均線是否形成多頭、空頭或糾結結構。",
      source:
        "MA"
    },

    {
      id: "breakout20",
      category: "technical",
      name: "20 日突破",
      short: "20D Breakout",
      description:
        "追蹤價格是否突破近 20 個交易日的重要高點。",
      source:
        "Price Structure"
    },

    {
      id: "breakout60",
      category: "technical",
      name: "60 日突破",
      short: "60D Breakout",
      description:
        "用較大週期辨識中期價格結構突破。",
      source:
        "Price Structure"
    },

    {
      id: "rsi",
      category: "technical",
      name: "RSI",
      short: "RSI",
      description:
        "衡量一定期間價格上漲與下跌動能。",
      source:
        "Technical"
    },

    {
      id: "kd",
      category: "technical",
      name: "KD",
      short: "KD",
      description:
        "觀察價格位於近期高低區間的位置與動能轉折。",
      source:
        "Technical"
    },

    {
      id: "macd",
      category: "technical",
      name: "MACD",
      short: "MACD",
      description:
        "觀察中短期趨勢動能與均線差值變化。",
      source:
        "Technical"
    },

    {
      id: "atr",
      category: "technical",
      name: "ATR 波動",
      short: "ATR",
      description:
        "衡量近期真實波動幅度，協助理解股票目前活躍程度。",
      source:
        "Volatility"
    },


    /* ---------------------------------------------------------------------- */
    /* Chips                                                                  */
    /* ---------------------------------------------------------------------- */

    {
      id: "majorHolder",
      category: "chips",
      name: "大戶持股",
      short: "Major Holders",
      description:
        "追蹤較大持股級距投資人的持股比例變化。",
      source:
        "集保股權分散"
    },

    {
      id: "retailHolder",
      category: "chips",
      name: "散戶持股",
      short: "Retail",
      description:
        "觀察小額持股級距的籌碼變化。",
      source:
        "集保股權分散"
    },

    {
      id: "branchConcentration",
      category: "chips",
      name: "分點集中度",
      short: "Branch Concentration",
      description:
        "分析券商分點買賣是否集中於少數交易來源。",
      source:
        "券商分點"
    },

    {
      id: "bigOrderBias",
      category: "chips",
      name: "大單買賣力",
      short: "Large Orders",
      description:
        "觀察盤中大單成交偏向買方或賣方。",
      source:
        "逐筆 / 大單"
    },

    {
      id: "marginBalance",
      category: "chips",
      name: "融資變化",
      short: "Margin",
      description:
        "追蹤融資餘額增加或減少。",
      source:
        "信用交易"
    },

    {
      id: "shortBalance",
      category: "chips",
      name: "融券變化",
      short: "Short",
      description:
        "追蹤融券餘額與空方籌碼變化。",
      source:
        "信用交易"
    },


    /* ---------------------------------------------------------------------- */
    /* Institution                                                            */
    /* ---------------------------------------------------------------------- */

    {
      id: "foreignNet",
      category: "institution",
      name: "外資買賣超",
      short: "Foreign",
      description:
        "追蹤外資單日與連續買賣超狀態。",
      source:
        "三大法人"
    },

    {
      id: "trustNet",
      category: "institution",
      name: "投信買賣超",
      short: "Investment Trust",
      description:
        "追蹤投信資金方向與連續買超狀態。",
      source:
        "三大法人"
    },

    {
      id: "dealerNet",
      category: "institution",
      name: "自營商買賣超",
      short: "Dealer",
      description:
        "觀察自營商資金在個股上的進出。",
      source:
        "三大法人"
    },

    {
      id: "institutionStreak",
      category: "institution",
      name: "法人連買",
      short: "Buy Streak",
      description:
        "統計法人連續買超或賣超天數。",
      source:
        "法人歷史"
    },

    {
      id: "institutionOwnership",
      category: "institution",
      name: "法人持股比",
      short: "Ownership",
      description:
        "觀察法人總持股比例與趨勢。",
      source:
        "持股資料"
    },


    /* ---------------------------------------------------------------------- */
    /* Fundamental                                                            */
    /* ---------------------------------------------------------------------- */

    {
      id: "revenueYoY",
      category: "fundamental",
      name: "月營收 YoY",
      short: "Revenue YoY",
      description:
        "比較本月營收與去年同期的成長率。",
      source:
        "月營收"
    },

    {
      id: "revenueMoM",
      category: "fundamental",
      name: "月營收 MoM",
      short: "Revenue MoM",
      description:
        "比較本月與前月營收變化。",
      source:
        "月營收"
    },

    {
      id: "eps",
      category: "fundamental",
      name: "EPS",
      short: "EPS",
      description:
        "觀察公司每股盈餘及其歷史變化。",
      source:
        "財報"
    },

    {
      id: "roe",
      category: "fundamental",
      name: "ROE",
      short: "ROE",
      description:
        "衡量公司使用股東權益創造獲利的效率。",
      source:
        "財報"
    },

    {
      id: "grossMargin",
      category: "fundamental",
      name: "毛利率",
      short: "Gross Margin",
      description:
        "追蹤公司產品或服務本身的獲利能力。",
      source:
        "財報"
    },

    {
      id: "operatingMargin",
      category: "fundamental",
      name: "營業利益率",
      short: "Operating Margin",
      description:
        "觀察本業營運的獲利效率。",
      source:
        "財報"
    },

    {
      id: "pe",
      category: "fundamental",
      name: "本益比",
      short: "P/E",
      description:
        "呈現市場價格相對公司盈餘的倍數。",
      source:
        "估值"
    },

    {
      id: "pb",
      category: "fundamental",
      name: "股價淨值比",
      short: "P/B",
      description:
        "呈現股價相對每股淨值的倍數。",
      source:
        "估值"
    },

    {
      id: "dividendYield",
      category: "fundamental",
      name: "殖利率",
      short: "Yield",
      description:
        "觀察現金股利相對目前股價的比率。",
      source:
        "股利"
    },


    /* ---------------------------------------------------------------------- */
    /* Theme                                                                  */
    /* ---------------------------------------------------------------------- */

    {
      id: "themeStrength",
      category: "theme",
      name: "題材強度",
      short: "Theme Strength",
      description:
        "整合題材內股票漲跌、量能與相對強弱。",
      source:
        "題材成分股"
    },

    {
      id: "themeBreadth",
      category: "theme",
      name: "題材擴散",
      short: "Theme Breadth",
      description:
        "判斷題材是少數領頭股上漲，還是整體同步轉強。",
      source:
        "題材成分股"
    },

    {
      id: "themeFlow",
      category: "theme",
      name: "題材資金流",
      short: "Theme Flow",
      description:
        "追蹤市場資金正在集中到哪些交易題材。",
      source:
        "成交額 / 題材"
    },

    {
      id: "leaderStatus",
      category: "theme",
      name: "族群領頭股",
      short: "Leader",
      description:
        "辨識題材中價格、量能與強度領先的股票。",
      source:
        "題材排序"
    },


    /* ---------------------------------------------------------------------- */
    /* Events                                                                 */
    /* ---------------------------------------------------------------------- */

    {
      id: "nearLimitUp",
      category: "event",
      name: "接近漲停",
      short: "Near Limit Up",
      description:
        "找出距離當日漲停價已經很近的股票。",
      source:
        "即時行情"
    },

    {
      id: "unusualVolume",
      category: "event",
      name: "異常爆量",
      short: "Volume Surge",
      description:
        "捕捉成交量突然明顯高於常態的股票。",
      source:
        "量能事件"
    },

    {
      id: "priceBreakout",
      category: "event",
      name: "價格突破",
      short: "Breakout",
      description:
        "追蹤價格突破近期重要結構位置。",
      source:
        "價格事件"
    },

    {
      id: "rapidRise",
      category: "event",
      name: "短線急漲",
      short: "Rapid Rise",
      description:
        "捕捉短時間內價格快速上升的股票。",
      source:
        "盤中行情"
    },

    {
      id: "revenueEvent",
      category: "event",
      name: "營收事件",
      short: "Revenue Event",
      description:
        "追蹤最新營收公布及明顯變化。",
      source:
        "月營收"
    },


    /* ---------------------------------------------------------------------- */
    /* Futures / Options                                                      */
    /* ---------------------------------------------------------------------- */

    {
      id: "txBasis",
      category: "derivatives",
      name: "台指期現貨價差",
      short: "TX Basis",
      description:
        "比較台指期貨與現貨指數之間的價差。",
      source:
        "期貨 / 現貨"
    },

    {
      id: "foreignFuturesOI",
      category: "derivatives",
      name: "外資台指期未平倉",
      short: "Foreign OI",
      description:
        "追蹤外資在台指期貨的未平倉部位變化。",
      source:
        "TAIFEX"
    },

    {
      id: "putCallRatio",
      category: "derivatives",
      name: "Put / Call Ratio",
      short: "P/C Ratio",
      description:
        "觀察選擇權 Put 與 Call 市場部位的相對關係。",
      source:
        "TAIFEX"
    },

    {
      id: "optionOI",
      category: "derivatives",
      name: "選擇權未平倉",
      short: "Option OI",
      description:
        "觀察主要履約價的 Call / Put 未平倉量分布。",
      source:
        "TAIFEX"
    }

  ]);


/* ========================================================================== */
/* Presets                                                                    */
/* ========================================================================== */

const PRESETS =
  Object.freeze({

    intraday: {
      name: "盤中短線",
      ids: [
        "changePct",
        "volumeRatio",
        "turnoverRank",
        "vwap",
        "relativeStrength",
        "nearLimitUp",
        "unusualVolume",
        "rapidRise"
      ]
    },

    swing: {
      name: "波段趨勢",
      ids: [
        "relativeStrength",
        "maAlignment",
        "breakout20",
        "breakout60",
        "volumeRatio",
        "institutionStreak",
        "themeStrength",
        "themeBreadth"
      ]
    },

    chips: {
      name: "法人籌碼",
      ids: [
        "foreignNet",
        "trustNet",
        "dealerNet",
        "institutionStreak",
        "majorHolder",
        "branchConcentration",
        "bigOrderBias",
        "marginBalance"
      ]
    },

    fundamental: {
      name: "基本財務",
      ids: [
        "revenueYoY",
        "revenueMoM",
        "eps",
        "roe",
        "grossMargin",
        "operatingMargin",
        "pe",
        "dividendYield"
      ]
    }

  });


/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

function escapeHTML(
  value
) {

  return String(
    value ?? ""
  ).replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[character]
  );
}


function getRoot() {

  if (
    typeof document ===
    "undefined"
  ) {
    return null;
  }


  return document.getElementById(
    ROOT_ID
  );
}


function isTWMarket() {

  if (
    typeof document ===
    "undefined"
  ) {
    return false;
  }


  return (
    document.body
      ?.dataset
      ?.market ===
    "tw"
  );
}


function loadSelected() {

  try {

    const raw =
      localStorage.getItem(
        STORAGE_KEY
      );


    if (!raw) {

      return new Set([
        "marketBreadth",
        "volumeRatio",
        "relativeStrength",
        "foreignNet",
        "trustNet",
        "themeStrength"
      ]);
    }


    const parsed =
      JSON.parse(
        raw
      );


    if (
      !Array.isArray(
        parsed
      )
    ) {
      return new Set();
    }


    return new Set(
      parsed.filter(
        id =>
          INDICATORS.some(
            indicator =>
              indicator.id === id
          )
      )
    );

  } catch {

    return new Set();
  }
}


function saveSelected(
  selected
) {

  try {

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        [...selected]
      )
    );

  } catch {

    /*
     * LocalStorage failure
     * must not break the UI.
     */
  }
}


function getReading(
  state,
  id
) {

  const source =
    state?.data
      ?.indicators;


  if (
    !source ||
    typeof source !==
    "object"
  ) {
    return null;
  }


  const raw =
    source[id];


  if (
    raw === null ||
    raw === undefined
  ) {
    return null;
  }


  if (
    typeof raw ===
    "object"
  ) {

    return {

      value:
        raw.value ??
        null,

      display:
        raw.display ??
        null,

      status:
        raw.status ||
        "ready",

      note:
        raw.note ||
        "",

      change:
        raw.change ??
        null

    };
  }


  return {
    value:
      raw,

    display:
      String(
        raw
      ),

    status:
      "ready",

    note:
      "",

    change:
      null
  };
}


function readingDisplay(
  reading
) {

  if (
    !reading ||
    reading.status ===
    "unavailable"
  ) {
    return "—";
  }


  if (
    reading.display !==
    null &&
    reading.display !==
    undefined &&
    reading.display !==
    ""
  ) {
    return escapeHTML(
      reading.display
    );
  }


  if (
    reading.value ===
    null ||
    reading.value ===
    undefined ||
    reading.value ===
    ""
  ) {
    return "—";
  }


  return escapeHTML(
    reading.value
  );
}


function categoryLabel(
  categoryId
) {

  return (
    CATEGORIES.find(
      item =>
        item.id ===
        categoryId
    )
      ?.label ||
    "其他"
  );
}


/* ========================================================================== */
/* Styles                                                                     */
/* ========================================================================== */

function ensureStyles() {

  if (
    document.getElementById(
      "ox-tw-indicator-style"
    )
  ) {
    return;
  }


  const style =
    document.createElement(
      "style"
    );


  style.id =
    "ox-tw-indicator-style";


  style.textContent = `

    #market-unavailable-card.tw-indicator-root {
      display: block;
      width: 100%;
      max-width: none;
      padding: 0;
      margin: 0;
      border: 0;
      background: transparent;
      box-shadow: none;
      text-align: left;

      --twi-border:
        rgba(255,255,255,.085);

      --twi-soft:
        rgba(255,255,255,.045);

      --twi-card:
        rgba(18,24,34,.74);

      --twi-strong:
        rgba(18,24,34,.90);

      --twi-muted:
        rgba(220,230,242,.56);

      --twi-accent:
        #8ea2ff;

      --twi-green:
        #35c793;
    }


    body.theme-light
    #market-unavailable-card.tw-indicator-root {

      --twi-border:
        rgba(47,63,84,.11);

      --twi-soft:
        rgba(37,55,79,.04);

      --twi-card:
        rgba(255,255,255,.78);

      --twi-strong:
        rgba(255,255,255,.94);

      --twi-muted:
        rgba(43,60,80,.58);

      --twi-accent:
        #566fe6;
    }


    .tw-indicator-root * {
      box-sizing: border-box;
    }


    .twi-shell {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }


    /* Header */

    .twi-header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 18px;
      padding: 4px 2px;
    }


    .twi-eyebrow {
      margin-bottom: 5px;
      color: var(--twi-muted);
      font-size: 11px;
      font-weight: 850;
      letter-spacing: .16em;
    }


    .twi-header h2 {
      margin: 0;
      color: var(--ink);
      font-size: clamp(25px,3vw,38px);
      line-height: 1.05;
    }


    .twi-header p {
      max-width: 720px;
      margin: 8px 0 0;
      color: var(--twi-muted);
      font-size: 12px;
      line-height: 1.65;
    }


    .twi-header-count {
      flex: 0 0 auto;
      min-width: 112px;
      padding: 13px 15px;
      border: 1px solid var(--twi-border);
      border-radius: 18px;
      background: var(--twi-card);
      text-align: center;
      backdrop-filter: blur(20px);
    }


    .twi-header-count small {
      display: block;
      color: var(--twi-muted);
      font-size: 9px;
    }


    .twi-header-count strong {
      display: block;
      margin-top: 4px;
      color: var(--ink);
      font-size: 26px;
    }


    /* Generic panel */

    .twi-panel {
      position: relative;
      overflow: hidden;
      padding: 18px;
      border: 1px solid var(--twi-border);
      border-radius: 22px;
      background: var(--twi-card);
      box-shadow:
        0 18px 44px
        rgba(0,0,0,.09);
      backdrop-filter:
        blur(22px)
        saturate(130%);
      -webkit-backdrop-filter:
        blur(22px)
        saturate(130%);
    }


    .twi-panel::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        linear-gradient(
          135deg,
          rgba(255,255,255,.05),
          transparent 40%
        );
    }


    .twi-panel-head {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }


    .twi-panel-head h3 {
      margin: 0;
      color: var(--ink);
      font-size: 15px;
    }


    .twi-panel-head p {
      margin: 5px 0 0;
      color: var(--twi-muted);
      font-size: 10px;
      line-height: 1.5;
    }


    .twi-panel-tag {
      padding: 5px 8px;
      border: 1px solid var(--twi-border);
      border-radius: 999px;
      color: var(--twi-muted);
      font-size: 9px;
      font-weight: 800;
      white-space: nowrap;
    }


    /* My Indicators */

    .twi-my-list {
      position: relative;
      z-index: 1;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }


    .twi-my-chip {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-height: 36px;
      padding: 0 8px 0 12px;
      border: 1px solid var(--twi-border);
      border-radius: 999px;
      background: var(--twi-soft);
    }


    .twi-my-chip span {
      color: var(--ink);
      font-size: 10px;
      font-weight: 750;
    }


    .twi-my-chip b {
      color: var(--twi-accent);
      font-size: 10px;
    }


    .twi-chip-remove {
      appearance: none;
      display: grid;
      place-items: center;
      width: 22px;
      height: 22px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: rgba(130,145,170,.10);
      color: var(--twi-muted);
      font-size: 13px;
      cursor: pointer;
    }


    .twi-empty-my {
      width: 100%;
      padding: 18px;
      border: 1px dashed var(--twi-border);
      border-radius: 15px;
      color: var(--twi-muted);
      font-size: 10px;
      text-align: center;
    }


    /* Presets */

    .twi-presets {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns:
        repeat(4,minmax(0,1fr));
      gap: 8px;
    }


    .twi-preset {
      appearance: none;
      min-height: 72px;
      padding: 12px;
      border: 1px solid var(--twi-border);
      border-radius: 15px;
      background: var(--twi-soft);
      color: var(--ink);
      text-align: left;
      cursor: pointer;
      transition:
        transform .15s ease,
        background .15s ease;
    }


    .twi-preset:hover {
      transform: translateY(-1px);
      background:
        rgba(120,140,255,.09);
    }


    .twi-preset strong {
      display: block;
      font-size: 11px;
    }


    .twi-preset small {
      display: block;
      margin-top: 5px;
      color: var(--twi-muted);
      font-size: 9px;
      line-height: 1.35;
    }


    /* Search */

    .twi-toolbar {
      position: relative;
      z-index: 1;
      display: flex;
      gap: 10px;
      align-items: center;
    }


    .twi-search {
      flex: 1 1 auto;
      min-width: 0;
      height: 42px;
      padding: 0 14px;
      border: 1px solid var(--twi-border);
      border-radius: 14px;
      outline: none;
      background: var(--twi-soft);
      color: var(--ink);
      font: inherit;
      font-size: 11px;
    }


    .twi-search::placeholder {
      color: var(--twi-muted);
    }


    .twi-clear {
      appearance: none;
      flex: 0 0 auto;
      height: 42px;
      padding: 0 13px;
      border: 1px solid var(--twi-border);
      border-radius: 14px;
      background: var(--twi-soft);
      color: var(--ink);
      font: inherit;
      font-size: 10px;
      font-weight: 800;
      cursor: pointer;
    }


    /* Categories */

    .twi-categories {
      position: relative;
      z-index: 1;
      display: flex;
      gap: 7px;
      margin-top: 11px;
      padding-bottom: 2px;
      overflow-x: auto;
      scrollbar-width: none;
    }


    .twi-categories::-webkit-scrollbar {
      display: none;
    }


    .twi-category {
      appearance: none;
      flex: 0 0 auto;
      min-height: 31px;
      padding: 0 11px;
      border: 1px solid var(--twi-border);
      border-radius: 999px;
      background: transparent;
      color: var(--twi-muted);
      font: inherit;
      font-size: 9px;
      font-weight: 800;
      cursor: pointer;
    }


    .twi-category.active {
      background:
        rgba(125,145,255,.13);
      color: var(--ink);
      border-color:
        rgba(125,145,255,.30);
    }


    /* Cards */

    .twi-library-grid {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns:
        repeat(3,minmax(0,1fr));
      gap: 9px;
      margin-top: 13px;
    }


    .twi-card {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 177px;
      padding: 13px;
      border: 1px solid var(--twi-border);
      border-radius: 16px;
      background: var(--twi-soft);
    }


    .twi-card.selected {
      border-color:
        rgba(125,145,255,.34);
      background:
        linear-gradient(
          145deg,
          rgba(125,145,255,.09),
          var(--twi-soft)
        );
    }


    .twi-card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 9px;
    }


    .twi-card-title {
      min-width: 0;
    }


    .twi-card-title strong {
      display: block;
      color: var(--ink);
      font-size: 12px;
    }


    .twi-card-title small {
      display: block;
      margin-top: 3px;
      color: var(--twi-muted);
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }


    .twi-add {
      appearance: none;
      flex: 0 0 auto;
      min-width: 48px;
      height: 28px;
      padding: 0 8px;
      border: 1px solid var(--twi-border);
      border-radius: 999px;
      background: transparent;
      color: var(--twi-muted);
      font: inherit;
      font-size: 8px;
      font-weight: 850;
      cursor: pointer;
    }


    .twi-card.selected
    .twi-add {
      color: var(--twi-accent);
      border-color:
        rgba(125,145,255,.28);
      background:
        rgba(125,145,255,.08);
    }


    .twi-reading {
      margin-top: 14px;
    }


    .twi-reading strong {
      display: block;
      color: var(--ink);
      font-size: 22px;
      line-height: 1;
      font-variant-numeric:
        tabular-nums;
    }


    .twi-reading small {
      display: block;
      margin-top: 5px;
      min-height: 13px;
      color: var(--twi-muted);
      font-size: 8px;
    }


    .twi-card-desc {
      margin: 12px 0 0;
      color: var(--twi-muted);
      font-size: 9px;
      line-height: 1.5;
    }


    .twi-card-source {
      margin-top: auto;
      padding-top: 10px;
      color: var(--twi-muted);
      font-size: 8px;
      opacity: .78;
    }


    .twi-library-empty {
      grid-column: 1 / -1;
      padding: 28px;
      border: 1px dashed var(--twi-border);
      border-radius: 15px;
      color: var(--twi-muted);
      text-align: center;
      font-size: 10px;
    }


    /* Footer */

    .twi-footer-note {
      color: var(--twi-muted);
      font-size: 9px;
      line-height: 1.65;
    }


    @media (max-width: 950px) {

      .twi-library-grid {
        grid-template-columns:
          repeat(2,minmax(0,1fr));
      }


      .twi-presets {
        grid-template-columns:
          repeat(2,minmax(0,1fr));
      }

    }


    @media (max-width: 680px) {

      #market-unavailable-card.tw-indicator-root {
        padding: 0 !important;
      }


      .twi-shell {
        gap: 12px;
      }


      .twi-header {
        align-items: flex-start;
      }


      .twi-header h2 {
        font-size: 26px;
      }


      .twi-header p {
        font-size: 10px;
      }


      .twi-header-count {
        min-width: 82px;
        padding: 11px 9px;
      }


      .twi-header-count strong {
        font-size: 22px;
      }


      .twi-panel {
        padding: 14px;
        border-radius: 18px;
      }


      .twi-library-grid {
        grid-template-columns: 1fr;
      }


      .twi-card {
        min-height: 0;
      }


      .twi-toolbar {
        align-items: stretch;
      }


      .twi-search {
        width: 100%;
      }

    }


    @media (max-width: 430px) {

      .twi-header {
        gap: 9px;
      }


      .twi-header-count {
        min-width: 75px;
      }


      .twi-presets {
        grid-template-columns:
          1fr
          1fr;
      }


      .twi-preset {
        min-height: 67px;
        padding: 10px;
      }

    }

  `;


  document.head.appendChild(
    style
  );
}


/* ========================================================================== */
/* Rendering helpers                                                          */
/* ========================================================================== */

function renderMyIndicators(
  selected,
  state
) {

  const items =
    INDICATORS.filter(
      indicator =>
        selected.has(
          indicator.id
        )
    );


  if (
    !items.length
  ) {

    return `
      <div class="twi-empty-my">
        尚未加入任何指標。從下方指標庫挑選你真正會用的工具。
      </div>
    `;
  }


  return items
    .map(
      indicator => {

        const reading =
          getReading(
            state,
            indicator.id
          );


        return `
          <div
            class="twi-my-chip"
          >

            <span>
              ${escapeHTML(
                indicator.name
              )}
            </span>

            <b>
              ${readingDisplay(
                reading
              )}
            </b>

            <button
              type="button"
              class="twi-chip-remove"
              data-remove-indicator="${escapeHTML(
                indicator.id
              )}"
              aria-label="移除 ${escapeHTML(
                indicator.name
              )}"
            >
              ×
            </button>

          </div>
        `;
      }
    )
    .join(
      ""
    );
}


function renderIndicatorCard(
  indicator,
  selected,
  state
) {

  const isSelected =
    selected.has(
      indicator.id
    );


  const reading =
    getReading(
      state,
      indicator.id
    );


  const note =
    reading?.note ||
    (
      reading
        ? "資料已接入"
        : "資料待接"
    );


  return `

    <article
      class="
        twi-card
        ${
          isSelected
            ? "selected"
            : ""
        }
      "
      data-indicator-card="${escapeHTML(
        indicator.id
      )}"
    >

      <div
        class="twi-card-top"
      >

        <div
          class="twi-card-title"
        >

          <strong>
            ${escapeHTML(
              indicator.name
            )}
          </strong>

          <small>
            ${escapeHTML(
              categoryLabel(
                indicator.category
              )
            )}
            ·
            ${escapeHTML(
              indicator.short
            )}
          </small>

        </div>


        <button
          type="button"
          class="twi-add"
          data-toggle-indicator="${escapeHTML(
            indicator.id
          )}"
        >
          ${
            isSelected
              ? "已加入"
              : "＋ 加入"
          }
        </button>

      </div>


      <div
        class="twi-reading"
      >

        <strong>
          ${readingDisplay(
            reading
          )}
        </strong>

        <small>
          ${escapeHTML(
            note
          )}
        </small>

      </div>


      <p
        class="twi-card-desc"
      >
        ${escapeHTML(
          indicator.description
        )}
      </p>


      <div
        class="twi-card-source"
      >
        DATA ·
        ${escapeHTML(
          indicator.source
        )}
      </div>

    </article>
  `;
}


function filteredIndicators(
  category,
  keyword
) {

  const normalizedKeyword =
    String(
      keyword ||
      ""
    )
      .trim()
      .toLowerCase();


  return INDICATORS.filter(
    indicator => {

      const categoryMatch =
        category === "all" ||
        indicator.category ===
          category;


      if (
        !categoryMatch
      ) {
        return false;
      }


      if (
        !normalizedKeyword
      ) {
        return true;
      }


      const haystack =
        [
          indicator.name,
          indicator.short,
          indicator.description,
          indicator.source,
          categoryLabel(
            indicator.category
          )
        ]
          .join(" ")
          .toLowerCase();


      return haystack.includes(
        normalizedKeyword
      );
    }
  );
}


/* ========================================================================== */
/* Public renderer                                                            */
/* ========================================================================== */

export function renderTWStrength(
  state
) {

  if (
    !isTWMarket()
  ) {

    return {
      view: "strength",
      status:
        state?.status ||
        "inactive"
    };
  }


  const root =
    getRoot();


  if (
    !root
  ) {

    return {
      view: "strength",
      status:
        "missing-root"
    };
  }


  ensureStyles();


  root.hidden =
    false;


  root.classList.add(
    "tw-indicator-root"
  );


  root.classList.remove(
    "tw-home-root",
    "tw-radar-root"
  );


  const selected =
    loadSelected();


  let activeCategory =
    "all";


  let searchValue =
    "";


  root.innerHTML = `

    <div
      class="twi-shell"
    >


      <!-- ============================================================ -->
      <!-- HEADER                                                       -->
      <!-- ============================================================ -->

      <header
        class="twi-header"
      >

        <div>

          <div
            class="twi-eyebrow"
          >
            OX · INDICATOR CENTER
          </div>

          <h2
            id="market-unavailable-title"
          >
            指標中心
          </h2>

          <p
            id="market-unavailable-copy"
          >
            不把幾十個指標一次塞滿畫面。
            你自己決定要看市場、價量、技術、籌碼、
            法人、基本面、題材或期權資料。
          </p>

        </div>


        <div
          class="twi-header-count"
        >

          <small>
            MY INDICATORS
          </small>

          <strong
            id="twi-selected-count"
          >
            ${selected.size}
          </strong>

        </div>

      </header>


      <!-- ============================================================ -->
      <!-- MY INDICATORS                                                -->
      <!-- ============================================================ -->

      <section
        class="twi-panel"
      >

        <div
          class="twi-panel-head"
        >

          <div>

            <h3>
              我的指標
            </h3>

            <p>
              只留下你真正會看的資訊。
            </p>

          </div>

          <span
            class="twi-panel-tag"
          >
            PERSONAL
          </span>

        </div>


        <div
          class="twi-my-list"
          id="twi-my-list"
        >
        </div>

      </section>


      <!-- ============================================================ -->
      <!-- QUICK PRESETS                                                -->
      <!-- ============================================================ -->

      <section
        class="twi-panel"
      >

        <div
          class="twi-panel-head"
        >

          <div>

            <h3>
              快速組合
            </h3>

            <p>
              一鍵載入常見工作方式，之後仍可自由增減。
            </p>

          </div>

          <span
            class="twi-panel-tag"
          >
            PRESETS
          </span>

        </div>


        <div
          class="twi-presets"
        >

          <button
            type="button"
            class="twi-preset"
            data-preset="intraday"
          >
            <strong>
              盤中短線
            </strong>

            <small>
              價量、RS、急漲、爆量、接近漲停
            </small>
          </button>


          <button
            type="button"
            class="twi-preset"
            data-preset="swing"
          >
            <strong>
              波段趨勢
            </strong>

            <small>
              趨勢、突破、相對強弱、題材擴散
            </small>
          </button>


          <button
            type="button"
            class="twi-preset"
            data-preset="chips"
          >
            <strong>
              法人籌碼
            </strong>

            <small>
              外資、投信、大戶、分點與大單
            </small>
          </button>


          <button
            type="button"
            class="twi-preset"
            data-preset="fundamental"
          >
            <strong>
              基本財務
            </strong>

            <small>
              營收、EPS、ROE、毛利率與估值
            </small>
          </button>

        </div>

      </section>


      <!-- ============================================================ -->
      <!-- LIBRARY                                                      -->
      <!-- ============================================================ -->

      <section
        class="twi-panel"
      >

        <div
          class="twi-panel-head"
        >

          <div>

            <h3>
              指標庫
            </h3>

            <p>
              搜尋後加入自己的 OX 工作區。
            </p>

          </div>

          <span
            class="twi-panel-tag"
            id="twi-library-count"
          >
            ${INDICATORS.length} TOOLS
          </span>

        </div>


        <div
          class="twi-toolbar"
        >

          <input
            class="twi-search"
            id="twi-search"
            type="search"
            autocomplete="off"
            placeholder="搜尋：量比、投信、RS、營收、Put / Call…"
          >

          <button
            type="button"
            class="twi-clear"
            id="twi-clear"
          >
            清除
          </button>

        </div>


        <div
          class="twi-categories"
          id="twi-categories"
        >

          ${CATEGORIES
            .map(
              category => `

                <button
                  type="button"
                  class="
                    twi-category
                    ${
                      category.id ===
                      "all"
                        ? "active"
                        : ""
                    }
                  "
                  data-indicator-category="${escapeHTML(
                    category.id
                  )}"
                >
                  ${escapeHTML(
                    category.label
                  )}
                </button>

              `
            )
            .join(
              ""
            )}

        </div>


        <div
          class="twi-library-grid"
          id="twi-library-grid"
        >
        </div>

      </section>


      <section
        class="twi-panel"
      >

        <div
          class="twi-footer-note"
        >
          OX 指標中心本身不產生行情。
          所有數值都必須由 TW Provider →
          TW Engine 正規化後再顯示。
          目前尚未接入的資料會保持「— / 資料待接」，
          不會使用假數據補畫面。
        </div>

      </section>


    </div>
  `;


  /* ======================================================================== */
  /* Dynamic UI                                                               */
  /* ======================================================================== */

  const myList =
    root.querySelector(
      "#twi-my-list"
    );


  const libraryGrid =
    root.querySelector(
      "#twi-library-grid"
    );


  const libraryCount =
    root.querySelector(
      "#twi-library-count"
    );


  const selectedCount =
    root.querySelector(
      "#twi-selected-count"
    );


  const searchInput =
    root.querySelector(
      "#twi-search"
    );


  function refreshUI() {

    if (
      myList
    ) {

      myList.innerHTML =
        renderMyIndicators(
          selected,
          state
        );
    }


    const filtered =
      filteredIndicators(
        activeCategory,
        searchValue
      );


    if (
      libraryGrid
    ) {

      libraryGrid.innerHTML =
        filtered.length
          ? filtered
              .map(
                indicator =>
                  renderIndicatorCard(
                    indicator,
                    selected,
                    state
                  )
              )
              .join("")
          : `
              <div
                class="twi-library-empty"
              >
                找不到符合條件的指標。
              </div>
            `;
    }


    if (
      libraryCount
    ) {

      libraryCount.textContent =
        `${filtered.length} TOOLS`;
    }


    if (
      selectedCount
    ) {

      selectedCount.textContent =
        String(
          selected.size
        );
    }


    root
      .querySelectorAll(
        "[data-indicator-category]"
      )
      .forEach(
        button => {

          button.classList.toggle(
            "active",
            button.dataset
              .indicatorCategory ===
              activeCategory
          );

        }
      );


    saveSelected(
      selected
    );
  }


  /* ======================================================================== */
  /* Search                                                                   */
  /* ======================================================================== */

  searchInput
    ?.addEventListener(
      "input",
      event => {

        searchValue =
          event.target
            .value ||
          "";


        refreshUI();
      }
    );


  root
    .querySelector(
      "#twi-clear"
    )
    ?.addEventListener(
      "click",
      () => {

        searchValue =
          "";


        activeCategory =
          "all";


        if (
          searchInput
        ) {
          searchInput.value =
            "";
        }


        refreshUI();
      }
    );


  /* ======================================================================== */
  /* Event delegation                                                         */
  /* ======================================================================== */

  root.addEventListener(
    "click",
    event => {

      const categoryButton =
        event.target.closest(
          "[data-indicator-category]"
        );


      if (
        categoryButton
      ) {

        activeCategory =
          categoryButton
            .dataset
            .indicatorCategory ||
          "all";


        refreshUI();

        return;
      }


      const toggleButton =
        event.target.closest(
          "[data-toggle-indicator]"
        );


      if (
        toggleButton
      ) {

        const id =
          toggleButton
            .dataset
            .toggleIndicator;


        if (
          selected.has(
            id
          )
        ) {

          selected.delete(
            id
          );

        } else {

          selected.add(
            id
          );
        }


        refreshUI();

        return;
      }


      const removeButton =
        event.target.closest(
          "[data-remove-indicator]"
        );


      if (
        removeButton
      ) {

        selected.delete(
          removeButton
            .dataset
            .removeIndicator
        );


        refreshUI();

        return;
      }


      const presetButton =
        event.target.closest(
          "[data-preset]"
        );


      if (
        presetButton
      ) {

        const preset =
          PRESETS[
            presetButton
              .dataset
              .preset
          ];


        if (
          preset
        ) {

          selected.clear();


          preset.ids.forEach(
            id => {

              selected.add(
                id
              );

            }
          );


          refreshUI();
        }
      }

    }
  );


  refreshUI();


  return {

    view:
      "strength",

    status:
      state?.status ||
      "placeholder",

    selected:
      [...selected],

    data:
      state?.data ||
      null

  };
}
