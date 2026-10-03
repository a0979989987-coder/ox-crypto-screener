import { getUSApiBase } from "./api.js?v=20261001-us-eod1";
import { mergeCandles } from "./model.js?v=20261003-us-bitget1";
import { aggregate4H, aggregateMonthly } from "./aggregate.js?v=20261001-us-eod1";
import { EOD_CAPABILITIES } from "./eod.js";
import { DeviceEOD } from "./device-eod.js?v=20261003-us-bitget1";
import { deviceRecord } from "./device-storage.js?v=20261001-us-device1";
const cache = new Map();
const quoteCache = new Map();
let directoryCache;
const validDirectory = value => {
  if (value?.schemaVersion !== 2 || !Array.isArray(value.items) || !value.items.length ||
    value.items.some(item => !item || typeof item.symbol !== 'string' || typeof item.name !== 'string'))
    throw Error('股票目錄格式錯誤。');
  return value;
};
const temporaryFailure = e => !e.status || e.status === 429 || e.status >= 500;
const previousData = (hit, error) => hit && Date.now() - hit.receivedAt < 86400000 && temporaryFailure(error)
  ? { ...hit, stale: true, cache: { ...(hit.cache || {}), stale: true, reason: error.status === 429 ? "RATE_LIMITED" : "UPDATE_FAILED" } }
  : null;
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
  deviceReady() { return DeviceEOD.restore(); },
  async directory(options) {
    if (DeviceEOD.active) return { schemaVersion:2, items:DeviceEOD.active.packet.directory, receivedAt:Date.parse(DeviceEOD.active.packet.collectedAt) };
    if (options?.capabilities?.mode === 'perpetual') return validDirectory(await endpoint('directory',{},options));
    if (directoryCache) return directoryCache;
    let saved;
    try { saved = await deviceRecord('directory'); if (saved) validDirectory(saved); } catch { saved = null; }
    options?.signal?.throwIfAborted();
    if (saved && Date.now() - saved.cachedAt < 7 * 86400000) return directoryCache = saved;
    let value;
    try { value = validDirectory(await fetchJSON(new URL('../../../data/us-directory.json', import.meta.url), { ...options, timeout:30000 })); }
    catch (error) {
      if (options?.signal?.aborted) throw error;
      try { value = validDirectory(await endpoint('directory', {}, { ...options, timeout:30000 })); }
      catch (fallbackError) {
        if (options?.signal?.aborted || !saved) throw fallbackError;
        return directoryCache = { ...saved, stale:true };
      }
    }
    options?.signal?.throwIfAborted();
    directoryCache = { ...value, cachedAt:Date.now() };
    deviceRecord('directory', directoryCache).catch(() => {});
    return directoryCache;
  },
  async snapshot(options) {
    if (DeviceEOD.active) return DeviceEOD.active.snapshot;
    const j = await endpoint("snapshot", {}, {timeout:60000,...options});
    if (j.schemaVersion !== 2 || !Array.isArray(j.analyses))
      throw Error("掃描快照格式錯誤。");
    return j;
  },
  async capabilities(options) {
    if (DeviceEOD.active) return DeviceEOD.active.capabilities;
    try {
      return await endpoint("capabilities", {}, options);
    } catch (e) {
      if (options?.signal?.aborted) throw e;
      return { ...EOD_CAPABILITIES, capabilitiesOffline: true };
    }
  },
  async quotes(options) { return endpoint('quotes',{},options); },
  async quote(symbol, options = {}) {
    if (DeviceEOD.active) return DeviceEOD.quote(symbol);
    if (options.capabilities?.dataScope === 'device') throw Error('本機盤後資料已移除，請重新選擇盤後檔。');
    const key = `${options.capabilities?.source || 'finance-query-eod'}:${symbol}`;
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
      throw e;
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
    if (DeviceEOD.active) return DeviceEOD.candles(symbol, { interval, extendedHours, limit, to });
    if (capabilities.dataScope === 'device') throw Error('本機盤後資料已移除，請重新選擇盤後檔。');
    const key = `${capabilities.source || "finance-query-eod"}:${capabilities.sessionDate || "pending"}:${symbol}:${interval}:${extendedHours}:${to || ""}`,
      hit = cache.get(key);
    if (hit && !force && Date.now() - hit.receivedAt < (capabilities.mode === 'perpetual' ? 5000 : 86400000) &&
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
      throw e;
    }
    if (!result.bars?.length)
      throw Error("沒有有效 K 線，可能未上市、缺少成交或方案不支援。");
    // Polls fetch a small tail, while a reopened chart needs the full history.
    // Share one series cache so a 400-bar bootstrap and an 8-bar update cannot
    // strand each other's last usable response during a provider outage.
    if (hit && hit.asOf === result.asOf && hit.adjustment === result.adjustment) result = { ...result,
      bars: mergeCandles(hit.bars, result.bars).slice(-5000),
      historyExhausted: hit.historyExhausted || result.historyExhausted };
    cache.set(key, result);
    while (cache.size > 50) cache.delete(cache.keys().next().value);
    return result;
  },
};
