/*
 * OX v4.0 Modular
 * US Radar UI
 *
 * Provider-agnostic renderer.
 *
 * This file:
 * - does NOT call Bitget
 * - does NOT call Twelve Data
 * - does NOT know which API is connected
 * - reads only from US Market State
 *
 * Future radar data contract:
 *
 * state.data.radar = [
 *   {
 *     symbol: "NVDA",
 *     name: "NVIDIA",
 *     sector: "Technology",
 *     price: 123.45,
 *     changePct: 2.31,
 *     volume: 58200000,
 *     relativeStrength: 88,
 *     oxScore: 91,
 *     tier: "T1",
 *     setup: "突破",
 *     session: "REGULAR"
 *   }
 * ]
 *
 * If no radar data exists yet,
 * the complete UI still renders
 * with honest WAITING FOR DATA states.
 */

const ROOT_ID =
  "market-unavailable-card";

const TIERS =
  Object.freeze([
    "ALL",
    "T1",
    "T2",
    "T3"
  ]);

let activeTier =
  "ALL";

let searchQuery =
  "";

let lastState =
  null;

/* ========================================================================== */
/* Styles                                                                     */
/* ========================================================================== */

const RADAR_STYLE = `
<style>

#market-unavailable-card.us-radar-root {
  display: block !important;
  width: 100% !important;
  min-width: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}

#market-unavailable-card.us-radar-root
> .market-unavailable-icon {
  display: none !important;
}


/* -------------------------------------------------------------------------- */
/* Shell                                                                      */
/* -------------------------------------------------------------------------- */

#market-unavailable-card
.us-radar-shell {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 22px;
}


/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

#market-unavailable-card
.us-radar-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 22px;
  width: 100%;
  min-width: 0;
}

#market-unavailable-card
.us-radar-title {
  min-width: 0;
  flex: 1 1 auto;
}

#market-unavailable-card
.us-radar-kicker {
  margin-bottom: 7px;
  color: #e6b44f;
  font-size: 10px;
  line-height: 1.3;
  font-weight: 900;
  letter-spacing: .16em;
}

#market-unavailable-card
.us-radar-title h2 {
  margin: 0;
  font-size: 27px;
  line-height: 1.15;
}

#market-unavailable-card
.us-radar-title p {
  margin: 8px 0 0;
  max-width: 720px;
  color: rgba(204,216,232,.62);
  font-size: 10px;
  line-height: 1.6;
}


/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

#market-unavailable-card
.us-radar-status {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 12px;
  border:
    1px solid rgba(130,155,184,.16);
  border-radius: 999px;
  color: rgba(213,224,238,.70);
  background:
    rgba(100,128,160,.055);
  font-size: 9px;
  font-weight: 800;
  white-space: nowrap;
}

#market-unavailable-card
.us-radar-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #8797aa;
  box-shadow:
    0 0 10px
    rgba(135,151,170,.35);
}

#market-unavailable-card
.us-radar-status.is-ready
.us-radar-status-dot {
  background: #39c99a;
  box-shadow:
    0 0 12px
    rgba(57,201,154,.48);
}

#market-unavailable-card
.us-radar-status.is-error
.us-radar-status-dot {
  background: #e46b78;
  box-shadow:
    0 0 12px
    rgba(228,107,120,.44);
}


/* -------------------------------------------------------------------------- */
/* Market snapshot                                                            */
/* -------------------------------------------------------------------------- */

#market-unavailable-card
.us-radar-snapshot {
  display: grid;
  grid-template-columns:
    repeat(4, minmax(0,1fr));
  gap: 10px;
  margin-top: 20px;
}

#market-unavailable-card
.us-radar-snapshot-card {
  min-width: 0;
  padding: 13px 14px;
  border:
    1px solid rgba(122,149,181,.13);
  border-radius: 14px;
  background:
    linear-gradient(
      180deg,
      rgba(31,48,67,.40),
      rgba(13,25,39,.32)
    );
}

#market-unavailable-card
.us-radar-snapshot-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  color: rgba(197,210,226,.52);
  font-size: 9px;
  font-weight: 800;
}

#market-unavailable-card
.us-radar-snapshot-card strong {
  display: block;
  margin-top: 6px;
  color: #eef4fb;
  font-size: 18px;
  line-height: 1.1;
  font-weight: 900;
}

#market-unavailable-card
.us-radar-snapshot-card small {
  display: block;
  margin-top: 5px;
  font-size: 9px;
  color: rgba(202,216,233,.56);
}

#market-unavailable-card
.us-positive {
  color: #43d7a4 !important;
}

#market-unavailable-card
.us-negative {
  color: #ef7483 !important;
}


/* -------------------------------------------------------------------------- */
/* Error banner                                                               */
/* -------------------------------------------------------------------------- */

#market-unavailable-card
.us-radar-error {
  margin-top: 14px;
  padding: 11px 13px;
  border:
    1px solid rgba(225,105,119,.20);
  border-radius: 12px;
  background:
    rgba(225,105,119,.055);
  color: rgba(239,183,190,.82);
  font-size: 9px;
  line-height: 1.55;
}


/* -------------------------------------------------------------------------- */
/* Toolbar                                                                    */
/* -------------------------------------------------------------------------- */

#market-unavailable-card
.us-radar-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  width: 100%;
  min-width: 0;
  margin-top: 18px;
  padding: 11px;
  border:
    1px solid rgba(127,151,178,.12);
  border-radius: 16px;
  background:
    rgba(101,126,153,.035);
  box-sizing: border-box;
}

#market-unavailable-card
.us-radar-tier-tabs {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
}

#market-unavailable-card
.us-radar-tier-btn {
  appearance: none;
  border:
    1px solid transparent;
  min-width: 48px;
  height: 34px;
  padding: 0 11px;
  border-radius: 11px;
  color: rgba(200,213,229,.58);
  background: transparent;
  font: inherit;
  font-size: 9px;
  font-weight: 900;
  cursor: pointer;
  transition:
    color .15s ease,
    background .15s ease,
    border-color .15s ease,
    transform .15s ease;
}

#market-unavailable-card
.us-radar-tier-btn:hover {
  color: #f2d28b;
}

#market-unavailable-card
.us-radar-tier-btn.is-active {
  color: #f0bd55;
  border-color:
    rgba(240,189,85,.30);
  background:
    linear-gradient(
      180deg,
      rgba(240,189,85,.14),
      rgba(240,189,85,.055)
    );
}

#market-unavailable-card
.us-radar-tier-btn:active {
  transform: scale(.97);
}


/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

#market-unavailable-card
.us-radar-search {
  position: relative;
  flex: 1 1 auto;
  max-width: 270px;
}

#market-unavailable-card
.us-radar-search input {
  width: 100%;
  height: 34px;
  box-sizing: border-box;
  padding: 0 13px;
  border:
    1px solid rgba(126,151,180,.14);
  border-radius: 11px;
  outline: none;
  color: #e8eef6;
  background:
    rgba(8,18,29,.50);
  font: inherit;
  font-size: 10px;
}

#market-unavailable-card
.us-radar-search input::placeholder {
  color: rgba(190,205,222,.35);
}

#market-unavailable-card
.us-radar-search input:focus {
  border-color:
    rgba(240,189,85,.32);
  box-shadow:
    0 0 0 2px
    rgba(240,189,85,.045);
}


/* -------------------------------------------------------------------------- */
/* Table header                                                               */
/* -------------------------------------------------------------------------- */

#market-unavailable-card
.us-radar-table-head {
  display: grid;
  grid-template-columns:
    48px
    minmax(150px,1.45fr)
    minmax(100px,.85fr)
    minmax(86px,.75fr)
    minmax(78px,.65fr)
    minmax(78px,.65fr)
    72px;
  gap: 12px;
  align-items: center;
  width: 100%;
  min-width: 0;
  margin-top: 15px;
  padding: 0 14px 8px;
  box-sizing: border-box;
  color: rgba(183,199,217,.38);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: .08em;
}


/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

#market-unavailable-card
.us-radar-list {
  display: grid;
  gap: 8px;
}

#market-unavailable-card
.us-radar-row {
  display: grid;
  grid-template-columns:
    48px
    minmax(150px,1.45fr)
    minmax(100px,.85fr)
    minmax(86px,.75fr)
    minmax(78px,.65fr)
    minmax(78px,.65fr)
    72px;
  gap: 12px;
  align-items: center;
  width: 100%;
  min-width: 0;
  min-height: 74px;
  padding: 11px 14px;
  box-sizing: border-box;
  border:
    1px solid rgba(116,143,174,.12);
  border-radius: 14px;
  background:
    linear-gradient(
      180deg,
      rgba(24,39,57,.42),
      rgba(9,19,30,.36)
    );
  transition:
    border-color .16s ease,
    transform .16s ease,
    background .16s ease;
}

#market-unavailable-card
.us-radar-row:hover {
  transform: translateY(-1px);
  border-color:
    rgba(240,189,85,.19);
  background:
    linear-gradient(
      180deg,
      rgba(31,47,66,.48),
      rgba(11,22,34,.42)
    );
}


/* Rank */

#market-unavailable-card
.us-radar-rank {
  color: rgba(193,207,224,.44);
  font-size: 11px;
  font-weight: 900;
}


/* Identity */

#market-unavailable-card
.us-radar-identity {
  min-width: 0;
}

#market-unavailable-card
.us-radar-symbol-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

#market-unavailable-card
.us-radar-symbol {
  flex: 0 0 auto;
  color: #f0f4fa;
  font-size: 17px;
  line-height: 1;
  font-weight: 900;
  letter-spacing: .02em;
}

#market-unavailable-card
.us-radar-tier {
  flex: 0 0 auto;
  padding: 4px 7px;
  border-radius: 8px;
  font-size: 8px;
  line-height: 1;
  font-weight: 900;
}

#market-unavailable-card
.us-radar-tier.t1 {
  color: #f4c15a;
  border:
    1px solid rgba(244,193,90,.30);
  background:
    rgba(244,193,90,.08);
}

#market-unavailable-card
.us-radar-tier.t2 {
  color: #8fb9e8;
  border:
    1px solid rgba(143,185,232,.24);
  background:
    rgba(143,185,232,.06);
}

#market-unavailable-card
.us-radar-tier.t3 {
  color: #b7c4d3;
  border:
    1px solid rgba(183,196,211,.18);
  background:
    rgba(183,196,211,.05);
}

#market-unavailable-card
.us-radar-name {
  margin-top: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(190,204,221,.51);
  font-size: 9px;
}


/* Price */

#market-unavailable-card
.us-radar-price strong {
  display: block;
  color: #edf3fb;
  font-size: 14px;
  font-weight: 900;
}

#market-unavailable-card
.us-radar-price small {
  display: block;
  margin-top: 4px;
  font-size: 9px;
  font-weight: 800;
}


/* Metrics */

#market-unavailable-card
.us-radar-metric {
  min-width: 0;
}

#market-unavailable-card
.us-radar-metric span {
  display: block;
  color: rgba(183,200,220,.40);
  font-size: 8px;
  font-weight: 800;
}

#market-unavailable-card
.us-radar-metric strong {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(231,239,248,.82);
  font-size: 11px;
  font-weight: 900;
}


/* OX Score */

#market-unavailable-card
.us-radar-score {
  text-align: right;
}

#market-unavailable-card
.us-radar-score strong {
  color: #f0bd55;
  font-size: 19px;
  line-height: 1;
  font-weight: 900;
}

#market-unavailable-card
.us-radar-score small {
  display: block;
  margin-top: 4px;
  color: rgba(210,223,238,.38);
  font-size: 8px;
  font-weight: 800;
}


/* -------------------------------------------------------------------------- */
/* Empty / waiting rows                                                       */
/* -------------------------------------------------------------------------- */

#market-unavailable-card
.us-radar-waiting {
  position: relative;
  overflow: hidden;
}

#market-unavailable-card
.us-radar-waiting::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(
      100deg,
      transparent 25%,
      rgba(255,255,255,.025) 48%,
      transparent 72%
    );
  transform: translateX(-100%);
  animation:
    usRadarShimmer
    2.4s infinite;
}

@keyframes usRadarShimmer {
  100% {
    transform: translateX(100%);
  }
}

#market-unavailable-card
.us-radar-placeholder {
  height: 9px;
  border-radius: 999px;
  background:
    rgba(139,161,185,.11);
}

#market-unavailable-card
.us-radar-placeholder.short {
  width: 48%;
}

#market-unavailable-card
.us-radar-placeholder.medium {
  width: 72%;
}

#market-unavailable-card
.us-radar-placeholder.large {
  width: 92%;
}


/* -------------------------------------------------------------------------- */
/* Empty message                                                              */
/* -------------------------------------------------------------------------- */

#market-unavailable-card
.us-radar-empty {
  margin-top: 12px;
  padding: 15px 16px;
  border:
    1px solid rgba(118,144,174,.11);
  border-radius: 14px;
  color: rgba(192,207,224,.56);
  background:
    rgba(99,124,151,.035);
  font-size: 9px;
  line-height: 1.7;
}

#market-unavailable-card
.us-radar-empty b {
  color: #e5b552;
}


/* -------------------------------------------------------------------------- */
/* Footer                                                                     */
/* -------------------------------------------------------------------------- */

#market-unavailable-card
.us-radar-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 14px;
  padding-top: 13px;
  border-top:
    1px solid rgba(121,147,176,.10);
  color: rgba(184,200,218,.40);
  font-size: 8px;
}

#market-unavailable-card
.us-radar-footer b {
  color: rgba(221,231,242,.68);
}


/* ========================================================================== */
/* Tablet                                                                     */
/* ========================================================================== */

@media (max-width: 900px) {

  #market-unavailable-card
  .us-radar-table-head,

  #market-unavailable-card
  .us-radar-row {
    grid-template-columns:
      40px
      minmax(130px,1.25fr)
      minmax(90px,.75fr)
      minmax(72px,.6fr)
      minmax(68px,.6fr)
      65px;
  }

  #market-unavailable-card
  .us-radar-table-head
  > :nth-child(5),

  #market-unavailable-card
  .us-radar-row
  > :nth-child(5) {
    display: none;
  }

}


/* ========================================================================== */
/* Mobile                                                                     */
/* ========================================================================== */

@media (max-width: 720px) {

  #market-unavailable-card
  .us-radar-shell {
    padding:
      20px 14px
      22px;
  }

  #market-unavailable-card
  .us-radar-head {
    display: block;
  }

  #market-unavailable-card
  .us-radar-title h2 {
    font-size: 24px;
  }

  #market-unavailable-card
  .us-radar-status {
    display: inline-flex;
    margin-top: 12px;
  }

  #market-unavailable-card
  .us-radar-snapshot {
    grid-template-columns:
      repeat(2,minmax(0,1fr));
    gap: 8px;
    margin-top: 16px;
  }

  #market-unavailable-card
  .us-radar-snapshot-card {
    padding: 11px 12px;
  }

  #market-unavailable-card
  .us-radar-snapshot-card strong {
    font-size: 17px;
  }

  #market-unavailable-card
  .us-radar-toolbar {
    display: block;
    padding: 9px;
  }

  #market-unavailable-card
  .us-radar-tier-tabs {
    display: grid;
    grid-template-columns:
      repeat(4,minmax(0,1fr));
  }

  #market-unavailable-card
  .us-radar-tier-btn {
    min-width: 0;
    width: 100%;
    padding: 0 6px;
  }

  #market-unavailable-card
  .us-radar-search {
    max-width: none;
    margin-top: 8px;
  }

  #market-unavailable-card
  .us-radar-table-head {
    display: none;
  }

  #market-unavailable-card
  .us-radar-list {
    margin-top: 12px;
    gap: 9px;
  }

  /*
   * Desktop table becomes mobile card.
   */
  #market-unavailable-card
  .us-radar-row {
    position: relative;
    display: grid;
    grid-template-columns:
      minmax(0,1fr)
      auto;
    grid-template-areas:
      "identity score"
      "price score"
      "metrics metrics";
    gap: 9px 12px;
    min-height: 0;
    padding: 15px;
  }

  #market-unavailable-card
  .us-radar-rank {
    display: none;
  }

  #market-unavailable-card
  .us-radar-identity {
    grid-area: identity;
  }

  #market-unavailable-card
  .us-radar-price {
    grid-area: price;
  }

  #market-unavailable-card
  .us-radar-score {
    grid-area: score;
    min-width: 58px;
    padding-top: 3px;
  }

  #market-unavailable-card
  .us-radar-row
  > .us-radar-metric {
    display: block !important;
  }

  #market-unavailable-card
  .us-radar-row {
    grid-auto-flow: row;
  }

  #market-unavailable-card
  .us-radar-mobile-metrics {
    grid-area: metrics;
    display: grid;
    grid-template-columns:
      repeat(3,minmax(0,1fr));
    gap: 7px;
  }

  #market-unavailable-card
  .us-radar-mobile-metrics
  .us-radar-metric {
    min-width: 0;
    padding: 9px 8px;
    border-radius: 10px;
    background:
      rgba(109,137,166,.055);
  }

  #market-unavailable-card
  .us-radar-symbol {
    font-size: 19px;
  }

  #market-unavailable-card
  .us-radar-price strong {
    font-size: 13px;
  }

  #market-unavailable-card
  .us-radar-score strong {
    font-size: 24px;
  }

  #market-unavailable-card
  .us-radar-footer {
    display: grid;
    grid-template-columns:
      repeat(2,minmax(0,1fr));
    gap: 7px;
  }

}


/* ========================================================================== */
/* Small phones                                                               */
/* ========================================================================== */

@media (max-width: 390px) {

  #market-unavailable-card
  .us-radar-shell {
    padding:
      18px 11px
      20px;
  }

  #market-unavailable-card
  .us-radar-row {
    padding: 13px;
  }

  #market-unavailable-card
  .us-radar-mobile-metrics {
    gap: 5px;
  }

  #market-unavailable-card
  .us-radar-mobile-metrics
  .us-radar-metric {
    padding: 8px 6px;
  }

}


/* ========================================================================== */
/* Light theme                                                                */
/* ========================================================================== */

body.theme-light
#market-unavailable-card
.us-radar-shell {
  color: #172234;
}

body.theme-light
#market-unavailable-card
.us-radar-row,

body.theme-light
#market-unavailable-card
.us-radar-snapshot-card {
  background:
    rgba(255,255,255,.55);
  border-color:
    rgba(80,108,140,.12);
}

body.theme-light
#market-unavailable-card
.us-radar-symbol,

body.theme-light
#market-unavailable-card
.us-radar-price strong {
  color: #182338;
}

body.theme-light
#market-unavailable-card
.us-radar-search input {
  color: #182338;
  background:
    rgba(255,255,255,.55);
}

</style>
`;

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

