import { normalizeCandles } from '../../../src/markets/us/model.js';
import { nyParts, tradingDay } from '../../../src/markets/us/calendar.js';
import { aggregate4H } from '../../../src/markets/us/aggregate.js';
import { confirmedChart } from '../../../scripts/lib/finance-query-validation.mjs';

// Fixed official host: no caller-controlled URLs or automatic quota bypass.
export async function financeQueryRequest(path, params = {}) {
  const url = new URL(`https://finance-query.com/v2${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  } catch (error) {
    throw Object.assign(Error(error.name === 'TimeoutError'
      ? 'Finance Query 回應逾時，請稍後重試。' : 'Finance Query 連線失敗，請稍後重試。'),
      { status: error.name === 'TimeoutError' ? 504 : 502 });
  }
  if (!response.ok) {
    const header = response.headers.get('retry-after');
    const seconds = Number(header) || Math.ceil((Date.parse(header) - Date.now()) / 1000);
    throw Object.assign(Error('Finance Query 資料請求失敗。'), {
      status: response.status, ...(response.status === 429 ? { retryAfter: Math.max(60, seconds || 60) } : {}),
    });
  }
  const data = await response.json();
  if (data.error || data.status === 'error')
    throw Object.assign(Error('Finance Query 資料源回傳錯誤。'), {
      status: /429|rate.?limit|quota/i.test(JSON.stringify(data.error || data.message)) ? 429 : 502,
    });
  return data;
}
export const financeFrames = {
  '1m': ['1m', '5d'], '5m': ['5m', '1mo'], '15m': ['15m', '1mo'],
  '30m': ['30m', '1mo'], '1H': ['1h', '2y'], '4H': ['1h', '2y'],
  '1D': ['1d', '5y'],
};
export function financeCandles(raw, symbol, frame) {
  const [sourceInterval] = financeFrames[frame];
  const chart = confirmedChart(raw, symbol, sourceInterval);
  let bars = normalizeCandles(chart.candles.map(row => ({ ...row, time: row.timestamp })), frame);
  if (frame !== '1D') bars = bars.filter(bar => {
    const parts = nyParts(bar.time * 1000), day = tradingDay(parts.date);
    return day.known && day.open && parts.minute >= 570 && parts.minute < day.closeMinute;
  });
  if (frame === '4H') bars = aggregate4H(bars, Date.now(), 60);
  return bars;
}
export function financeQuote(raw, symbol, receivedAt, cap) {
  if (raw.symbol !== symbol || !Number.isFinite(raw.regularMarketPrice) || raw.regularMarketPrice <= 0)
    throw Object.assign(Error('資料源沒有有效報價。'), { status: 404 });
  return {
    symbol, name: raw.shortName || raw.longName || symbol, exchange: raw.exchange || '',
    price: raw.regularMarketPrice, change: raw.regularMarketChange ?? null,
    changePct: Number.isFinite(raw.regularMarketPreviousClose) && raw.regularMarketPreviousClose > 0
      ? (raw.regularMarketPrice / raw.regularMarketPreviousClose - 1) * 100 : null, volume: raw.regularMarketVolume ?? null,
    averageVolume: raw.averageDailyVolume3Month ?? null, open: raw.regularMarketOpen ?? null,
    high: raw.regularMarketDayHigh ?? null, low: raw.regularMarketDayLow ?? null,
    previousClose: raw.regularMarketPreviousClose ?? null,
    marketTime: Number.isFinite(raw.regularMarketTime) ? raw.regularMarketTime : null,
    marketOpen: raw.marketState === 'REGULAR', receivedAt, source: cap.source,
    feed: cap.feed, delaySeconds: cap.delaySeconds, volumeScope: cap.volumeScope,
    session: raw.marketState === 'REGULAR' ? 'regular' : 'unknown',
  };
}
