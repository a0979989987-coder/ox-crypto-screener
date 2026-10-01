import { EOD_CAPABILITIES, EOD_INTERVALS, completedSession, eodSeries, closingQuote } from './eod.js';
import { nyEpoch, tradingDay } from './calendar.js';
import { analyzeStock } from './analysis.js?v=20261002-rank5';

const invalid = message => { throw Error(message); };
const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;

// Recompute prices and signals from validated OHLCV. Imported analyses are ignored.
export async function buildDeviceDataset(packet, { now = Date.now(), progress = () => {} } = {}) {
  if (packet?.format !== 'ox-us-device-eod' || packet.version !== 1 || packet.mode !== 'eod') invalid('請選擇 OX 美股盤後資料檔。');
  const { sessionDate, histories, directory } = packet;
  if (!validDate(sessionDate) || !tradingDay(sessionDate).open || sessionDate > completedSession(now)) invalid('資料交易日尚未收盤或不在已知交易日曆內。');
  const collectedAt = Date.parse(packet.collectedAt);
  const end = nyEpoch(sessionDate, tradingDay(sessionDate).closeMinute) * 1000 + 3600000;
  if (!Number.isFinite(collectedAt) || collectedAt < end || collectedAt > now + 60000) invalid('資料取得時間無效，不能將未收盤資料當作盤後資料。');
  if (!histories || Array.isArray(histories) || typeof histories !== 'object' || !Array.isArray(directory)) invalid('盤後檔缺少股票名稱或 OHLCV 歷史。');
  const symbols = Object.keys(histories);
  if (!symbols.length || symbols.length > 1000 || directory.length > 20000) invalid('資料檔股票數超出支援範圍。');
  const lookup = new Map(directory.filter(item => item && /^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(item.symbol) &&
    typeof item.name === 'string' && item.name.length <= 300 && ['stock', 'ADR', 'ETF'].includes(item.type))
    .map(item => [item.symbol, { symbol:item.symbol, name:item.name, alias:String(item.alias || '').slice(0, 100),
      type:item.type, complex:item.complex === true, exchange:String(item.exchange || '').slice(0, 40), mic:String(item.mic || '').slice(0, 12) }]));
  const normalized = {}, quotes = [], analyses = [], series = new Map(), times = new Map();
  for (const [index, symbol] of symbols.entries()) {
    if (!lookup.has(symbol)) invalid(`缺少 ${symbol} 的有效股票名稱。`);
    const input = histories[symbol];
    if (!Array.isArray(input) || input.length < 60 || input.length > 5000) invalid(`${symbol} 的日線筆數無效。`);
    let previous = '';
    normalized[symbol] = input.map(bar => {
      if (!bar || !validDate(bar.date) || !tradingDay(bar.date).open || bar.date <= previous || bar.date > sessionDate)
        invalid(`${symbol} 含重複、未收盤或無效交易日。`);
      previous = bar.date;
      const prices = [bar.open, bar.high, bar.low, bar.close];
      if (prices.some(value => typeof value !== 'number' || !Number.isFinite(value) || value <= 0) ||
        bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close, bar.high) ||
        !(bar.volume === null || (typeof bar.volume === 'number' && Number.isFinite(bar.volume) && bar.volume >= 0)))
        invalid(`${symbol} 含無效價格或成交量。`);
      if (!times.has(bar.date)) times.set(bar.date, nyEpoch(bar.date));
      return { date:bar.date, time:times.get(bar.date), open:bar.open, high:bar.high, low:bar.low, close:bar.close, volume:bar.volume };
    });
    if (previous !== sessionDate) invalid(`${symbol} 的最後日線與資料交易日不一致。`);
    series.set(symbol, Object.fromEntries(EOD_INTERVALS.map(interval => [interval, eodSeries(normalized[symbol], interval, collectedAt)])));
    quotes.push({ ...closingQuote(symbol, normalized[symbol], collectedAt, 'device-eod'), feed:String(packet.provider || '使用者匯入 OHLCV').slice(0, 160) });
    if (index % 8 === 0) { progress(Math.round((index + 1) / symbols.length * 70)); await new Promise(resolve => setTimeout(resolve, 0)); }
  }
  if (!series.has('SPY')) invalid('盤後檔需包含 SPY，才能計算相對強弱。');
  for (const [index, symbol] of symbols.entries()) {
    for (const interval of EOD_INTERVALS) {
      const row = analyzeStock(lookup.get(symbol), series.get(symbol)[interval], series.get('SPY')[interval], interval, collectedAt);
      if (row) analyses.push({ ...row, barCount:row.bars, bars:series.get(symbol)[interval].slice(-80), mode:'eod' });
    }
    if (index % 8 === 0) { progress(70 + Math.round((index + 1) / symbols.length * 30)); await new Promise(resolve => setTimeout(resolve, 0)); }
  }
  const snapshot = { schemaVersion:2, mode:'eod', source:'device-eod', dataScope:'device', sessionDate,
    asOf:packet.collectedAt, createdAt:packet.collectedAt, quotes, analyses,
    analysisIntervals:EOD_INTERVALS.filter(interval => analyses.some(row => row.interval === interval)),
    analysisAvailability:Object.fromEntries(EOD_INTERVALS.map(interval => [interval, { count:analyses.filter(row => row.interval === interval).length, minimumBars:60 }])),
    counts:{ searchable:lookup.size, quoted:quotes.length, scanned:new Set(analyses.map(row => row.symbol)).size } };
  return { packet:{ ...packet, directory:[...lookup.values()], histories:normalized }, snapshot, series,
    capabilities:{ ...EOD_CAPABILITIES, source:'device-eod', dataScope:'device', localDataAvailable:true,
      rawDataAvailable:true, externalDisplayConfirmed:false, sessionDate,
      feed:String(packet.provider || '使用者匯入 OHLCV').slice(0, 160), update:'本機盤後檔；匯入新檔更新' } };
}

export function deviceCandles(dataset, symbol, { interval = '1D', extendedHours = false, limit = 400, to } = {}) {
  if (!EOD_INTERVALS.includes(interval) || extendedHours) invalid('本機盤後模式只提供日／週／月 K 線。');
  let bars = dataset.series.get(symbol)?.[interval];
  if (!bars?.length) invalid(`${symbol} 不在這份本機盤後資料內，或尚無完整 K 線。`);
  if (to) {
    if (!validDate(to.slice(0, 10))) invalid('無效歷史日期。');
    bars = bars.filter(bar => bar.date < to.slice(0, 10));
  }
  const count = Math.max(1, Math.min(5000, Number(limit) || 400));
  return { symbol, interval, bars:bars.slice(-count), source:'device-eod', dataScope:'device', mode:'eod',
    asOf:dataset.snapshot.sessionDate, receivedAt:Date.parse(dataset.snapshot.createdAt), adjustment:'unknown', session:'regular',
    feed:dataset.capabilities.feed, volumeScope:dataset.capabilities.volumeScope, delaySeconds:null,
    historyExhausted:bars.length <= count, capabilities:dataset.capabilities };
}