function escapeHTML(value) {
  return String(
    value ?? ""
  ).replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[char]
  );
}

function finiteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function clamp(
  value,
  min,
  max
) {
  return Math.min(
    max,
    Math.max(
      min,
      value
    )
  );
}

function formatPrice(value) {
  const number =
    finiteNumber(value);

  if (number === null) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ).format(number);
}

function formatPercent(value) {
  const number =
    finiteNumber(value);

  if (number === null) {
    return "—";
  }

  return `${
    number > 0
      ? "+"
      : ""
  }${number.toFixed(2)}%`;
}

function formatCompact(value) {
  const number =
    finiteNumber(value);

  if (number === null) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      notation: "compact",
      maximumFractionDigits: 1
    }
  ).format(number);
}

function formatUpdatedAt(value) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

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
    ).format(date);
  } catch {
    return date.toISOString();
  }
}

function changeClass(value) {
  const number =
    finiteNumber(value);

  if (number === null) {
    return "";
  }

  if (number > 0) {
    return "us-positive";
  }

  if (number < 0) {
    return "us-negative";
  }

  return "";
}

function normalizeTier(value) {
  const tier =
    String(
      value || ""
    ).toUpperCase();

  if (
    tier === "T1" ||
    tier === "T2" ||
    tier === "T3"
  ) {
    return tier;
  }

  return "T3";
}

