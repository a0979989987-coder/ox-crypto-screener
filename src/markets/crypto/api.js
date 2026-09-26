const ASSET_CLASS = Object.freeze({
  CRYPTO: "crypto",
  STOCK: "stock",
  ETF: "etf",
  COMMODITY: "commodity",
  INDEX: "index",
  OTHER: "other"
});

// Centralized fallback only. Official Bitget instrument metadata is preferred whenever available.
const NON_CRYPTO_UNDERLYINGS = Object.freeze({
  stock: new Set([
    "AAPL","TSLA","NVDA","META","MSFT","INTC","COIN","PLTR","NFLX","BABA","AMZN","GOOG","GOOGL","AMD","MSTR","HOOD","MARA","RIOT","SMCI","AVGO","ORCL","CRM","MU","TSM","QCOM","ARM","RDDT","UBER","NIO","JD","PDD","SHOP","PYPL","DIS","BA","JPM","GS","BAC","WMT","COST","KO","MCD","SBUX","XOM","CVX","LLY","UNH","JNJ"
  ]),
  etf: new Set([
    "SPY","QQQ","IWM","DIA","SOXL","SOXS","TQQQ","SQQQ","ARKK","GLD","SLV","USO","BITO","IBIT","ETHA"
  ]),
  commodity: new Set([
    "XAU","XAG","XPT","XPD","GOLD","SILVER","WTI","BRENT","USOIL","UKOIL","NATGAS","NG","COPPER"
  ]),
  index: new Set([
    "SPX","SP500","NDX","NASDAQ","NAS100","DJI","DOW","VIX","DXY","US100","US30","US500","HK50","GER40","JPN225"
  ])
});

// Asset-backed crypto tokens remain crypto contracts even if their economics reference metals.
const CRYPTO_TOKEN_EXCEPTIONS = new Set(["PAXG","XAUT","DGX"]);

function normalizeUnderlyingSymbol(contract = {}) {
  const raw = String(contract.baseCoin || contract.baseAsset || contract.underlying || contract.symbol || "").toUpperCase().trim();
  return raw.replace(/USDT$|USDC$/i, "").replace(/[^A-Z0-9._-]/g, "");
}

function classifyInstrument(contract = {}) {
  const base = normalizeUnderlyingSymbol(contract);
  if (CRYPTO_TOKEN_EXCEPTIONS.has(base)) return ASSET_CLASS.CRYPTO;

  // Bitget v3 instrument metadata exposes crypto / metal / stock / commodity symbol types.
  const type = String(contract.assetSymbolType || contract.instrumentSymbolType || contract.v3SymbolType || contract.symbolTypeV3 || "").toLowerCase();
  if (type === "crypto") return ASSET_CLASS.CRYPTO;
  if (type === "stock") return NON_CRYPTO_UNDERLYINGS.etf.has(base) ? ASSET_CLASS.ETF : ASSET_CLASS.STOCK;
  if (type === "metal" || type === "commodity") return ASSET_CLASS.COMMODITY;
  if (type === "index") return ASSET_CLASS.INDEX;
  if (type === "etf") return ASSET_CLASS.ETF;

  // Future-proof metadata hints if Bitget extends the schema.
  const metadataHint = [contract.assetClass, contract.assetType, contract.underlyingType, contract.category, contract.instrumentType]
    .filter(Boolean).join(" ").toLowerCase();
  if (/\betf\b/.test(metadataHint)) return ASSET_CLASS.ETF;
  if (/\b(index|indices)\b/.test(metadataHint)) return ASSET_CLASS.INDEX;
  if (/\b(stock|equity|share)\b/.test(metadataHint)) return ASSET_CLASS.STOCK;
  if (/\b(metal|commodity)\b/.test(metadataHint)) return ASSET_CLASS.COMMODITY;
  if (/\bcrypto(currency)?\b/.test(metadataHint)) return ASSET_CLASS.CRYPTO;

  for (const cls of [ASSET_CLASS.STOCK, ASSET_CLASS.ETF, ASSET_CLASS.COMMODITY, ASSET_CLASS.INDEX]) {
    if (NON_CRYPTO_UNDERLYINGS[cls]?.has(base)) return cls;
  }

  // v2 contract endpoint is crypto-heavy and does not expose a reliable asset class for every listing.
  // If v3 metadata is unavailable, default to crypto after centralized non-crypto fallbacks above.
  return ASSET_CLASS.CRYPTO;
}

function isCryptoInstrument(contract) {
  return classifyInstrument(contract) === ASSET_CLASS.CRYPTO;
}

function isCryptoSymbolAllowed(symbol) {
  const known = state.instrumentCatalog?.get(symbol) || state.contracts?.get(symbol);
  if (known) return isCryptoInstrument(known);
  return isCryptoInstrument({ symbol, baseCoin: String(symbol || "").replace(/USDT$|USDC$/i, "") });
}

const BitgetAPI = {
  async fetchTickers() {
    const res = await fetch(`${CONFIG.apiBase}/tickers?productType=${CONFIG.productType}`, { cache: "no-store" });
    const json = await res.json();
    if (json.code !== "00000" || !Array.isArray(json.data)) throw new Error("Ticker 格式錯誤");
    return json.data;
  },

  async fetchContracts() {
    const res = await fetch(`${CONFIG.apiBase}/contracts?productType=${CONFIG.productType}`, { cache: "no-store" });
    const json = await res.json();
    if (json.code !== "00000" || !Array.isArray(json.data)) return [];
    return json.data.filter(x => x.symbolStatus === "normal" && x.symbolType === "perpetual" && x.quoteCoin === "USDT");
  },

  async fetchInstrumentMetadata() {
    try {
      const res = await fetch(`https://api.bitget.com/api/v3/market/instruments?category=${CONFIG.productType}`, { cache: "no-store" });
      const json = await res.json();
      if (json.code !== "00000" || !Array.isArray(json.data)) return [];
      return json.data;
    } catch (e) {
      return [];
    }
  },

  async fetchCandles(symbol, granularity, limit = 100, endTime = null) {
    // Older pages use Bitget's history endpoint; recent candles only cover a short window.
    const endpoint = endTime ? "history-candles" : "candles";
    let url = `${CONFIG.apiBase}/${endpoint}?symbol=${encodeURIComponent(symbol)}&productType=${CONFIG.productType}&granularity=${granularity}&limit=${Math.min(200, limit)}`;
    if (endTime) url += `&endTime=${endTime}`;
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();
    if (json.code !== "00000" || !Array.isArray(json.data)) return [];
    
    // 使用 ES6 陣列解構，百分之百避免任何下標被誤刪
    return json.data.map(d => {
      const [rawTime, rawOpen, rawHigh, rawLow, rawClose, rawVol, rawQuoteVol] = d;
      return {
        time: Math.floor(num(rawTime) / 1000),
        open: num(rawOpen),
        high: num(rawHigh),
        low: num(rawLow),
        close: num(rawClose),
        volume: num(rawVol),
        quoteVolume: num(rawQuoteVol)
      };
    }).filter(c => Number.isFinite(c.open) && Number.isFinite(c.close) && c.open > 0 && c.close > 0)
      .sort((a, b) => a.time - b.time);
  }
};
