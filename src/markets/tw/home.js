/*
 * OX v4.0 Modular
 * Taiwan Market Home
 *
 * Provider-agnostic renderer.
 *
 * Responsibility:
 * - Render Taiwan market command center.
 * - Read data only from TW Market State.
 * - Never call TWSE / TPEX / broker APIs directly.
 * - Never mix Crypto / US / Forex data.
 *
 * Future normalized data contract:
 *
 * state.data = {
 *
 *   session: "PRE_OPEN" | "REGULAR" | "CLOSED",
 *
 *   updatedAt,
 *
 *   pulse: {
 *     TAIEX: {
 *       symbol,
 *       name,
 *       price,
 *       changePct,
 *       turnoverTwd
 *     },
 *
 *     TPEX: {
 *       symbol,
 *       name,
 *       price,
 *       changePct,
 *       turnoverTwd
 *     },
 *
 *     TX: {
 *       symbol,
 *       name,
 *       price,
 *       changePct
 *     }
 *   },
 *
 *   breadth: {
 *     advancers,
 *     decliners,
 *     unchanged,
 *     limitUp,
 *     limitDown,
 *     newHigh20,
 *     newLow20,
 *     surgeCount,
 *     turnoverTwd
 *   },
 *
 *   moneyFlow: {
 *     foreignNetTwd,
 *     trustNetTwd,
 *     dealerNetTwd,
 *     marginChangeTwd,
 *     bigOrderBias
 *   },
 *
 *   themes: [
 *     {
 *       name,
 *       changePct,
 *       flowTwd,
 *       volumeRatio,
 *       advanceCount,
 *       declineCount,
 *       leaderSymbol,
 *       leaderName
 *     }
 *   ],
 *
 *   opportunities: [
 *     {
 *       time,
 *       symbol,
 *       name,
 *       type,
 *       description
 *     }
 *   ],
 *
 *   myOX: {
 *     watchlistCount,
 *     todayTriggers,
 *     strategyMatches,
 *     unreadAlerts,
 *
 *     watchlist: [],
 *     strategies: []
 *   }
 *
 * }
 */


const HOME_ROOT_ID =
  "market-unavailable-card";


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


function finiteNumber(
  value
) {

  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number =
    Number(value);


  return Number.isFinite(
    number
  )
    ? number
    : null;
}


function formatNumber(
  value,
  digits = 0
) {

  const number =
    finiteNumber(
      value
    );


  if (
    number === null
  ) {
    return "—";
  }


  return new Intl.NumberFormat(
    "zh-TW",
    {
      minimumFractionDigits:
        digits,

      maximumFractionDigits:
        digits
    }
  ).format(
    number
  );
}


function formatIndex(
  value
) {

  const number =
    finiteNumber(
      value
    );


  if (
    number === null
  ) {
    return "—";
  }


  return new Intl.NumberFormat(
    "zh-TW",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ).format(
    number
  );
}


function formatPercent(
  value
) {

  const number =
    finiteNumber(
      value
    );


  if (
    number === null
  ) {
    return "—";
  }


  return `${
    number > 0
      ? "+"
      : ""
  }${number.toFixed(
    2
  )}%`;
}


function formatTwd(
  value
) {

  const number =
    finiteNumber(
      value
    );


  if (
    number === null
  ) {
    return "—";
  }


  const hundredMillion =
    number / 100000000;


  if (
    Math.abs(
      hundredMillion
    ) >= 1
  ) {

    return `${
      hundredMillion >
      0
        ? "+"
        : ""
    }${hundredMillion.toLocaleString(
      "zh-TW",
      {
        maximumFractionDigits: 1
      }
    )} 億`;
  }


  const tenThousand =
    number / 10000;


  return `${
    tenThousand > 0
      ? "+"
      : ""
  }${tenThousand.toLocaleString(
    "zh-TW",
    {
      maximumFractionDigits: 0
    }
  )} 萬`;
}


function formatTurnover(
  value
) {

  const number =
    finiteNumber(
      value
    );


  if (
    number === null
  ) {
    return "—";
  }


  return `${
    (
      number /
      100000000
    ).toLocaleString(
      "zh-TW",
      {
        maximumFractionDigits: 0
      }
    )
  } 億`;
}


function changeClass(
  value
) {

  const number =
    finiteNumber(
      value
    );


  if (
    number === null
  ) {
    return "";
  }


  if (
    number > 0
  ) {
    return "is-up";
  }


  if (
    number < 0
  ) {
    return "is-down";
  }


  return "";
}


function formatUpdatedAt(
  value
) {

  if (
    !value
  ) {
    return "—";
  }


  const date =
    new Date(
      value
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }


  try {

    return new Intl.DateTimeFormat(
      "zh-TW",
      {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }
    ).format(
      date
    );

  } catch {

    return "—";
  }
}


function sessionLabel(
  value,
  hasDailyPulse = false,
  status = "loading"
) {

  switch (
    value
  ) {

    case "PRE_OPEN":
      return "開盤前";

    case "REGULAR":
      return "盤中";

    case "CLOSED":
      return "已收盤";

    default:
      return hasDailyPulse ? "官方日收盤資料" : status === "partial" ? "部分官方日資料" : "資料載入中";
  }
}