function tierClass(value) {
  return normalizeTier(
    value
  ).toLowerCase();
}

function sessionLabel(value) {
  switch (
    String(
      value ||
      ""
    ).toUpperCase()
  ) {
    case "PRE":
    case "PREMARKET":
    case "PRE-MARKET":
      return "PRE";

    case "REGULAR":
      return "REGULAR";

    case "AFTER":
    case "AFTERHOURS":
    case "AFTER-HOURS":
      return "AFTER";

    case "CLOSED":
      return "CLOSED";

    default:
      return "WAITING";
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
    ROOT_ID
  );
}

function isUSMarket() {
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
    "us"
  );
}

/* ========================================================================== */
/* Radar data                                                                 */
/* ========================================================================== */

function getRawRadar(
  state
) {
  const data =
    state?.data;

  if (!data) {
    return [];
  }

  /*
   * Primary future contract.
   */
  if (
    Array.isArray(
      data.radar
    )
  ) {
    return data.radar;
  }

  /*
   * Optional compatibility aliases.
   */
  if (
    Array.isArray(
      data.stocks
    )
  ) {
    return data.stocks;
  }

  if (
    Array.isArray(
      data.symbols
    )
  ) {
    return data.symbols;
  }

  return [];
}

function normalizeRadarItem(
  raw,
  index
) {
  const symbol =
    String(
      raw?.symbol ||
      raw?.ticker ||
      ""
    )
      .trim()
      .toUpperCase();

  if (!symbol) {
    return null;
  }

  const oxScore =
    finiteNumber(
      raw.oxScore ??
      raw.score ??
      raw.ox_score
    );

  const relativeStrength =
    finiteNumber(
      raw.relativeStrength ??
      raw.rs ??
      raw.relative_strength
    );

  return Object.freeze({
    rank:
      finiteNumber(
        raw.rank
      ) ??
      index + 1,

    symbol,

    name:
      raw.name ||
      raw.companyName ||
      raw.company_name ||
      "US Stock",

    sector:
      raw.sector ||
      "—",

    price:
      finiteNumber(
        raw.price ??
        raw.close ??
        raw.last
      ),

    changePct:
      finiteNumber(
        raw.changePct ??
        raw.percentChange ??
        raw.percent_change
      ),

    volume:
      finiteNumber(
        raw.volume
      ),

    relativeStrength:
      relativeStrength === null
        ? null
        : clamp(
            relativeStrength,
            0,
            100
          ),

    oxScore:
      oxScore === null
        ? null
        : clamp(
            oxScore,
            0,
            100
          ),

    tier:
      normalizeTier(
        raw.tier
      ),

    setup:
      raw.setup ||
      raw.signal ||
      raw.pattern ||
      "—",

    session:
      raw.session ||
      null
  });
}

