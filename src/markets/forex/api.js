import { FOREX_CURRENCIES, FOREX_MODULE_CONFIG } from "./config.js";
import { isoDate } from "../../core/utils.js";

const quotes = FOREX_CURRENCIES.filter(code => code !== "USD").join(",");

export function normalizeForexHistory(payload, { source = "Frankfurter / ECB reference rates" } = {}) {
  let rates = {}, dates = [];
  if (Array.isArray(payload)) {
    payload.forEach(row => { if (row?.date && row?.quote && Number.isFinite(Number(row.rate))) (rates[row.date] ||= {})[String(row.quote).toUpperCase()] = Number(row.rate); });
    dates = Object.keys(rates).sort();
  } else { rates = payload?.rates || {}; dates = Object.keys(rates).sort(); }
  if (dates.length < 2) throw new Error("Forex reference history is not available");
  return { source, provider: "ecb", base: "USD", dates, rates, updatedAt: dates.at(-1), capabilities: Object.freeze({ referenceDaily: true, candles: "derived-daily", volume: false, spread: false, intraday: false }) };
}

export function createForexProvider({ fetchImpl = fetch, apiBase = FOREX_MODULE_CONFIG.apiBase, provider = FOREX_MODULE_CONFIG.provider } = {}) {
  return Object.freeze({
    id: "frankfurter-ecb-reference",
    capabilities: Object.freeze({ secretRequired: false, referenceDaily: true, volume: false, spread: false, intraday: false }),
    async fetchHistory(days = FOREX_MODULE_CONFIG.historyDays) {
      const end = new Date(), start = new Date(end); start.setUTCDate(start.getUTCDate() - days);
      const url = `${apiBase}/rates?base=usd&quotes=${quotes.toLowerCase()}&from=${isoDate(start)}&to=${isoDate(end)}&providers=${provider}`;
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
      try { const response = await fetchImpl(url, { cache: "no-store", signal: controller.signal }); if (!response.ok) throw new Error(`Forex data HTTP ${response.status}`); return normalizeForexHistory(await response.json()); }
      finally { clearTimeout(timer); }
    }
  });
}

export const forexProvider = createForexProvider();
export const fetchForexHistory = days => forexProvider.fetchHistory(days);
