import { completedSession } from './eod.js';
import { nyEpoch, nyParts, candleEnd } from "./calendar.js?v=20261001-us-eod1";
export const num = (v) =>
  v === null || v === undefined || v === ""
    ? null
    : Number.isFinite(Number(v))
      ? Number(v)
      : null;
export const aliases = Object.freeze({
  AAPL: "蘋果",
  MSFT: "微軟",
  NVDA: "輝達",
  TSM: "台積電 ADR",
  AMD: "超微",
  GOOGL: "Google Alphabet",
  GOOG: "Google Alphabet",
  AMZN: "亞馬遜",
  META: "Meta 臉書",
  TSLA: "特斯拉",
  INTC: "英特爾",
  AVGO: "博通",
  MU: "美光",
  JPM: "摩根大通",
  BAC: "美國銀行",
  KO: "可口可樂",
  DIS: "迪士尼",
  SPY: "標普500 ETF",
  QQQ: "那斯達克100 ETF",
  IWM: "羅素2000 ETF",
  SOXX: "半導體 ETF",
});
export function normalizeDirectory(stocks = [], etfs = []) {
  const map = new Map();
  for (const row of [...stocks, ...etfs.map((x) => ({ ...x, type: "ETF" }))]) {
    if (
      row.country !== "United States" ||
      !["NYSE", "NASDAQ", "CBOE"].includes(row.exchange) ||
      row.currency !== "USD"
    )
      continue;
    const type =
      row.type === "American Depositary Receipt"
        ? "ADR"
        : row.type === "Common Stock"
          ? "stock"
          : row.type === "ETF"
            ? "ETF"
            : null;
    if (!type || !/^[-A-Z0-9.]{1,20}$/.test(row.symbol)) continue;
    if (map.has(row.symbol)) continue;
    const complex =
      type === "ETF" &&
      /\b(2x|3x|Ultra|Leverag|Inverse|Bear|Short|Daily.*Bull)\b/i.test(
        row.name,
      );
    map.set(row.symbol, {
      symbol: row.symbol,
      name: row.name,
      exchange: row.exchange,
      mic: row.mic_code,
      type,
      complex,
      alias: aliases[row.symbol] || "",
      sector: null,
    });
  }
  return [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}
export function normalizeQuote(raw, receivedAt = Date.now(), cap = {}) {
  const price = num(raw?.close ?? raw?.price);
  if (price === null || price <= 0 || raw?.status === "error") return null;
  const time = num(raw.last_quote_at ?? raw.timestamp);
  return {
    symbol: raw.symbol,
    name: raw.name || raw.symbol,
    exchange: raw.exchange || "",
    price,
    change: num(raw.change),
    changePct: num(raw.percent_change),
    volume: num(raw.volume),
    averageVolume: num(raw.average_volume),
    open: num(raw.open),
    high: num(raw.high),
    low: num(raw.low),
    previousClose: num(raw.previous_close),
    marketOpen: raw.is_market_open === true,
    marketTime: time,
    receivedAt,
    source: "twelve-data",
    feed: cap.feed || "未確認 feed",
    delaySeconds: cap.delaySeconds ?? null,
    session: raw.is_market_open ? "regular" : "unknown",
    volumeScope: cap.volumeScope || "資料商口徑，非全市場保證",
  };
}
export function quoteStatus(q, now = Date.now()) {
  if (q?.mode === 'eod') {
    try { return q.asOf === completedSession(now) ? `已收盤 · ${q.asOf}` : `前次收盤 · ${q.asOf} · 待更新`; }
    catch { return `收盤 · ${q.asOf} · 日曆待更新`; }
  }
  if (q?.stale) return "更新暫停 · 保留前次報價";
  if (!q?.marketTime) return "行情時間未提供";
  const age = now / 1000 - q.marketTime;
  if (q.receivedAt && now - q.receivedAt > 180000) return "快取過期";
  if (!q.marketOpen) return "收盤／非正常盤報價";
  if (age > 1200) return "行情過期";
  if (q.delaySeconds === null) return "延遲狀態未確認";
  return q.delaySeconds > 0
    ? `延遲 ${Math.round(q.delaySeconds / 60)} 分`
    : "即時 feed · 輪詢";
}
export function normalizeCandles(
  raw,
  interval = "1D",
  timezone = "America/New_York",
) {
  const values = Array.isArray(raw) ? raw : raw?.values || [];
  const map = new Map();
  for (const row of values) {
    const text = String(row.datetime || "");
    let time;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) time = nyEpoch(text);
    else if (timezone === "UTC")
      time = Date.parse(text.replace(" ", "T") + "Z") / 1000;
    else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text)) {
      const h = +text.slice(11, 13),
        m = +text.slice(14, 16);
      time =
        nyEpoch(text.slice(0, 10), h * 60 + m) + +(text.slice(17, 19) || 0);
    } else time = num(row.time);
    const [open, high, low, close, volume] = [
      "open",
      "high",
      "low",
      "close",
      "volume",
    ].map((k) => num(row[k]));
    if (
      !Number.isFinite(time) ||
      [open, high, low, close].some((v) => v === null || v <= 0) ||
      high < Math.max(open, close) ||
      low > Math.min(open, close) ||
      low > high ||
      (volume !== null && volume < 0)
    )
      continue;
    const date =
      timezone === "UTC" && text.length > 10
        ? nyParts(time * 1000).date
        : text.slice(0, 10) || nyParts(time * 1000).date;
    map.set(time, { time, open, high, low, close, volume, date });
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}
export function mergeCandles(old, next) {
  const map = new Map(old.map((c) => [c.time, c]));
  next.forEach((c) => map.set(c.time, c));
  return [...map.values()].sort((a, b) => a.time - b.time);
}
export function closedCandles(bars, interval = "1D", now = Date.now()) {
  return bars.filter((c) => {
    const end = candleEnd(c, interval);
    return end !== null && end <= now / 1000;
  });
}
export function movingAverage(bars, period) {
  return bars.flatMap((c, i) =>
    i + 1 < period
      ? []
      : [
          {
            time: c.time,
            value:
              bars
                .slice(i - period + 1, i + 1)
                .reduce((s, c) => s + c.close, 0) / period,
          },
        ],
  );
}
export function vwap(bars) {
  let date = "",
    pv = 0,
    v = 0;
  return bars.flatMap((c) => {
    if (date !== c.date) {
      date = c.date;
      pv = 0;
      v = 0;
    }
    if (c.volume === null) return [];
    pv += ((c.high + c.low + c.close) / 3) * c.volume;
    v += c.volume;
    return v ? [{ time: c.time, value: pv / v }] : [];
  });
}
export function returnOver(bars, start, end) {
  const a = bars.find((c) => c.date === start),
    b = bars.find((c) => c.date === end);
  return a && b ? (b.close / a.close - 1) * 100 : null;
}
export function relativeStrength(bars, benchmark, days = 20) {
  const key = (c) => c.time ?? c.date;
  const index = new Map(benchmark.map((c) => [key(c), c]));
  const common = bars.filter((c) => index.has(key(c)));
  if (common.length <= days) return null;
  const end = common.at(-1),
    start = common.at(-1 - days);
  return (
    (end.close / start.close -
      index.get(key(end)).close / index.get(key(start)).close) *
    100
  );
}
export function searchDirectory(rows, query, limit = 30) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return rows
    .filter((r) => `${r.symbol} ${r.name} ${r.alias}`.toLowerCase().includes(q))
    .sort((a, b) =>
      a.symbol.toLowerCase() === q ? -1 : b.symbol.toLowerCase() === q ? 1 : 0,
    )
    .slice(0, limit);
}
