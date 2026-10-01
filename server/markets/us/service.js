import { readFile } from "node:fs/promises";
import { cachedRequest } from "./cache.js";
import { withinBudget } from "./budget.js";
import {
  normalizeDirectory,
  normalizeQuote,
  normalizeCandles,
} from "../../../src/markets/us/model.js";
import { INTERVALS, sessionAt } from "../../../src/markets/us/calendar.js";
import { FREE_US_DISPLAY } from "../../../src/markets/us/widget-config.js";
import { financeQueryRequest, financeFrames, financeCandles, financeQuote } from "./finance-query.js";
const intervalMap = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "30m": "30min",
  "1H": "1h",
  "4H": "4h",
  "1D": "1day",
  "1W": "1week",
  "1M": "1month",
};
export function capabilities({ privateValidation = false } = {}) {
  if (privateValidation || process.env.US_DATA_PROVIDER === "finance-query")
    return { source: privateValidation ? "finance-query-private" : "finance-query", chartMode: "native", rawDataAvailable: true,
      privateValidation, feed: privateValidation ? "Finance Query / Yahoo · 私人驗證" : "Finance Query / Yahoo", delaySeconds: null,
      volumeScope: "資料源回傳成交量；交易所涵蓋與延遲尚未確認",
      externalDisplayConfirmed: !privateValidation && process.env.US_EXTERNAL_DISPLAY_CONFIRMED === "true",
      extendedHours: false, intervals: Object.keys(financeFrames),
      update: "OHLCV 輪詢", pollMs: Math.max(60000, Number(process.env.US_CHART_POLL_MS) || 60000),
      depth: false, trades: false, calendarYears: [2025, 2028] };
  if (process.env.US_DATA_PROVIDER !== "twelve-data")
    return { ...FREE_US_DISPLAY, intervals: INTERVALS, calendarYears: [2025, 2028] };
  return {
    source: "twelve-data",
    feed: process.env.US_FEED_NAME || "未確認 feed",
    delaySeconds:
      process.env.US_DATA_DELAY_SECONDS === undefined
        ? null
        : Number(process.env.US_DATA_DELAY_SECONDS),
    volumeScope:
      process.env.US_VOLUME_SCOPE || "日資料與盤中 feed 成交量口徑可能不同",
    externalDisplayConfirmed:
      process.env.US_EXTERNAL_DISPLAY_CONFIRMED === "true",
    extendedHours: process.env.US_EXTENDED_HOURS === "true",
    intervals: INTERVALS,
    update: "OHLCV 輪詢",
    pollMs: Math.max(60000, Number(process.env.US_CHART_POLL_MS) || 60000),
    depth: false,
    trades: false,
    calendarYears: [2025, 2028],
  };
}
let directoryPending;
export async function publicDirectory() {
  if (directoryPending) return directoryPending;
  directoryPending = readDirectory().catch((error) => {
    directoryPending = null;
    throw error;
  });
  return directoryPending;
}
async function readDirectory() {
  const j = JSON.parse(
    await readFile(
      new URL("../../../data/us-directory.json", import.meta.url),
      "utf8",
    ),
  );
  return j;
}
export async function snapshot(readSnapshot = async () => JSON.parse(await readFile(
  new URL("../../../data/us-snapshot.json", import.meta.url), "utf8"))) {
  const empty = { schemaVersion: 2, asOf: null, quotes: [], analyses: [],
    counts: { searchable: 0, quoted: 0, scanned: 0 } };
  if (capabilities().chartMode === "widget")
    return { ...empty, source: "tradingview-widget", errorCode: "RAW_DATA_UNAVAILABLE",
      error: "免費圖表可看行情；OX 掃描需要另接可供分析的原始 K 線資料。" };
  if (!capabilities().externalDisplayConfirmed)
    return { ...empty, error: "行情展示授權未確認；公開掃描尚未開通。" };
  try {
    const data = await readSnapshot();
    if (data.privateValidation || data.collection?.privateValidation)
      return { ...empty, error: "私下驗證快照不可公開展示。" };
    if (data.schemaVersion !== 2 || !Array.isArray(data.quotes) || !Array.isArray(data.analyses))
      return { ...empty, error: "掃描快照格式無效，暫無分析結果。" };
    return data;
  } catch {
    return { ...empty, error: "共用掃描快照尚未建立，暫無分析結果。" };
  }
}
export async function handleUS2(endpoint, query, upstream, financeUpstream = financeQueryRequest, options = {}) {
  const cap = capabilities(options);
  if (endpoint === "capabilities")
    return { ...cap, session: sessionAt() };
  if (endpoint === "directory") return publicDirectory();
  if (endpoint === "snapshot") return snapshot();
  if (!["chart-v2", "quote-v2"].includes(endpoint)) return null;
  if (cap.chartMode === "widget") {
    const error = Error("TradingView 免費圖表不提供原始行情 API；請使用頁面內圖表。");
    error.code = "RAW_DATA_UNAVAILABLE";
    error.status = 503;
    throw error;
  }
  const symbol = String(query.symbol || "").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(symbol)) {
    const e = Error("無效美股代號。");
    e.code = 400;
    throw e;
  }
  const directory = await publicDirectory();
  if (!directory.items.some((x) => x.symbol === symbol)) {
    const e = Error("官方支援目錄中找不到這個代號。");
    e.code = 404;
    throw e;
  }
  if (!cap.externalDisplayConfirmed && !options.privateValidation && process.env.NODE_ENV !== "test") {
    const error = Error("美股對外展示授權尚未確認。");
    error.code = "LICENSE_NOT_CONFIRMED";
    error.status = 403;
    throw error;
  }
  if (endpoint === "quote-v2") {
    const saved = await cachedRequest(
      `quote:${cap.source}:${symbol}`,
      () => withinBudget(1, () => cap.source.startsWith("finance-query")
        ? financeUpstream(`/quote/${encodeURIComponent(symbol)}`)
        : upstream("/quote", { symbol })),
      { ttl: 60000, stale: 86400000, withMetadata: true },
    );
    const q = cap.source.startsWith("finance-query")
      ? financeQuote(saved.value, symbol, saved.cache.fetchedAt, cap)
      : normalizeQuote(saved.value, saved.cache.fetchedAt, cap);
    if (!q) {
      const e = Error("資料源沒有有效報價或此代號已失效。");
      e.code = 404;
      throw e;
    }
    return { quote: { ...q, stale: saved.cache.stale, cache: saved.cache }, capabilities: cap };
  }
  const interval = query.interval || "1D",
    extended = query.extendedHours === "true";
  if (!cap.intervals.includes(interval)) {
    const e = Error("不支援這個時間級別。");
    e.code = 400;
    throw e;
  }
  // Native 4h alignment is not guaranteed to follow the 09:30 session. Aggregate 30m instead.
  if (extended && !cap.extendedHours) {
    const e = Error("目前方案的盤前盤後權限尚未確認。");
    e.code = 403;
    throw e;
  }
  if (extended && !["1m", "5m", "15m", "30m"].includes(interval)) {
    const e = Error("盤前盤後僅開放資料商支援的 1／5／15／30 分。");
    e.code = 400;
    throw e;
  }
  const limit = Math.max(1, Math.min(5000, Number(query.limit) || 400));
  // Standard bootstrap and tail updates share one upstream cache. A changed
  // outputsize used to consume another credit and strand the last good bars.
  const cacheLimit = Math.max(400, limit);
  const params = {
    symbol,
    interval: interval === "4H" ? "30min" : intervalMap[interval],
    outputsize: interval === "4H" ? Math.min(5000, cacheLimit * 8) : cacheLimit,
    timezone: "UTC",
    adjust: "splits",
    ...(extended ? { prepost: "true" } : {}),
    ...(query.to ? { end_date: query.to } : {}),
  };
  if (
    query.to &&
    !/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2})?$/.test(query.to)
  ) {
    const e = Error("歷史續載日期無效。");
    e.code = 400;
    throw e;
  }
  const key = `bars:${cap.source}:${symbol}:${interval}:${extended}:${cacheLimit}:${query.to || ""}`;
  if (cap.source.startsWith("finance-query")) {
    const [sourceInterval, range] = financeFrames[interval];
    // Absolute-date requests have returned a different frame upstream. Fetch
    // the verified range and filter locally; never label daily data as minutes.
    const saved = await cachedRequest(`finance-chart:${cap.source}:${symbol}:${sourceInterval}:${range}`,
      () => withinBudget(1, async () => {
        const raw = await financeUpstream(`/chart/${encodeURIComponent(symbol)}`, { interval: sourceInterval, range });
        financeCandles(raw, symbol, interval); // Validate before caching.
        return raw;
      }), { ttl: 60000, stale: 86400000, withMetadata: true });
    let bars = financeCandles(saved.value, symbol, interval);
    if (query.to) {
      const before = Date.parse(query.to.replace(" ", "T") + (query.to.length > 10 ? "Z" : "T00:00:00Z")) / 1000;
      bars = bars.filter(bar => bar.time < before);
    }
    return { symbol, interval, bars: bars.slice(-limit), source: cap.source,
      feed: cap.feed, receivedAt: saved.cache.fetchedAt, stale: saved.cache.stale,
      cache: saved.cache, delaySeconds: null, adjustment: "unknown", session: "regular",
      volumeScope: cap.volumeScope, historyExhausted: bars.length <= limit,
      historyRange: range, capabilities: cap };
  }
  const saved = await cachedRequest(
    key,
    () => withinBudget(1, () => upstream("/time_series", params)),
    { ttl: query.to ? 86400000 : 60000, stale: 86400000, withMetadata: true },
  );
  const raw = saved.value;
  let bars = normalizeCandles(raw, interval, "UTC");
  if (interval === "4H")
    bars = (await import("../../../src/markets/us/aggregate.js")).aggregate4H(
      bars,
    );
  const volumeScope = ["1D", "1W", "1M"].includes(interval)
    ? "日級資料；全市場成交量依資料商 EOD 完成時間確認"
    : "資料商盤中 feed 成交量，非全市場";
  return {
    symbol,
    interval,
    bars: bars.slice(-limit),
    source: "twelve-data",
    feed: cap.feed,
    receivedAt: saved.cache.fetchedAt,
    stale: saved.cache.stale,
    cache: saved.cache,
    delaySeconds: cap.delaySeconds,
    adjustment: "splits",
    session: extended ? "extended" : "regular",
    volumeScope,
    historyExhausted: raw.values?.length < params.outputsize,
    capabilities: cap,
  };
}