function getRadarItems(
  state
) {
  return getRawRadar(
    state
  )
    .map(
      normalizeRadarItem
    )
    .filter(Boolean);
}

/* ========================================================================== */
/* Filters                                                                    */
/* ========================================================================== */

function filterItems(
  items
) {
  const query =
    searchQuery
      .trim()
      .toLowerCase();

  return items
    .filter(
      item =>
        activeTier === "ALL" ||
        item.tier === activeTier
    )
    .filter(
      item => {
        if (!query) {
          return true;
        }

        const haystack =
          [
            item.symbol,
            item.name,
            item.sector,
            item.setup
          ]
            .join(" ")
            .toLowerCase();

        return haystack.includes(
          query
        );
      }
    )
    .sort(
      (a,b) =>
        (
          b.oxScore ??
          -1
        ) -
        (
          a.oxScore ??
          -1
        )
    );
}

/* ========================================================================== */
/* Snapshot                                                                   */
/* ========================================================================== */

function benchmarkCard(
  symbol,
  benchmark
) {
  const available =
    benchmark?.available;

  return `
    <div
      class="us-radar-snapshot-card"
    >
      <div
        class="us-radar-snapshot-label"
      >
        <span>
          ${escapeHTML(
            symbol
          )}
        </span>

        <span>
          ${
            available
              ? "LIVE"
              : "WAIT"
          }
        </span>
      </div>

      <strong>
        ${
          available
            ? `$${formatPrice(
                benchmark.price
              )}`
            : "—"
        }
      </strong>

      <small
        class="${
          available
            ? changeClass(
                benchmark.changePct
              )
            : ""
        }"
      >
        ${
          available
            ? formatPercent(
                benchmark.changePct
              )
            : "等待資料"
        }
      </small>
    </div>
  `;
}