/* ========================================================================== */
/* DOM                                                                        */
/* ========================================================================== */

function getRoot() {

  if (
    typeof document ===
    "undefined"
  ) {
    return null;
  }


  return document.getElementById(
    HOME_ROOT_ID
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


/* ========================================================================== */
/* Styles                                                                     */
/* ========================================================================== */

function ensureStyles() {

  if (
    typeof document ===
    "undefined"
  ) {
    return;
  }


  if (
    document.getElementById(
      "ox-tw-home-style"
    )
  ) {
    return;
  }


  const style =
    document.createElement(
      "style"
    );


  style.id =
    "ox-tw-home-style";


  style.textContent = `

    /* ================================================================ */
    /* TW HOME ROOT                                                     */
    /* ================================================================ */

    #market-unavailable-card.tw-home-root {
      display: block;
      width: 100%;
      max-width: none;
      padding: 0;
      margin: 0;
      border: 0;
      background: transparent;
      box-shadow: none;
      text-align: left;

      --tw-up: #32c48d;
      --tw-down: #ef667b;

      --tw-border:
        rgba(255,255,255,.085);

      --tw-soft:
        rgba(255,255,255,.045);

      --tw-card:
        rgba(18,24,34,.72);

      --tw-card-strong:
        rgba(18,24,34,.88);

      --tw-muted:
        rgba(220,230,242,.56);
    }


    body.theme-light
    #market-unavailable-card.tw-home-root {

      --tw-border:
        rgba(46,62,82,.11);

      --tw-soft:
        rgba(30,48,72,.035);

      --tw-card:
        rgba(255,255,255,.76);

      --tw-card-strong:
        rgba(255,255,255,.93);

      --tw-muted:
        rgba(43,61,82,.56);
    }


    .tw-home-root * {
      box-sizing: border-box;
    }


    .tw-home-shell {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }


    /* ================================================================ */
    /* TOP BAR                                                          */
    /* ================================================================ */

    .tw-home-topbar {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 18px;
      padding: 4px 2px 2px;
    }


    .tw-home-eyebrow {
      margin-bottom: 5px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .16em;
      color: var(--tw-muted);
    }


    .tw-home-topbar h2 {
      margin: 0;
      font-size: clamp(25px, 3vw, 38px);
      line-height: 1.06;
      color: var(--ink);
    }


    .tw-home-topbar p {
      margin: 8px 0 0;
      max-width: 720px;
      color: var(--tw-muted);
      line-height: 1.65;
      font-size: 13px;
    }


    .tw-home-system {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 7px;
    }


    .tw-home-chip {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 0 10px;
      border: 1px solid var(--tw-border);
      border-radius: 999px;
      background: var(--tw-soft);
      color: var(--tw-muted);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .06em;
      white-space: nowrap;
    }


    .tw-home-chip.live::before {
      content: "";
      width: 6px;
      height: 6px;
      margin-right: 7px;
      border-radius: 50%;
      background: var(--tw-up);
      box-shadow:
        0 0 12px
        rgba(50,196,141,.75);
    }

    .tw-home-refresh {
      min-height: 44px;
      padding: 0 15px;
      border: 1px solid var(--tw-border);
      border-radius: 12px;
      background: var(--tw-soft);
      color: var(--ink);
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
    }
    .tw-home-refresh:disabled { opacity: .55; cursor: wait; }
    .tw-home-notice {
      padding: 12px 14px;
      border: 1px solid rgba(239,187,86,.32);
      border-radius: 12px;
      color: var(--ink);
      background: rgba(239,187,86,.07);
      font-size: 12px;
      line-height: 1.5;
    }


    /* ================================================================ */
    /* GENERIC CARD                                                      */
    /* ================================================================ */

    .tw-panel {
      position: relative;
      overflow: hidden;
      border: 1px solid var(--tw-border);
      border-radius: 22px;
      background: var(--tw-card);
      box-shadow:
        0 18px 44px
        rgba(0,0,0,.10);
      backdrop-filter:
        blur(22px)
        saturate(130%);
      -webkit-backdrop-filter:
        blur(22px)
        saturate(130%);
    }


    .tw-panel::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        linear-gradient(
          135deg,
          rgba(255,255,255,.055),
          transparent 42%
        );
    }


    .tw-panel-head {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 16px;
    }


    .tw-panel-head h3 {
      margin: 0;
      color: var(--ink);
      font-size: 15px;
      letter-spacing: .01em;
    }


    .tw-panel-head p {
      margin: 5px 0 0;
      color: var(--tw-muted);
      font-size: 11px;
      line-height: 1.5;
    }


    .tw-panel-tag {
      flex: 0 0 auto;
      padding: 5px 8px;
      border-radius: 999px;
      border: 1px solid var(--tw-border);
      color: var(--tw-muted);
      font-size: 9px;
      font-weight: 850;
      letter-spacing: .08em;
    }


    /* ================================================================ */
    /* MARKET PULSE                                                      */
    /* ================================================================ */

    .tw-pulse {
      padding: 20px;
      background: var(--tw-card-strong);
    }


    .tw-pulse-grid {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns:
        minmax(0,1.65fr)
        repeat(2,minmax(0,1fr));
      gap: 10px;
    }


    .tw-pulse-card {
      min-width: 0;
      padding: 15px;
      border-radius: 17px;
      border: 1px solid var(--tw-border);
      background: var(--tw-soft);
    }


    .tw-pulse-card.primary {
      padding: 18px;
      background:
        linear-gradient(
          145deg,
          rgba(107,135,255,.10),
          rgba(255,255,255,.025)
        );
    }


    .tw-pulse-name {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 13px;
    }


    .tw-pulse-name strong {
      color: var(--ink);
      font-size: 13px;
    }


    .tw-pulse-name small {
      color: var(--tw-muted);
      font-size: 9px;
      font-weight: 800;
    }


    .tw-pulse-value {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 8px;
    }


    .tw-pulse-value b {
      color: var(--ink);
      font-size: clamp(20px, 2.4vw, 32px);
      font-variant-numeric: tabular-nums;
    }


    .tw-pulse-card:not(.primary)
    .tw-pulse-value b {
      font-size: 20px;
    }


    .tw-pulse-value span {
      font-size: 12px;
      font-weight: 850;
    }


    .tw-pulse-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 11px;
      color: var(--tw-muted);
      font-size: 10px;
    }


    .is-up {
      color: var(--tw-up) !important;
    }


    .is-down {
      color: var(--tw-down) !important;
    }


    /* ================================================================ */
    /* MARKET STRUCTURE                                                 */
    /* ================================================================ */

    .tw-structure-bar {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns:
        repeat(3,1fr);
      gap: 9px;
      margin-top: 12px;
    }


    .tw-structure-item {
      padding: 11px;
      border-radius: 14px;
      background: var(--tw-soft);
      border: 1px solid var(--tw-border);
    }


    .tw-structure-item small {
      display: block;
      margin-bottom: 6px;
      color: var(--tw-muted);
      font-size: 9px;
    }


    .tw-structure-item b {
      color: var(--ink);
      font-size: 12px;
    }


    /* ================================================================ */
    /* TWO COLUMN                                                       */
    /* ================================================================ */

    .tw-home-two {
      display: grid;
      grid-template-columns:
        minmax(0,1fr)
        minmax(0,1fr);
      gap: 14px;
    }


    .tw-xray,
    .tw-money {
      padding: 18px;
    }


    /* ================================================================ */
    /* X-RAY                                                            */
    /* ================================================================ */

    .tw-xray-grid {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns:
        repeat(4,minmax(0,1fr));
      gap: 8px;
    }


    .tw-xray-cell {
      padding: 12px 9px;
      border: 1px solid var(--tw-border);
      border-radius: 14px;
      background: var(--tw-soft);
    }


    .tw-xray-cell small {
      display: block;
      min-height: 27px;
      color: var(--tw-muted);
      font-size: 9px;
      line-height: 1.35;
    }


    .tw-xray-cell strong {
      display: block;
      margin-top: 5px;
      color: var(--ink);
      font-size: 18px;
      font-variant-numeric: tabular-nums;
    }


    .tw-breadth-track {
      position: relative;
      z-index: 1;
      margin-top: 13px;
      height: 7px;
      overflow: hidden;
      border-radius: 999px;
      background:
        rgba(239,102,123,.19);
    }


    .tw-breadth-track i {
      display: block;
      width: var(--tw-breadth,50%);
      height: 100%;
      border-radius: inherit;
      background: var(--tw-up);
      transition: width .35s ease;
    }


    .tw-breadth-caption {
      position: relative;
      z-index: 1;
      display: flex;
      justify-content: space-between;
      margin-top: 7px;
      color: var(--tw-muted);
      font-size: 9px;
    }


    /* ================================================================ */
    /* MONEY FLOW                                                       */
    /* ================================================================ */

    .tw-money-list {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }


    .tw-money-row {
      display: grid;
      grid-template-columns:
        minmax(0,1fr)
        auto;
      align-items: center;
      gap: 12px;
      min-height: 42px;
      padding: 0 12px;
      border-radius: 13px;
      border: 1px solid var(--tw-border);
      background: var(--tw-soft);
    }


    .tw-money-row span {
      color: var(--tw-muted);
      font-size: 11px;
    }


    .tw-money-row strong {
      color: var(--ink);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }


    /* ================================================================ */
    /* THEME FLOW                                                       */
    /* ================================================================ */

    .tw-theme {
      padding: 18px;
    }


    .tw-theme-list {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }


    .tw-theme-row {
      display: grid;
      grid-template-columns:
        32px
        minmax(120px,1.3fr)
        minmax(80px,.65fr)
        minmax(80px,.65fr)
        minmax(110px,1fr);
      align-items: center;
      gap: 10px;
      padding: 11px 12px;
      border: 1px solid var(--tw-border);
      border-radius: 15px;
      background: var(--tw-soft);
    }


    .tw-theme-rank {
      display: grid;
      place-items: center;
      width: 25px;
      height: 25px;
      border-radius: 9px;
      background:
        rgba(124,145,255,.10);
      color: var(--ink);
      font-size: 10px;
      font-weight: 900;
    }


    .tw-theme-name strong,
    .tw-theme-leader strong {
      display: block;
      color: var(--ink);
      font-size: 11px;
    }


    .tw-theme-name small,
    .tw-theme-leader small,
    .tw-theme-stat small {
      display: block;
      margin-top: 3px;
      color: var(--tw-muted);
      font-size: 9px;
    }


    .tw-theme-stat b {
      color: var(--ink);
      font-size: 11px;
    }


    /* ================================================================ */
    /* FEED + MY OX                                                     */
    /* ================================================================ */

    .tw-opportunity,
    .tw-myox {
      padding: 18px;
    }


    .tw-feed {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }


    .tw-feed-row {
      display: grid;
      grid-template-columns:
        44px
        minmax(0,1fr);
      gap: 11px;
      padding: 10px 11px;
      border-radius: 14px;
      border: 1px solid var(--tw-border);
      background: var(--tw-soft);
    }


    .tw-feed-time {
      color: var(--tw-muted);
      font-size: 9px;
      font-variant-numeric: tabular-nums;
    }


    .tw-feed-copy strong {
      color: var(--ink);
      font-size: 11px;
    }


    .tw-feed-copy p {
      margin: 4px 0 0;
      color: var(--tw-muted);
      font-size: 10px;
      line-height: 1.45;
    }


    .tw-empty {
      position: relative;
      z-index: 1;
      display: grid;
      place-items: center;
      min-height: 92px;
      padding: 18px;
      border: 1px dashed var(--tw-border);
      border-radius: 15px;
      text-align: center;
      color: var(--tw-muted);
      font-size: 10px;
      line-height: 1.6;
    }


    .tw-myox-stats {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns:
        repeat(4,1fr);
      gap: 7px;
    }


    .tw-myox-stat {
      padding: 11px 8px;
      border: 1px solid var(--tw-border);
      border-radius: 13px;
      background: var(--tw-soft);
      text-align: center;
    }


    .tw-myox-stat small {
      display: block;
      color: var(--tw-muted);
      font-size: 8px;
      line-height: 1.3;
    }


    .tw-myox-stat strong {
      display: block;
      margin-top: 5px;
      color: var(--ink);
      font-size: 18px;
    }


    .tw-myox-note {
      position: relative;
      z-index: 1;
      margin-top: 11px;
      padding: 11px 12px;
      border: 1px solid var(--tw-border);
      border-radius: 13px;
      background: var(--tw-soft);
      color: var(--tw-muted);
      font-size: 10px;
      line-height: 1.5;
    }


    /* ================================================================ */
    /* ACTIONS                                                          */
    /* ================================================================ */

    .tw-home-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }


    .tw-home-action {
      appearance: none;
      border: 1px solid var(--tw-border);
      min-height: 35px;
      padding: 0 13px;
      border-radius: 999px;
      background: var(--tw-soft);
      color: var(--ink);
      font: inherit;
      font-size: 10px;
      font-weight: 800;
      cursor: pointer;
      transition:
        transform .16s ease,
        background .16s ease;
    }


    .tw-home-action:hover {
      transform:
        translateY(-1px);
      background:
        rgba(120,140,255,.10);
    }


    /* ================================================================ */
    /* DESKTOP / MOBILE                                                 */
    /* ================================================================ */

    @media
    (max-width: 900px) {

      .tw-home-topbar {
        align-items:
          flex-start;
        flex-direction:
          column;
      }


      .tw-home-system {
        justify-content:
          flex-start;
      }


      .tw-pulse-grid {
        grid-template-columns:
          1fr
          1fr;
      }


      .tw-pulse-card.primary {
        grid-column:
          1 / -1;
      }


      .tw-home-two {
        grid-template-columns:
          1fr;
      }


      .tw-theme-row {
        grid-template-columns:
          28px
          minmax(0,1.2fr)
          minmax(70px,.65fr)
          minmax(100px,1fr);
      }


      .tw-theme-flow {
        display: none;
      }

    }


    @media
    (max-width: 620px) {

      .tw-home-shell {
        gap: 12px;
      }


      .tw-pulse,
      .tw-xray,
      .tw-money,
      .tw-theme,
      .tw-opportunity,
      .tw-myox {
        padding: 14px;
        border-radius: 18px;
      }


      .tw-pulse-grid {
        grid-template-columns:
          1fr
          1fr;
        gap: 7px;
      }


      .tw-pulse-card {
        padding: 12px;
      }


      .tw-pulse-card.primary {
        grid-column:
          1 / -1;
      }


      .tw-pulse-value b {
        font-size: 22px;
      }


      .tw-pulse-card:not(.primary)
      .tw-pulse-value b {
        font-size: 17px;
      }


      .tw-structure-bar {
        grid-template-columns:
          1fr;
      }


      .tw-xray-grid {
        grid-template-columns:
          repeat(2,1fr);
      }


      .tw-theme-row {
        grid-template-columns:
          26px
          minmax(0,1fr)
          auto;
      }


      .tw-theme-flow,
      .tw-theme-leader {
        display: none;
      }


      .tw-myox-stats {
        grid-template-columns:
          repeat(2,1fr);
      }


      .tw-home-topbar h2 {
        font-size: 26px;
      }

    }

  `;


  document.head.appendChild(
    style
  );
}


/* ========================================================================== */
/* Data normalize                                                             */
/* ========================================================================== */

function normalizeData(
  state
) {

  const data =
    state?.data ||
    {};


  const pulse =
    data.pulse ||
    data.benchmarks ||
    {};


  return {

    session:
      data.session ||
      null,

    updatedAt:
      state?.updatedAt ||
      data.updatedAt ||
      null,

    dataDate:
      pulse.TAIEX?.timestamp ||
      pulse.TPEX?.timestamp ||
      data.radar?.[0]?.updatedAt ||
      null,

    pulse: {

      TAIEX:
        pulse.TAIEX ||
        data.taiex ||
        null,

      TPEX:
        pulse.TPEX ||
        data.tpex ||
        null,

      TX:
        pulse.TX ||
        data.tx ||
        null

    },

    breadth:
      data.breadth ||
      {},

    moneyFlow:
      data.moneyFlow ||
      {},

    themes:
      Array.isArray(
        data.themes
      )
        ? data.themes
        : [],

    opportunities:
      Array.isArray(
        data.opportunities
      )
        ? data.opportunities
        : [],

    myOX:
      data.myOX ||
      {}

  };
}


/* ========================================================================== */
/* Market pulse                                                               */
/* ========================================================================== */

function renderPulseCard(
  market,
  {
    primary = false,
    fallbackName = "市場"
  } = {}
) {

  const price =
    finiteNumber(
      market?.price
    );


  const change =
    finiteNumber(
      market?.changePct
    );


  return `
    <article
      class="
        tw-pulse-card
        ${
          primary
            ? "primary"
            : ""
        }
      "
    >

      <div
        class="tw-pulse-name"
      >

        <strong>
          ${escapeHTML(
            market?.name ||
            fallbackName
          )}
        </strong>

        <small>
          ${escapeHTML(
            market?.symbol ||
            "DATA PENDING"
          )}
        </small>

      </div>


      <div
        class="tw-pulse-value"
      >

        <b>
          ${
            price === null
              ? "—"
              : formatIndex(
                  price
                )
          }
        </b>

        <span
          class="${changeClass(
            change
          )}"
        >
          ${formatPercent(
            change
          )}
        </span>

      </div>


      <div
        class="tw-pulse-meta"
      >

        ${
          market
            ?.turnoverTwd !=
          null
            ? `
              <span>
                成交額
                <b>
                  ${formatTurnover(
                    market
                      .turnoverTwd
                  )}
                </b>
              </span>
            `
            : `
              <span>
                行情資料待接
              </span>
            `
        }

      </div>

    </article>
  `;
}


/* ========================================================================== */
/* Breadth                                                                    */
/* ========================================================================== */

function calculateBreadthPercent(
  breadth
) {

  const up =
    finiteNumber(
      breadth.advancers
    );


  const down =
    finiteNumber(
      breadth.decliners
    );


  if (
    up === null ||
    down === null ||
    up + down <= 0
  ) {
    return 50;
  }


  return Math.max(
    0,
    Math.min(
      100,
      (
        up /
        (
          up +
          down
        )
      ) * 100
    )
  );
}


function marketStructureLabel(
  data
) {

  const breadth =
    data.breadth;


  const up =
    finiteNumber(
      breadth.advancers
    );


  const down =
    finiteNumber(
      breadth.decliners
    );


  const taiex =
    finiteNumber(
      data.pulse
        .TAIEX
        ?.changePct
    );


  const tpex =
    finiteNumber(
      data.pulse
        .TPEX
        ?.changePct
    );


  if (
    up === null ||
    down === null
  ) {
    return "等待市場廣度";
  }


  const ratio =
    up /
    Math.max(
      1,
      up + down
    );


  if (
    taiex !== null &&
    taiex > 0 &&
    tpex !== null &&
    tpex <= 0 &&
    ratio < .48
  ) {
    return "權值主導";
  }


  if (
    ratio >= .65 &&
    (
      tpex === null ||
      tpex >= 0
    )
  ) {
    return "市場擴散";
  }


  if (
    ratio <= .35
  ) {
    return "市場偏弱";
  }


  return "多空分歧";
}


/* ========================================================================== */
/* Theme                                                                      */
/* ========================================================================== */

function renderThemeRows(
  themes
) {

  if (
    !themes.length
  ) {

    return `
      <div
        class="tw-empty"
      >
        題材資料待接。<br>
        未來這裡會依序顯示：
        題材漲跌、資金流、
        量能擴散、領頭股。
      </div>
    `;
  }


  return themes
    .slice(
      0,
      5
    )
    .map(
      (
        theme,
        index
      ) => `

        <div
          class="tw-theme-row"
        >

          <div
            class="tw-theme-rank"
          >
            ${index + 1}
          </div>


          <div
            class="tw-theme-name"
          >

            <strong>
              ${escapeHTML(
                theme.name ||
                "未命名題材"
              )}
            </strong>

            <small>
              ${
                finiteNumber(
                  theme.advanceCount
                ) !== null
                  ? `${
                      formatNumber(
                        theme.advanceCount
                      )
                    } 漲`
                  : "擴散資料待接"
              }

              ${
                finiteNumber(
                  theme.declineCount
                ) !== null
                  ? ` / ${
                      formatNumber(
                        theme.declineCount
                      )
                    } 跌`
                  : ""
              }
            </small>

          </div>


          <div
            class="tw-theme-stat"
          >

            <b
              class="${changeClass(
                theme.changePct
              )}"
            >
              ${formatPercent(
                theme.changePct
              )}
            </b>

            <small>
              族群漲跌
            </small>

          </div>


          <div
            class="
              tw-theme-stat
              tw-theme-flow
            "
          >

            <b>
              ${
                theme.flowTwd !=
                null
                  ? formatTwd(
                      theme.flowTwd
                    )
                  : "—"
              }
            </b>

            <small>
              資金
            </small>

          </div>


          <div
            class="tw-theme-leader"
          >

            <strong>
              ${escapeHTML(
                theme
                  .leaderName ||
                "—"
              )}
            </strong>

            <small>
              ${escapeHTML(
                theme
                  .leaderSymbol ||
                "領頭股待確認"
              )}
            </small>

          </div>

        </div>

      `
    )
    .join(
      ""
    );
}


/* ========================================================================== */
/* Opportunities                                                              */
/* ========================================================================== */

function renderOpportunities(
  items
) {

  if (
    !items.length
  ) {

    return `
      <div
        class="tw-empty"
      >
        尚無事件資料。<br>
        接入市場資料後會顯示
        突破、爆量、急漲、
        接近漲停與籌碼事件。
      </div>
    `;
  }


  return items
    .slice(
      0,
      6
    )
    .map(
      item => `

        <div
          class="tw-feed-row"
        >

          <div
            class="tw-feed-time"
          >
            ${escapeHTML(
              item.time ||
              "—"
            )}
          </div>


          <div
            class="tw-feed-copy"
          >

            <strong>
              ${escapeHTML(
                item.symbol ||
                ""
              )}

              ${escapeHTML(
                item.name ||
                ""
              )}
            </strong>

            <p>
              ${escapeHTML(
                item.description ||
                item.type ||
                "市場事件"
              )}
            </p>

          </div>

        </div>

      `
    )
    .join(
      ""
    );
}


/* ========================================================================== */
/* Main renderer                                                              */
/* ========================================================================== */

export function renderTWHome(
  state
) {

  /*
   * Important:
   *
   * Never paint TW content
   * while another market
   * is active.
   */
  if (
    !isTWMarket()
  ) {

    return {

      view:
        "home",

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

      view:
        "home",

      status:
        "missing-root"

    };
  }


  ensureStyles();


  const data =
    normalizeData(
      state
    );


  const breadth =
    data.breadth;


  const money =
    data.moneyFlow;


  const myOX =
    data.myOX;


  const breadthPercent =
    calculateBreadthPercent(
      breadth
    );


  const structure =
    marketStructureLabel(
      data
    );

  const sourceNames = { pulse: "大盤行情", breadth: "漲跌家數", moneyFlow: "資金流向", themes: "題材", radar: "雷達", indicators: "指標" };
  const failedSources = Object.entries(state?.data?.meta?.sourceErrors || {})
    .filter(([, error]) => Boolean(error))
    .map(([key]) => sourceNames[key] || key);


  root.hidden =
    false;


  root.classList.add(
    "tw-home-root"
  );


  root.classList.remove(
    "tw-indicator-root",
    "tw-radar-root"
  );


  root.innerHTML = `

    <div
      class="tw-home-shell"
    >


      <!-- ============================================================ -->
      <!-- HEADER                                                       -->
      <!-- ============================================================ -->

      <header
        class="tw-home-topbar"
      >

        <div>

          <div
            class="tw-home-eyebrow"
          >
            OX · TAIWAN MARKET
          </div>

          <h2
            id="market-unavailable-title"
          >
            台股市場
          </h2>

          <p
            id="market-unavailable-copy"
          >
            市場 → 資金 → 題材 → 個股。
            首頁只留下今天真正值得看的資訊，
            深度分析交給指標與雷達。
          </p>

        </div>


        <div
          class="tw-home-system"
        >

          <span
            class="tw-home-chip ${
              data.session ===
              "REGULAR"
                ? "live"
                : ""
            }"
          >
            ${sessionLabel(
              data.session,
              Boolean(data.pulse.TAIEX?.price || data.pulse.TPEX?.price),
              state?.status
            )}
          </span>

          ${state?.status === "partial" ? '<span class="tw-home-chip">部分資料</span>' : state?.status === "error" ? '<span class="tw-home-chip">載入失敗</span>' : ""}

          ${data.dataDate ? `<span class="tw-home-chip">資料日 ${escapeHTML(data.dataDate)}</span>` : ""}

          <span
            class="tw-home-chip"
          >
            ${
              state?.provider &&
              state.provider !==
              "backend-required"
                ? escapeHTML(
                    state.provider
                  )
                : "DATA SOURCE PENDING"
            }
          </span>

          <button class="tw-home-refresh" type="button" data-tw-refresh ${state?.status === "loading" ? "disabled" : ""}>更新</button>

          <span
            class="tw-home-chip"
          >
            UPDATED
            &nbsp;
            ${formatUpdatedAt(
              data.updatedAt
            )}
          </span>

        </div>

      </header>

      ${failedSources.length ? `<div class="tw-home-notice" role="status">部分來源暫時無法取得：${escapeHTML(failedSources.join("、"))}。其餘區塊保留可用資料。</div>` : state?.status === "error" ? '<div class="tw-home-notice" role="status">台股資料暫時無法取得，請按更新重試。</div>' : ""}


      <!-- ============================================================ -->
      <!-- MARKET PULSE                                                 -->
      <!-- ============================================================ -->

      <section
        class="
          tw-panel
          tw-pulse
        "
      >

        <div
          class="tw-panel-head"
        >

          <div>

            <h3>
              TAIWAN MARKET PULSE
            </h3>

            <p>
              先看加權、櫃買與台指，
              判斷今天市場的主體在哪裡。
            </p>

          </div>

          <span
            class="tw-panel-tag"
          >
            MARKET
          </span>

        </div>


        <div
          class="tw-pulse-grid"
        >

          ${renderPulseCard(
            data.pulse.TAIEX,
            {
              primary:
                true,

              fallbackName:
                "加權指數"
            }
          )}


          ${renderPulseCard(
            data.pulse.TPEX,
            {
              fallbackName:
                "櫃買指數"
            }
          )}


          ${renderPulseCard(
            data.pulse.TX,
            {
              fallbackName:
                "台指近月"
            }
          )}

        </div>


        <div
          class="tw-structure-bar"
        >

          <div
            class="tw-structure-item"
          >

            <small>
              INDEX STRUCTURE
            </small>

            <b>
              ${structure}
            </b>

          </div>


          <div
            class="tw-structure-item"
          >

            <small>
              MARKET BREADTH
            </small>

            <b>
              ${
                finiteNumber(
                  breadth.advancers
                ) !== null
                  ? `${breadthPercent.toFixed(
                      0
                    )}% 上漲`
                  : "資料待接"
              }
            </b>

          </div>


          <div
            class="tw-structure-item"
          >

            <small>
              TOTAL TURNOVER
            </small>

            <b>
              ${
                breadth.turnoverTwd !=
                null
                  ? formatTurnover(
                      breadth
                        .turnoverTwd
                    )
                  : "資料待接"
              }
            </b>

          </div>

        </div>

      </section>


      <!-- ============================================================ -->
      <!-- X-RAY + MONEY FLOW                                           -->
      <!-- ============================================================ -->

      <div
        class="tw-home-two"
      >


        <!-- MARKET X-RAY -->

        <section
          class="
            tw-panel
            tw-xray
          "
        >

          <div
            class="tw-panel-head"
          >

            <div>

              <h3>
                MARKET X-RAY
              </h3>

              <p>
                不只看指數，
                直接拆開整個市場內部。
              </p>

            </div>

            <span
              class="tw-panel-tag"
            >
              BREADTH
            </span>

          </div>


          <div
            class="tw-xray-grid"
          >

            <div
              class="tw-xray-cell"
            >
              <small>上漲家數</small>

              <strong
                class="is-up"
              >
                ${formatNumber(
                  breadth.advancers
                )}
              </strong>
            </div>


            <div
              class="tw-xray-cell"
            >
              <small>下跌家數</small>

              <strong
                class="is-down"
              >
                ${formatNumber(
                  breadth.decliners
                )}
              </strong>
            </div>


            <div
              class="tw-xray-cell"
            >
              <small>漲停家數</small>

              <strong>
                ${formatNumber(
                  breadth.limitUp
                )}
              </strong>
            </div>


            <div
              class="tw-xray-cell"
            >
              <small>跌停家數</small>

              <strong>
                ${formatNumber(
                  breadth.limitDown
                )}
              </strong>
            </div>


            <div
              class="tw-xray-cell"
            >
              <small>20 日新高</small>

              <strong>
                ${formatNumber(
                  breadth.newHigh20
                )}
              </strong>
            </div>


            <div
              class="tw-xray-cell"
            >
              <small>20 日新低</small>

              <strong>
                ${formatNumber(
                  breadth.newLow20
                )}
              </strong>
            </div>


            <div
              class="tw-xray-cell"
            >
              <small>異常放量</small>

              <strong>
                ${formatNumber(
                  breadth.surgeCount
                )}
              </strong>
            </div>


            <div
              class="tw-xray-cell"
            >
              <small>平盤</small>

              <strong>
                ${formatNumber(
                  breadth.unchanged
                )}
              </strong>
            </div>

          </div>


          <div
            class="tw-breadth-track"
            style="
              --tw-breadth:
              ${breadthPercent}%;
            "
          >
            <i></i>
          </div>


          <div
            class="tw-breadth-caption"
          >

            <span>
              弱勢 / 下跌
            </span>

            <span>
              市場擴散
            </span>

            <span>
              強勢 / 上漲
            </span>

          </div>

        </section>


        <!-- MONEY FLOW -->

        <section
          class="
            tw-panel
            tw-money
          "
        >

          <div
            class="tw-panel-head"
          >

            <div>

              <h3>
                MONEY FLOW
              </h3>

              <p>
                法人與主要資金方向。
              </p>

            </div>

            <span
              class="tw-panel-tag"
            >
              FLOW
            </span>

          </div>


          <div
            class="tw-money-list"
          >

            <div
              class="tw-money-row"
            >

              <span>
                外資
              </span>

              <strong
                class="${changeClass(
                  money
                    .foreignNetTwd
                )}"
              >
                ${formatTwd(
                  money
                    .foreignNetTwd
                )}
              </strong>

            </div>


            <div
              class="tw-money-row"
            >

              <span>
                投信
              </span>

              <strong
                class="${changeClass(
                  money
                    .trustNetTwd
                )}"
              >
                ${formatTwd(
                  money
                    .trustNetTwd
                )}
              </strong>

            </div>


            <div
              class="tw-money-row"
            >

              <span>
                自營商
              </span>

              <strong
                class="${changeClass(
                  money
                    .dealerNetTwd
                )}"
              >
                ${formatTwd(
                  money
                    .dealerNetTwd
                )}
              </strong>

            </div>


            <div
              class="tw-money-row"
            >

              <span>
                融資變化
              </span>

              <strong
                class="${changeClass(
                  money
                    .marginChangeTwd
                )}"
              >
                ${formatTwd(
                  money
                    .marginChangeTwd
                )}
              </strong>

            </div>


            <div
              class="tw-money-row"
            >

              <span>
                大單方向
              </span>

              <strong>
                ${escapeHTML(
                  money.bigOrderBias ||
                  "資料待接"
                )}
              </strong>

            </div>

          </div>

        </section>

      </div>


      <!-- ============================================================ -->
      <!-- THEME FLOW                                                   -->
      <!-- ============================================================ -->

      <section
        class="
          tw-panel
          tw-theme
        "
      >

        <div
          class="tw-panel-head"
        >

          <div>

            <h3>
              THEME FLOW
            </h3>

            <p>
              從今天最強題材一路找到
              資金、擴散程度與領頭股。
            </p>

          </div>

          <span
            class="tw-panel-tag"
          >
            TOP THEMES
          </span>

        </div>


        <div
          class="tw-theme-list"
        >

          ${renderThemeRows(
            data.themes
          )}

        </div>

      </section>


      <!-- ============================================================ -->
      <!-- OPPORTUNITY + MY OX                                          -->
      <!-- ============================================================ -->

      <div
        class="tw-home-two"
      >


        <section
          class="
            tw-panel
            tw-opportunity
          "
        >

          <div
            class="tw-panel-head"
          >

            <div>

              <h3>
                OPPORTUNITY FEED
              </h3>

              <p>
                今天市場現在正在發生什麼。
              </p>

            </div>

            <span
              class="tw-panel-tag"
            >
              LIVE EVENTS
            </span>

          </div>


          <div
            class="tw-feed"
          >

            ${renderOpportunities(
              data.opportunities
            )}

          </div>

        </section>


        <section
          class="
            tw-panel
            tw-myox
          "
        >

          <div
            class="tw-panel-head"
          >

            <div>

              <h3>
                MY OX
              </h3>

              <p>
                把市場資訊最後收斂到
                自己真正需要看的東西。
              </p>

            </div>

            <span
              class="tw-panel-tag"
            >
              PERSONAL
            </span>

          </div>


          <div
            class="tw-myox-stats"
          >

            <div
              class="tw-myox-stat"
            >

              <small>
                自選股
              </small>

              <strong>
                ${formatNumber(
                  myOX.watchlistCount
                )}
              </strong>

            </div>


            <div
              class="tw-myox-stat"
            >

              <small>
                今日觸發
              </small>

              <strong>
                ${formatNumber(
                  myOX.todayTriggers
                )}
              </strong>

            </div>


            <div
              class="tw-myox-stat"
            >

              <small>
                策略符合
              </small>

              <strong>
                ${formatNumber(
                  myOX.strategyMatches
                )}
              </strong>

            </div>


            <div
              class="tw-myox-stat"
            >

              <small>
                未讀提醒
              </small>

              <strong>
                ${formatNumber(
                  myOX.unreadAlerts
                )}
              </strong>

            </div>

          </div>


          <div
            class="tw-myox-note"
          >
            自選股、策略與提醒資料尚未接入。
            未來會把「找到條件 → 儲存 →
            自動監控 → 觸發提醒」串在這裡。
          </div>


          <div
            class="tw-home-actions"
            style="margin-top:11px"
          >

            <button
              class="tw-home-action"
              type="button"
              data-tw-go="strength"
            >
              指標中心
            </button>

            <button
              class="tw-home-action"
              type="button"
              data-tw-go="radar"
            >
              進入雷達
            </button>

          </div>

        </section>

      </div>


    </div>
  `;


  /*
   * Use the existing bottom dock
   * as the single navigation source.
   *
   * This avoids creating a second
   * navigation system inside TW.
   */
  root
    .querySelectorAll(
      "[data-tw-go]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const view =
              button.dataset
                .twGo;


            const dockButton =
              document.querySelector(
                `.dock-btn[data-view-target="${view}"]`
              );


            dockButton
              ?.click();

          }
        );

      }
    );

  root.querySelector("[data-tw-refresh]")?.addEventListener("click", () => {
    window.OXModules?.router?.get("tw")?.reload?.();
  });


  return {

    view:
      "home",

    status:
      state?.status ||
      "placeholder",

    data:
      state?.data ||
      null

  };
}
