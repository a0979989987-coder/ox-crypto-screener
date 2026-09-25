"use strict";

const CONFIG = {
  apiBase: "https://api.bitget.com/api/v2/mix/market",
  productType: "USDT-FUTURES",
  
  liquidity: {
    minUsdtVolume24h: 3000000,
    t1MinUsdtVolume: 12000000,
    topPercentileCutoff: 0.65,
    lowLiqPenaltyRatio: 0.35,
  },

  weights: {
    liquidity: 0.25,
    moneyFlow: 0.25,
    structure: 0.20,
    setupMatch: 0.15,
    relativeStrength: 0.10,
    momentum: 0.05
  },

  queueBatchSize: 10,
  batchIntervalMs: 2500,
  tickerRefreshMs: 15000
};

const state = {
  symbol: "BTCUSDT",
  period: "1D",
  currentTab: "t1",
  directionFilter: "long",
  activeView: "home",
  activeMarket: "crypto",
  
  tickers: [],
  contracts: new Map(),
  instrumentCatalog: new Map(),
  assetClassCounts: { crypto: 0, stock: 0, etf: 0, commodity: 0, index: 0, other: 0 },
  btcTicker: null,
  ethTicker: null,
  
  scanQueue: [],
  scanIndex: 0,
  analyzedCache: new Map(),
  isQueueRunning: false,
  
  tierMap: { t1: [], t2: [], t3: [], surge: [], gainers: [], losers: [] },
  tierMapBySide: { long: { t1: [], t2: [], t3: [] }, short: { t1: [], t2: [], t3: [] } },

  chart: null,
  candleSeries: null,
  volumeSeries: null,
  candleData: [],
  isLoadingOlder: false,
  hasMoreHistory: true,
  oldestCandleTime: 0,
  abortCtrl: null,
  keyHighLine: null,
  keyLowLine: null,
  secondaryKeyHighLine: null,
  secondaryKeyLowLine: null,
  currentLevels: { high: 0, low: 0, sourcePeriod: "4H", highTime: 0, lowTime: 0 },
  secondaryLevels: null,
  keyLevelsVisible: false,
  audioCtx: null
};

// 每次新載入預設關閉「前高前低」視覺；計算與提醒仍照常執行。
state.keyLevelsVisible = false;
try { localStorage.setItem("ox-chart-key-levels-visible", "0"); } catch (e) {}

try {
  const savedTier = localStorage.getItem("ox-scanner-tier-filter");
  const savedDirection = localStorage.getItem("ox-scanner-direction-filter");
  if (["t1","t2","t3","surge","watch"].includes(savedTier)) state.currentTab = savedTier;
  state.directionFilter = ["long","short"].includes(savedDirection) ? savedDirection : "long";
  localStorage.setItem("ox-scanner-direction-filter", state.directionFilter);
} catch (e) { state.directionFilter = "long"; }

function syncDirectionalBadges() {
  const sideMap = state.tierMapBySide?.[state.directionFilter] || { t1:[], t2:[], t3:[] };
  const surge = (state.tierMap.surge || []).filter(c => String(c.side || "").toLowerCase() === state.directionFilter);
  const values = { t1:sideMap.t1?.length || 0, t2:sideMap.t2?.length || 0, t3:sideMap.t3?.length || 0, surge:surge.length };
  Object.entries(values).forEach(([k,v]) => { const el=document.getElementById(`badge-${k}`); if(el) el.textContent=v; });
}

function syncScannerFilterUI() {
  document.querySelectorAll(".tab-btn[data-tab]").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === state.currentTab));
  /* STEP 4.5 REGRESSION FIX START */
  document.getElementById("view-radar")?.classList.toggle("ox-filter-short", state.directionFilter === "short");
  /* STEP 4.5 REGRESSION FIX END */
  const toggle = document.getElementById("direction-toggle");
  if (toggle) {
    const isLong = state.directionFilter === "long";
    toggle.classList.toggle("is-long", isLong);
    toggle.classList.toggle("is-short", !isLong);
    toggle.setAttribute("aria-pressed", isLong ? "false" : "true");
    toggle.title = isLong ? "目前：多頭模式；點擊切換空頭" : "目前：空頭模式；點擊切換多頭";
    const icon = toggle.querySelector(".direction-toggle-icon");
    const text = toggle.querySelector(".direction-toggle-text");
    if (icon) icon.textContent = isLong ? "↑" : "↓";
    if (text) text.textContent = isLong ? "多" : "空";
  }
  syncDirectionalBadges();
}

function persistScannerFilters() {
  try {
    localStorage.setItem("ox-scanner-tier-filter", state.currentTab);
    localStorage.setItem("ox-scanner-direction-filter", state.directionFilter);
  } catch (e) {}
  document.dispatchEvent(new CustomEvent("ox:filterchange", { detail: { tier: state.currentTab, direction: state.directionFilter } }));
}

function setScannerTierFilter(tab) {
  if (!["t1","t2","t3","surge","watch"].includes(tab)) return;
  state.currentTab = tab;
  persistScannerFilters();
  syncScannerFilterUI();
  renderCurrentTab();
}

function setScannerDirectionFilter(direction) {
  if (!["long","short"].includes(direction)) return;
  state.directionFilter = direction;
  persistScannerFilters();
  syncScannerFilterUI();
  renderCurrentTab();
}

function toggleScannerDirection() {
  setScannerDirectionFilter(state.directionFilter === "long" ? "short" : "long");
}

function passesDirectionFilter(side) {
  return String(side || "").toLowerCase() === state.directionFilter;
}

const periods = {
  "1m": 60, "5m": 300, "15m": 900, "1H": 3600, "4H": 14400, "1D": 86400, "1W": 604800
};

const num = v => Number(v) || 0;
const fmtUsd = v => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(num(v));
const fmtPrice = v => {
  const x = num(v);
  if (!Number.isFinite(x) || x === 0) return "—";
  const d = x >= 1000 ? 2 : x >= 1 ? 4 : x >= 0.01 ? 6 : 8;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(x);
};
const fmtPct = v => `${num(v) >= 0 ? "+" : ""}${(num(v) * 100).toFixed(2)}%`;


const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));
const benchmarkSymbols = new Set(["BTCUSDT", "ETHUSDT"]);

/* ===== BTC vs ALT Relative Strength 2.0 =====
   Relative leadership is intentionally separated from absolute market direction.
   All weights live here so future tuning never gets scattered through UI code. */
