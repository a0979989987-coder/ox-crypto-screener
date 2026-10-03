// Public Binance USD-M market-data contract. Prices/volume are derivatives,
// never consolidated US equity prices, shares, or a US closing snapshot.
export const BINANCE_SOURCE = 'binance-equity';
export const BINANCE_INTERVALS = Object.freeze({
  '1m':'1m', '3m':'3m', '5m':'5m', '15m':'15m', '30m':'30m',
  '1H':'1h', '4H':'4h', '1D':'1d', '1W':'1w', '1M':'1M',
});
export const BINANCE_CAPABILITIES = Object.freeze({
  source:BINANCE_SOURCE, mode:'perpetual', chartMode:'native',
  intervals:Object.keys(BINANCE_INTERVALS), extendedHours:false, pollMs:15000,
  feed:'幣安股票永續合約 · USDT', volumeScope:'幣安合約成交量；非美股成交股數',
  update:'WebSocket 推送；斷線時定時更新', delaySeconds:null,
  currency:'USDT', session:'24/7', timezone:'UTC', depth:false, trades:false,
  externalDisplayConfirmed:false, rawDataAvailable:false,
});
const number = value => value === null || value === undefined || value === '' ? NaN : Number(value);
export function equityDirectory(exchangeInfo, directory) {
  const known = new Map(directory.map(row => [row.symbol, row]));
  const seen = new Set();
  return (exchangeInfo?.symbols || []).flatMap(contract => {
    const item = known.get(contract.baseAsset);
    // Exact exchange metadata AND known US listing are required. A matching
    // name alone would accidentally admit crypto tickers (e.g. AMZN, COIN).
    if (!item || seen.has(item.symbol) || contract.status !== 'TRADING' ||
      contract.underlyingType !== 'EQUITY' || contract.quoteAsset !== 'USDT' ||
      !['PERPETUAL','TRADIFI_PERPETUAL'].includes(contract.contractType) ||
      !/^[A-Z0-9]+USDT$/.test(contract.symbol) ||
      (contract.underlyingSubType || []).some(tag => /pre.?ipo/i.test(tag))) return [];
    seen.add(item.symbol);
    return [{...item, contractSymbol:contract.symbol, source:BINANCE_SOURCE,
      instrument:'equity-perpetual', currency:'USDT', underlyingExchange:item.exchange,
      exchange:'Binance', onboardDate:contract.onboardDate}];
  });
}
export function binanceBars(rows, now = Date.now()) {
  if (!Array.isArray(rows)) throw Error('幣安 K 線格式無效。');
  const bars = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 8) throw Error('幣安 K 線欄位不完整。');
    const [start,open,high,low,close,volume,end,quoteVolume] = row.slice(0,8).map(number);
    if (![start,open,high,low,close,volume,end,quoteVolume].every(Number.isFinite) ||
      start < 0 || start > now + 60000 || end < start ||
      Math.min(open,high,low,close) <= 0 || high < Math.max(open,close,low) ||
      low > Math.min(open,close,high) || volume < 0 || quoteVolume < 0)
      throw Error('幣安 OHLCV 數值無效。');
    bars.set(start, {time:start/1000,open,high,low,close,volume,quoteVolume,
      closeTime:end,closed:end < now,date:new Date(start).toISOString().slice(0,10),source:BINANCE_SOURCE});
  }
  return [...bars.values()].sort((a,b) => a.time-b.time);
}
export function binanceQuote(raw, item, now = Date.now()) {
  if (!raw || raw.symbol !== item.contractSymbol) return null;
  const price=number(raw.lastPrice ?? raw.c), open=number(raw.openPrice ?? raw.o),
    high=number(raw.highPrice ?? raw.h), low=number(raw.lowPrice ?? raw.l),
    volume=number(raw.volume ?? raw.v), quoteVolume=number(raw.quoteVolume ?? raw.q),
    timestamp=number(raw.closeTime ?? raw.E);
  if (![price,open,high,low,volume,quoteVolume,timestamp].every(Number.isFinite) ||
    Math.min(price,open,low)<=0 || high<Math.max(price,open,low) || low>Math.min(price,open) ||
    volume<0 || quoteVolume<0 || timestamp<=0 || timestamp>now+60000) return null;
  return {symbol:item.symbol,contractSymbol:item.contractSymbol,source:BINANCE_SOURCE,mode:'perpetual',
    price,change:price-open,changePct:(price/open-1)*100,open,
    high,low,
    volume,quoteVolume,marketTime:timestamp/1000,receivedAt:now,asOf:new Date(timestamp).toISOString(),
    marketOpen:true,session:'24/7',currency:'USDT',changeBasis:'滾動24小時',
    feed:BINANCE_CAPABILITIES.feed,volumeScope:BINANCE_CAPABILITIES.volumeScope,delaySeconds:null};
}
export function perpetualCountdown(bar, now = Date.now()) {
  if (!Number.isFinite(bar?.closeTime)) return '待更新';
  const remaining=Math.max(0,Math.ceil((bar.closeTime+1-now)/1000));
  if (!remaining) return '待新 K 線';
  if (remaining>=86400) return `${Math.floor(remaining/86400)}天`;
  return [Math.floor(remaining/3600),Math.floor(remaining%3600/60),remaining%60]
    .map(n=>String(n).padStart(2,'0')).join(':');
}