function renderSnapshot(
  state
) {
  const benchmarks =
    state?.data
      ?.benchmarks ||
    {};

  return `
    <div
      class="us-radar-snapshot"
    >
      ${benchmarkCard(
        "SPY",
        benchmarks.SPY
      )}

      ${benchmarkCard(
        "QQQ",
        benchmarks.QQQ
      )}

      ${benchmarkCard(
        "IWM",
        benchmarks.IWM
      )}

      ${benchmarkCard(
        "VIX",
        benchmarks.VIX
      )}
    </div>
  `;
}

/* ========================================================================== */
/* Tier tabs                                                                  */
/* ========================================================================== */

function renderTierTabs() {
  return TIERS
    .map(
      tier => `
        <button
          type="button"
          class="
            us-radar-tier-btn
            ${
              activeTier === tier
                ? "is-active"
                : ""
            }
          "
          data-us-radar-tier="${tier}"
        >
          ${
            tier === "ALL"
              ? "全部"
              : tier
          }
        </button>
      `
    )
    .join("");
}

/* ========================================================================== */
/* Desktop radar row                                                          */
/* ========================================================================== */

function renderRow(
  item
) {
  return `
    <article
      class="us-radar-row"
      data-us-radar-symbol="${escapeHTML(
        item.symbol
      )}"
    >

      <div
        class="us-radar-rank"
      >
        #${escapeHTML(
          item.rank
        )}
      </div>

      <div
        class="us-radar-identity"
      >
        <div
          class="us-radar-symbol-line"
        >
          <span
            class="us-radar-symbol"
          >
            ${escapeHTML(
              item.symbol
            )}
          </span>

          <span
            class="
              us-radar-tier
              ${tierClass(
                item.tier
              )}
            "
          >
            ${escapeHTML(
              item.tier
            )}
          </span>
        </div>

        <div
          class="us-radar-name"
        >
          ${escapeHTML(
            item.name
          )}
          ·
          ${escapeHTML(
            item.sector
          )}
        </div>
      </div>

      <div
        class="us-radar-price"
      >
        <strong>
          ${
            item.price === null
              ? "—"
              : `$${formatPrice(
                  item.price
                )}`
          }
        </strong>

        <small
          class="${changeClass(
            item.changePct
          )}"
        >
          ${formatPercent(
            item.changePct
          )}
        </small>
      </div>

      <div
        class="us-radar-metric"
      >
        <span>
          RS
        </span>

        <strong>
          ${
            item.relativeStrength === null
              ? "—"
              : Math.round(
                  item.relativeStrength
                )
          }
        </strong>
      </div>

      <div
        class="us-radar-metric"
      >
        <span>
          VOL
        </span>

        <strong>
          ${formatCompact(
            item.volume
          )}
        </strong>
      </div>

      <div
        class="us-radar-metric"
      >
        <span>
          SETUP
        </span>

        <strong>
          ${escapeHTML(
            item.setup
          )}
        </strong>
      </div>

      <div
        class="us-radar-score"
      >
        <strong>
          ${
            item.oxScore === null
              ? "—"
              : Math.round(
                  item.oxScore
                )
          }
        </strong>

        <small>
          OX SCORE
        </small>
      </div>

      <div
        class="us-radar-mobile-metrics"
      >
        <div
          class="us-radar-metric"
        >
          <span>
            RS
          </span>

          <strong>
            ${
              item.relativeStrength === null
                ? "—"
                : Math.round(
                    item.relativeStrength
                  )
            }
          </strong>
        </div>

        <div
          class="us-radar-metric"
        >
          <span>
            VOL
          </span>

          <strong>
            ${formatCompact(
              item.volume
            )}
          </strong>
        </div>

        <div
          class="us-radar-metric"
        >
          <span>
            SETUP
          </span>

          <strong>
            ${escapeHTML(
              item.setup
            )}
          </strong>
        </div>
      </div>

    </article>
  `;
}

