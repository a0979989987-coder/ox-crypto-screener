import { classifyTWSeries } from '../classic.js?v=20261001-classic1';
import { preloadBundle, bundleEntry, bundleEntries, bundleState } from './bundle.js?v=20261001-classic1';
import { twProvider } from '../api.js?v=20261001-tiercomb1';
import { createTWMarketState } from '../engine.js?v=20261001-classic1';
import { savedResearch, loadResearch } from '../research-data.js?v=20261001-twhome1';
import { TIMEFRAMES, selectUniverse, dailyCandles } from './model.js';
import { aggregateChartCandles } from '../chart-data.js?v=20261001-loading1';
export { TIMEFRAMES };
export const detailStamp = row => `${row.frame!=='1D'?'已完成合併 K · 截至':'資料日'} ${row.candles.at(-1).lastDate || row.candles.at(-1).date}`;
export const id = 'tw', label = '台股 · TWSE／TPEx', asset = '股票', currency = '元', period = '當日', defaultFrames = ['1D'], defaultLimit = 0;
export const displayName = row => `${row.symbol} ${row.name || row.ticker?.name || ''}`.trim();
export const help = '<p>以官方上市、上櫃普通股的真實日 K 與成交量判斷 OX 經典；其他級別由已完成的日 K 合併。休市與缺漏不補造 K 線。先確認有效水平或斜線壓力、右側方向和同向量能，才做 T123 品質分級，突破階段另列。已明顯上下貫穿的線失效，下跌放量和弱反彈不得進入多頭榜。</p><p>舊快照只保留真實 OHLCV，分級重算。各級最多 10 檔，不補滿名額。資料日行情非即時；相似度不代表勝率。未畫圖顯示符合 OX 經典的雷達候選，手繪與型態搜尋沿用同一條件。</p>';
const cache = new Map();
export function dataDate() { return bundleState().date || savedResearch()?.date || null; }
export function radarCandidates() {
  const rows = createTWMarketState()?.data?.radar || [];
  return [1, 2, 3].flatMap(tier => rows.filter(row => row.tier === 'T' + tier).sort((a, b) => (b.oxScore || 0) - (a.oxScore || 0)).slice(0, 10).map((row, rank) => ({ symbol: row.symbol, tier, rank })));
}
export async function fetchUniverse(signal, limit = 0) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  // Background preload supplies the same snapshot consumed by Home and sectors.
  await preloadBundle().catch(()=>{});
  const prepared=bundleState();
  const snapshot = prepared.stocks.length?{stocks:prepared.stocks,date:prepared.date}:(await loadResearch()).data||savedResearch();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const eligible = selectUniverse(snapshot?.stocks || [], 0), symbols = new Set(radarCandidates().map(row => row.symbol));
  const selected = selectUniverse(eligible, limit);
  const tickers = [...eligible.filter(row => symbols.has(row.symbol)), ...selected.filter(row => !symbols.has(row.symbol))];
  if (!tickers.length || !snapshot?.date) throw Error('官方台股觀察池尚未取得，請稍後重新掃描');
  return { tickers, allTickers: eligible, dataDate: snapshot.date, serverTime: Date.now() };
}
export function primeCandleCache(data) {
  if ((TIMEFRAMES[data?.frame] || data?.frame==='1Q') && data.candles?.length >= 1) cache.set(data.symbol + ':' + data.frame, data);
}
export async function fetchSeries(symbol, frame, signal, asOf = dataDate(), {minimum=35}={}) {
  if ((!TIMEFRAMES[frame] && frame!=='1Q') || !asOf) throw Error('台股時間級別或資料日期尚未取得');
  const indexed=bundleEntry(symbol,frame,asOf);if(indexed)return {...indexed.data,classic:indexed.classic,oxScore:indexed.classic.long.eligible?indexed.classic.long.qualityScore:null,preclassified:indexed.matches};
  if(minimum===1){const base=bundleEntry(symbol,'1D',asOf);if(base){const candles=aggregateChartCandles(base.data.candles,frame,asOf);if(candles.length)return {...base.data,frame,candles};}}
  const key = symbol + ':' + frame, cached = cache.get(key);
  if (cached?.dataDate === asOf && cached.candles.length>=minimum) return cached;
  const payload = await twProvider.getCandles(symbol, { interval: '1D', range: ['1M','1Q'].includes(frame) ? '3Y' : frame==='1D'?'3M':'2Y', to: asOf, adjusted: false, signal, timeoutMs: 45000 });
  const daily = dailyCandles(payload?.candles || [], asOf);
  if (daily.at(-1)?.date !== asOf) throw Error(`${symbol} 官方日線缺少資料日，已跳過`);
  const candles = aggregateChartCandles(daily,frame,asOf).slice(-200);
  if (candles.length < minimum) throw Error(`${symbol} ${frame} 官方 K 線不足`);
  const quote = savedResearch()?.stocks?.find(row => row.symbol === symbol);
  const radar = createTWMarketState()?.data?.radar?.find(row => row.symbol === symbol);
  const value = { classic:classifyTWSeries(candles,frame), candles, symbol, name: quote?.name || payload.name, market: 'tw', frame, dataDate: asOf, source: 'TWSE／TPEx', serverTime: Date.now(), turnover: quote?.turnoverTwd ?? null, change: quote?.changePct ?? null, oxScore: radar?.oxScore ?? null };
  primeCandleCache(value); return value;
}
export async function scanUniverse(universe, frames, { signal, onSeries, onProgress }) {
  let done=0,failed=0,coinsDone=0;const total=universe.tickers.length*frames.length,coinsTotal=universe.tickers.length;
  await preloadBundle().catch(()=>{});
  const unavailable=new Set(bundleState().unavailable.map(row=>row.symbol));
  for(const ticker of universe.tickers){
    for(const frame of frames){
      if(signal.aborted)throw new DOMException('Aborted','AbortError');
      try{
        // Every indexed daily symbol is read directly. Explicit unavailable rows
        // are counted rather than silently dropped or individually re-fetched.
        if(!bundleEntry(ticker.symbol,frame,universe.dataDate))throw Error(unavailable.has(ticker.symbol)?'歷史不足':'分類資料下載中');
        const data=await fetchSeries(ticker.symbol,frame,signal,universe.dataDate);await onSeries({...data,ticker});
      }catch(error){if(signal.aborted)throw error;failed++;}
      done++;
    }
    coinsDone++;if(coinsDone%25===0||coinsDone===coinsTotal){onProgress({done,total,failed,coinsDone,coinsTotal});await new Promise(resolve=>setTimeout(resolve,0));}
  }
}
export { preloadBundle as preloadPatterns };
