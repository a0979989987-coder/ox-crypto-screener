import { twProvider } from '../api.js';
import { createTWMarketState } from '../engine.js';
import { savedResearch, loadResearch } from '../research-data.js';
import { TIMEFRAMES, selectUniverse, dailyCandles, weeklyCandles } from './model.js';
export { TIMEFRAMES };
export const detailStamp = row => `${row.frame==='1W'?'已完成週 · 截至':'資料日'} ${row.candles.at(-1).lastDate || row.candles.at(-1).date}`;
export const id = 'tw', label = '台股 · TWSE／TPEx', asset = '股票', currency = '元', period = '當日', defaultFrames = ['1D'], defaultLimit = 80;
export const displayName = row => `${row.symbol} ${row.name || row.ticker?.name || ''}`.trim();
export const help = '<p>以官方上市、上櫃普通股的成交額選取觀察池，日線使用官方 OHLC；週線由實際日線合併，只比對已完成的週。休市與缺漏不補造 K 線。首次分類逐步顯示進度，同一交易日再次進入可沿用裝置快取。</p><p>型態 T1／T2／T3 代表觀察階段，與原雷達分級分開；相似度不是勝率。未畫圖先顯示雷達候選，畫圖或選型態後搜尋已分類股票。OX 沿用台股雷達官方資料評分，未知顯示 —，不使用加密合約公式。成交額與漲跌為資料日行情，非即時。</p><p>白線標示比對區段，W／M 可切換型態條件與相似路徑。點選股票卡片可拖曳與雙指縮放 K 線；資料缺漏會跳過並顯示缺漏數。</p>';
const cache = new Map();
export function dataDate() { return savedResearch()?.date || null; }
export function radarCandidates() {
  const rows = createTWMarketState()?.data?.radar || [];
  return [1, 2, 3].flatMap(tier => rows.filter(row => row.tier === 'T' + tier).sort((a, b) => (b.oxScore || 0) - (a.oxScore || 0)).slice(0, 10).map((row, rank) => ({ symbol: row.symbol, tier, rank })));
}
export async function fetchUniverse(signal, limit = 80) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  // Background preload supplies the same snapshot consumed by Home and sectors.
  const snapshot = (await loadResearch()).data || savedResearch();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const eligible = selectUniverse(snapshot?.stocks || [], 0), symbols = new Set(radarCandidates().map(row => row.symbol));
  const selected = selectUniverse(eligible, limit);
  const tickers = [...eligible.filter(row => symbols.has(row.symbol)), ...selected.filter(row => !symbols.has(row.symbol))];
  if (!tickers.length || !snapshot?.date) throw Error('官方台股觀察池尚未取得，請稍後重新掃描');
  return { tickers, allTickers: eligible, dataDate: snapshot.date, serverTime: Date.now() };
}
export function primeCandleCache(data) {
  if (TIMEFRAMES[data?.frame] && data.candles?.length >= 35) cache.set(data.symbol + ':' + data.frame, data);
}
export async function fetchSeries(symbol, frame, signal, asOf = dataDate()) {
  if (!TIMEFRAMES[frame] || !asOf) throw Error('台股時間級別或資料日期尚未取得');
  const key = symbol + ':' + frame, cached = cache.get(key);
  if (cached?.dataDate === asOf) return cached;
  const payload = await twProvider.getCandles(symbol, { interval: '1D', range: frame === '1W' ? '1Y' : '3M', to: asOf, adjusted: false, signal, timeoutMs: 45000 });
  const daily = dailyCandles(payload?.candles || [], asOf);
  if (daily.at(-1)?.date !== asOf) throw Error(`${symbol} 官方日線缺少資料日，已跳過`);
  const candles = (frame === '1W' ? weeklyCandles(daily, asOf) : daily).slice(-200);
  if (candles.length < 35) throw Error(`${symbol} ${frame} 官方 K 線不足`);
  const quote = savedResearch()?.stocks?.find(row => row.symbol === symbol);
  const radar = createTWMarketState()?.data?.radar?.find(row => row.symbol === symbol);
  const value = { candles, symbol, name: quote?.name || payload.name, market: 'tw', frame, dataDate: asOf, source: 'TWSE／TPEx', serverTime: Date.now(), turnover: quote?.turnoverTwd ?? null, change: quote?.changePct ?? null, oxScore: radar?.oxScore ?? null };
  primeCandleCache(value); return value;
}
export async function scanUniverse(universe, frames, { signal, onSeries, onProgress }) {
  let cursor = 0, done = 0, failed = 0, coinsDone = 0;
  const total = universe.tickers.length * frames.length, coinsTotal = universe.tickers.length;
  const emit = () => onProgress({ done, total, failed, coinsDone, coinsTotal });
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (cursor < universe.tickers.length) {
      const ticker = universe.tickers[cursor++];
      for (const frame of frames) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        try { await onSeries({ ...await fetchSeries(ticker.symbol, frame, signal, universe.dataDate), ticker }); }
        catch (error) { if (signal.aborted) throw error; failed++; }
        done++; emit();
      }
      coinsDone++; emit();
    }
  }));
}