/* ========================================================================== */
/* Waiting skeleton                                                           */
/* ========================================================================== */

function renderWaitingRow(
  index
) {
  return `
    <article
      class="
        us-radar-row
        us-radar-waiting
      "
    >

      <div
        class="us-radar-rank"
      >
        #${index + 1}
      </div>

      <div
        class="us-radar-identity"
      >
        <div
          class="
            us-radar-placeholder
            medium
          "
        ></div>

        <div
          class="
            us-radar-placeholder
            large
          "
          style="
            margin-top:8px;
          "
        ></div>
      </div>

      <div
        class="us-radar-price"
      >
        <div
          class="
            us-radar-placeholder
            medium
          "
        ></div>

        <div
          class="
            us-radar-placeholder
            short
          "
          style="
            margin-top:8px;
          "
        ></div>
      </div>

      <div
        class="us-radar-metric"
      >
        <div
          class="
            us-radar-placeholder
            medium
          "
        ></div>
      </div>

      <div
        class="us-radar-metric"
      >
        <div
          class="
            us-radar-placeholder
            large
          "
        ></div>
      </div>

      <div
        class="us-radar-metric"
      >
        <div
          class="
            us-radar-placeholder
            medium
          "
        ></div>
      </div>

      <div
        class="us-radar-score"
      >
        <div
          class="
            us-radar-placeholder
            medium
          "
        ></div>
      </div>

      <div
        class="us-radar-mobile-metrics"
      >
        <div
          class="us-radar-metric"
        >
          <div
            class="
              us-radar-placeholder
              medium
            "
          ></div>
        </div>

        <div
          class="us-radar-metric"
        >
          <div
            class="
              us-radar-placeholder
              medium
            "
          ></div>
        </div>

        <div
          class="us-radar-metric"
        >
          <div
            class="
              us-radar-placeholder
              medium
            "
          ></div>
        </div>
      </div>

    </article>
  `;
}

