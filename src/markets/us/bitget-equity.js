// Bitget's public RWA futures feed. These are USDT contracts, not US exchange prints.
export const BITGET_SOURCE = 'bitget-equity';
export const BITGET_INTERVALS = Object.freeze({
  '1m':'1m','3m':'3m','5m':'5m','15m':'15m','30m':'30m',
  '1H':'1H','4H':'4H','1D':'1Dutc','1W':'1Wutc','1M':'1Mutc',
});
export const BITGET_CAPABILITIES = Object.freeze({
  source:BITGET_SOURCE, mode:'perpetual', chartMode:'native', exchange:'Bitget',
  intervals:Object.keys(BITGET_INTERVALS), extendedHours:false, pollMs:15000,
  feed:'Bitget 股票永續合約 · USDT', volumeScope:'Bitget 合約成交量；非美股成交股數',
  update:'WebSocket 推送；斷線時定時更新', currency:'USDT', session:'24/7', timezone:'UTC',
  delaySeconds:null, depth:false, trades:false, publicMarketData:true,
  externalDisplayConfirmed:null, rawDataAvailable:true, stream:BITGET_SOURCE,
});
const number = value => value === null || value === undefined || value === '' ? NaN : Number(value);
export function bitgetDirectory(contracts, known) {
  const names=new Map(known.map(row=>[row.symbol,row])),seen=new Set();
  return (Array.isArray(contracts)?contracts:[]).flatMap(contract=>{
    // STOCK is Bitget's collision suffix (e.g. STXSTOCK vs the crypto STX).
    // RWA metadata plus an exact listing match prevents ticker-only guesses.
    const symbol=String(contract.baseCoin||'').replace(/STOCK$/,''),item=names.get(symbol);
    if(!item||seen.has(symbol)||contract.isRwa!=='YES'||contract.symbolStatus!=='normal'||
      contract.quoteCoin!=='USDT'||contract.symbolType!=='perpetual'||
      contract.symbol!==contract.baseCoin+'USDT'||!/^[A-Z0-9]+USDT$/.test(contract.symbol))return [];
    seen.add(symbol);
    return [{...item,contractSymbol:contract.symbol,source:BITGET_SOURCE,
      instrument:'equity-perpetual',currency:'USDT',underlyingExchange:item.exchange,
      exchange:'Bitget',onboardDate:Number(contract.openTime)||null}];
  });
}
export function bitgetBarEnd(start,interval) {
  if(interval==='1M'){const d=new Date(start);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)-1;}
  const duration={'1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,
    '1H':3600000,'4H':14400000,'1D':86400000,'1W':604800000}[interval];
  if(!duration)throw Error('不支援的 Bitget 時間級別。');
  return start+duration-1;
}
export function bitgetBars(rows,interval,now=Date.now()) {
  if(!Array.isArray(rows))throw Error('Bitget K 線格式無效。');
  const bars=new Map();
  for(const row of rows){
    if(!Array.isArray(row)||row.length<7)throw Error('Bitget K 線欄位不完整。');
    const [start,open,high,low,close,volume,quoteVolume]=row.slice(0,7).map(number);
    if(![start,open,high,low,close,volume,quoteVolume].every(Number.isFinite)||
      start<0||start>now+60000||Math.min(open,high,low,close)<=0||
      high<Math.max(open,close,low)||low>Math.min(open,close,high)||volume<0||quoteVolume<0)
      throw Error('Bitget OHLCV 數值無效。');
    const closeTime=bitgetBarEnd(start,interval);
    bars.set(start,{time:start/1000,open,high,low,close,volume,quoteVolume,closeTime,
      closed:closeTime<now,date:new Date(start).toISOString().slice(0,10),source:BITGET_SOURCE});
  }
  return [...bars.values()].sort((a,b)=>a.time-b.time);
}
export function bitgetQuote(raw,item,now=Date.now()) {
  if(!raw||(raw.symbol||raw.instId)!==item.contractSymbol)return null;
  const price=number(raw.lastPr),open=number(raw.open24h),high=number(raw.high24h),low=number(raw.low24h),
    volume=number(raw.baseVolume),quoteVolume=number(raw.quoteVolume),timestamp=number(raw.ts);
  if(![price,open,high,low,volume,quoteVolume,timestamp].every(Number.isFinite)||
    Math.min(price,open,low)<=0||high<Math.max(price,open,low)||low>Math.min(price,open)||
    volume<0||quoteVolume<0||timestamp<=0||timestamp>now+60000)return null;
  return {symbol:item.symbol,contractSymbol:item.contractSymbol,source:BITGET_SOURCE,mode:'perpetual',
    price,open,high,low,change:price-open,changePct:(price/open-1)*100,volume,quoteVolume,
    marketTime:timestamp/1000,receivedAt:now,asOf:new Date(timestamp).toISOString(),
    session:'24/7',currency:'USDT',changeBasis:'滾動24小時',feed:BITGET_CAPABILITIES.feed,
    volumeScope:BITGET_CAPABILITIES.volumeScope,delaySeconds:null,stale:now-timestamp>60000};
}
