import { usProvider, getUSApiBase } from "./api.js?v=20261001-us-native5";
import { normalizeCandles, normalizeQuote, mergeCandles } from "./model.js?v=20261001-us-native5";
import { aggregate4H, aggregateMonthly } from "./aggregate.js?v=20261001-us-native5";
import { FREE_US_DISPLAY } from "./widget-config.js?v=20261001-us-native5";
const cache = new Map();
const quoteCache = new Map();
const temporaryFailure = e => !e.status || e.status === 429 || e.status >= 500;
const previousData = (hit, error) => hit && Date.now() - hit.receivedAt < 86400000 && temporaryFailure(error)
  ? { ...hit, stale: true, cache: { ...(hit.cache || {}), stale: true, reason: error.status === 429 ? "RATE_LIMITED" : "UPDATE_FAILED" } }
  : null;
// Old endpoints are used only to validate the existing integration locally.
// A public preview must never bypass the new redistribution-rights gate.
const localValidation = () =>
  typeof location !== "undefined" &&
  ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
export async function fetchJSON(url, { signal, timeout = 12000 } = {}) {
  const c = new AbortController(),
    abort = () => c.abort();
  if (signal?.aborted) c.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const t = setTimeout(abort, timeout);
  try {
    const r = await fetch(url, { signal: c.signal });
    const j = await r.json();
    if (!r.ok || j.ok === false) {
      const e = Error(j.error?.message || `資料請求失敗（${r.status}）`);
      e.status = r.status;
      e.code = j.error?.code;
      throw e;
    }
    return j.data ?? j;
  } finally {
    clearTimeout(t);
    signal?.removeEventListener("abort", abort);
  }
}
async function endpoint(path, params = {}, options = {}) {
  const url = new URL(`${getUSApiBase()}/v1/us/${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  return fetchJSON(url, options);
}
export const USAdapter = {
  async directory(options) {
    const j = await fetchJSON("data/us-directory.json", options);
    if (j.schemaVersion !== 2 || !Array.isArray(j.items))
      throw Error("股票目錄格式錯誤。");
    return j;
  },
  async snapshot(options) {
    const j = await endpoint("snapshot", {}, options);
    if (j.schemaVersion !== 2 || !Array.isArray(j.analyses))
      throw Error("掃描快照格式錯誤。");
    return j;
  },
  async capabilities(options) {
    try {
      return await endpoint("capabilities", {}, options);
    } catch (e) {
      if (options?.signal?.aborted) throw e;
      return { ...FREE_US_DISPLAY, capabilitiesOffline: true };
    }
  },
  async quote(symbol, options = {}) {
    const key = `${options.capabilities?.source || 'twelve-data'}:${symbol}`;
    try {
      const j = await endpoint("quote-v2", { symbol }, options);
      quoteCache.set(key, j.quote);
      while (quoteCache.size > 100) quoteCache.delete(quoteCache.keys().next().value);
      return j.quote;
    } catch (e) {
      if (!options.signal?.aborted) {
        const previous = previousData(quoteCache.get(key), e);
        if (previous) return previous;
      }
      if (options.signal?.aborted || e.status !== 404 || !localValidation())
        throw e;
      const raw = await usProvider.getQuote(symbol, options);
      const q = normalizeQuote(raw);
      if (!q) throw Error("此代號沒有有效報價。");
      return q;
    }
  },
  async candles(
    symbol,
    {
      interval = "1D",
      extendedHours = false,
      limit = 400,
      to,
      signal,
      force = false,
      capabilities = {},
    } = {},
  ) {
    const key = `${capabilities.source || "twelve-data"}:${symbol}:${interval}:${extendedHours}:${to || ""}`,
      hit = cache.get(key);
    if (hit && !force && Date.now() - hit.receivedAt < 60000 &&
      (hit.bars.length >= limit || hit.historyExhausted)) return hit;
    let result;
    try {
      result = await endpoint(
        "chart-v2",
        { symbol, interval, extendedHours, limit, to },
        { signal },
      );
    } catch (e) {
      if (!signal?.aborted) {
        const previous = previousData(hit, e);
        if (previous) return previous;
      }
      if (signal?.aborted || e.status !== 404 || !localValidation()) throw e;
      if (extendedHours && !capabilities.extendedHours)
        throw Error("盤前盤後權限尚未確認。");
      const inputInterval =
        interval === "4H" ? "30m" : interval === "1M" ? "1D" : interval;
      const inputLimit =
        interval === "4H"
          ? Math.min(5000, limit * 8)
          : interval === "1M"
            ? 5000
            : limit;
      const raw = await usProvider.getCandles(symbol, {
        interval: inputInterval,
        extendedHours,
        limit: inputLimit,
        to,
        signal,
      });
      let bars = normalizeCandles(raw, inputInterval);
      if (interval === "4H") bars = aggregate4H(bars);
      if (interval === "1M") bars = aggregateMonthly(bars);
      result = {
        symbol,
        interval,
        bars,
        source: "twelve-data",
        feed: "未確認 feed",
        delaySeconds: null,
        adjustment: "資料商預設（舊後端未確認）",
        session: extendedHours ? "extended" : "regular",
        volumeScope: "資料商口徑，非全市場保證",
        receivedAt: Date.now(),
        historyExhausted: raw.values?.length < limit,
        legacy: true,
      };
    }
    if (!result.bars?.length)
      throw Error("沒有有效 K 線，可能未上市、缺少成交或方案不支援。");
    // Polls fetch a small tail, while a reopened chart needs the full history.
    // Share one series cache so a 400-bar bootstrap and an 8-bar update cannot
    // strand each other's last usable response during a provider outage.
    if (hit && hit.adjustment === result.adjustment) result = { ...result,
      bars: mergeCandles(hit.bars, result.bars).slice(-5000),
      historyExhausted: hit.historyExhausted || result.historyExhausted };
    cache.set(key, result);
    while (cache.size > 50) cache.delete(cache.keys().next().value);
    return result;
  },
};