/* ========================================================================== */
/* Bind UI                                                                    */
/* ========================================================================== */

function bindUI(
  root
) {
  root
    .querySelectorAll(
      "[data-us-radar-tier]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            const tier =
              button.dataset
                .usRadarTier;

            if (
              !TIERS.includes(
                tier
              )
            ) {
              return;
            }

            activeTier =
              tier;

            renderUSRadar(
              lastState
            );
          }
        );
      }
    );

  const search =
    root.querySelector(
      "[data-us-radar-search]"
    );

  if (search) {
    search.addEventListener(
      "input",
      event => {
        searchQuery =
          event.target.value;

        renderUSRadar(
          lastState
        );

        requestAnimationFrame(
          () => {
            const next =
              root.querySelector(
                "[data-us-radar-search]"
              );

            if (next) {
              next.focus();

              next.setSelectionRange(
                next.value.length,
                next.value.length
              );
            }
          }
        );
      }
    );
  }
}

/* ========================================================================== */
/* Render                                                                     */
/* ========================================================================== */

function renderShell(
  root,
  state
) {
  const allItems =
    getRadarItems(
      state
    );

  const items =
    filterItems(
      allItems
    );

  const hasRadarData =
    allItems.length > 0;

  const isError =
    state?.status ===
    "error";

  const provider =
    state?.provider ||
    "US PROVIDER";

  const session =
    sessionLabel(
      state?.data?.session
    );

  root.hidden =
    false;

  root.classList.add(
    "us-radar-root"
  );

  root.innerHTML = `
    ${RADAR_STYLE}

    <div
      class="us-radar-shell"
    >

      <div
        class="us-radar-head"
      >

        <div
          class="us-radar-title"
        >

          <div
            class="us-radar-kicker"
          >
            US RADAR · OX MARKET SCANNER
          </div>

          <h2>
            美股雷達
          </h2>

          <p>
            目前顯示 SPY、QQQ、IWM 的真實 ETF 基準。
            個股股票池、RS、成交量篩選與 OX Score
            尚無資料來源，接入前不產生假排名。
          </p>

        </div>

        <div
          class="
            us-radar-status
            ${
              isError
                ? "is-error"
                : hasRadarData
                  ? "is-ready"
                  : ""
            }
          "
        >
          <span
            class="us-radar-status-dot"
          ></span>

          ${
            isError
              ? "PROVIDER ERROR"
              : hasRadarData
                ? `${allItems.length} STOCKS`
                : "WAITING FOR STOCK DATA"
          }
        </div>

      </div>


      ${renderSnapshot(
        state
      )}


      ${
        isError
          ? `
            <div
              class="us-radar-error"
            >
              <b>
                Provider：
              </b>

              ${escapeHTML(
                state?.error?.message ||
                "目前資料源暫時無法取得。"
              )}

              雷達 UI 本身仍可正常使用；
              等待新的美股資料源接入即可。
            </div>
          `
          : ""
      }


      <div
        class="us-radar-toolbar"
      >

        <div
          class="us-radar-tier-tabs"
        >
          ${renderTierTabs()}
        </div>

        <label
          class="us-radar-search"
        >
          <input
            type="search"
            value="${escapeHTML(
              searchQuery
            )}"
            placeholder="${hasRadarData ? "搜尋股票代號 / 公司 / 產業" : "個股雷達資料待接"}"
            data-us-radar-search
            ${hasRadarData ? "" : "disabled"}
            autocomplete="off"
            spellcheck="false"
          >
        </label>

      </div>


      <div
        class="us-radar-table-head"
      >
        <span>
          RANK
        </span>

        <span>
          SYMBOL
        </span>

        <span>
          PRICE
        </span>

        <span>
          RS
        </span>

        <span>
          VOLUME
        </span>

        <span>
          SETUP
        </span>

        <span
          style="
            text-align:right;
          "
        >
          OX
        </span>
      </div>


      <div
        class="us-radar-list"
      >

        ${
          hasRadarData
            ? (
                items.length
                  ? items
                      .map(
                        renderRow
                      )
                      .join("")
                  : `
                    <div
                      class="us-radar-empty"
                    >
                      找不到符合目前
                      <b>
                        ${escapeHTML(
                          activeTier
                        )}
                      </b>
                      篩選條件的股票。
                    </div>
                  `
              )
            : Array
                .from(
                  {
                    length: 6
                  },
                  (
                    _,
                    index
                  ) =>
                    renderWaitingRow(
                      index
                    )
                )
                .join("")
        }

      </div>


      ${
        !hasRadarData
          ? `
            <div
              class="us-radar-empty"
            >
              <b>
                STOCK UNIVERSE WAITING
              </b>

              <br>

              目前還沒有把美股股票池資料
              接進 US Engine。

              這不是假資料，也不會拿
              Crypto 資料填充。

              等 Bitget Stock+ 或其他
              美股 API 接通後，
              Symbol、Price、Volume、
              Relative Strength、
              OX Score、T1 / T2 / T3
              會直接進入這個畫面。
            </div>
          `
          : ""
      }


      <div
        class="us-radar-footer"
      >

        <span>
          SESSION：
          <b>
            ${escapeHTML(
              session
            )}
          </b>
        </span>

        <span>
          PROVIDER：
          <b>
            ${escapeHTML(
              provider
            )}
          </b>
        </span>

        <span>
          TIER：
          <b>
            ${escapeHTML(
              activeTier
            )}
          </b>
        </span>

        <span>
          UPDATED：
          <b>
            ${formatUpdatedAt(
              state?.updatedAt
            )}
          </b>
        </span>

      </div>

    </div>
  `;

  bindUI(
    root
  );
}

/* ========================================================================== */
/* Public                                                                     */
/* ========================================================================== */

export function renderUSRadar(
  state
) {
  lastState =
    state || null;

  /*
   * US renderer must never modify
   * Crypto / TW / Forex.
   */
  if (!isUSMarket()) {
    return {
      view: "radar",
      status:
        state?.status ||
        "inactive"
    };
  }

  const root =
    getRoot();

  if (!root) {
    return {
      view: "radar",
      status:
        "missing-root"
    };
  }

  renderShell(
    root,
    state || {}
  );

  return {
    view: "radar",

    status:
      state?.status ||
      "waiting",

    data:
      state?.data ||
      null,

    radarCount:
      getRadarItems(
        state
      ).length
  };
}
