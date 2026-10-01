// Public chart navigation is not a raw market-data integration or an embed.
// TWSE symbols are restricted to TradingView itself in the display widget.
export const INTRADAY_INTERVALS=Object.freeze({'1m':'1','5m':'5','15m':'15','30m':'30','1H':'60','4H':'240'});
export function externalIntradayChart(symbol,frame,market){
 if(!/^\d{4}$/.test(symbol)||!INTRADAY_INTERVALS[frame]||!['TWSE','TPEX'].includes(market))return null;
 const url=new URL('https://www.tradingview.com/chart/');
 url.searchParams.set('symbol',`${market}:${symbol}`);
 url.searchParams.set('interval',INTRADAY_INTERVALS[frame]);
 return url.href;
}
