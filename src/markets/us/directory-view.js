// Reference metadata is independent of market-data entitlements. It must never
// be mistaken for an analysed candidate or a quote with an invented price.
const priority = ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMZN', 'META', 'GOOGL', 'AMD', 'TSM', 'AVGO', 'MU', 'SPY', 'QQQ', 'IWM'];
export function stockName(item = {}) {
  return [...new Set([item.alias, item.name].filter(Boolean))].join(' · ') || item.symbol || '名稱未提供';
}
export function catalogueMode(snapshot) {
  return !snapshot?.asOf && !snapshot?.analyses?.length && !snapshot?.quotes?.length;
}
export function cataloguePage(directory, {type = 'stock', watchOnly = false, watch = new Set(), symbol, offset = 0, limit = 50} = {}) {
  const positions = new Map([...new Set([symbol, ...priority].filter(Boolean))].map((s, i) => [s, i]));
  const rows = directory.filter(item => item.name &&
    (type === 'all' || (type === 'stock' ? ['stock', 'ADR'].includes(item.type) : item.type === type)) &&
    (!watchOnly || watch.has(item.symbol)));
  rows.sort((a, b) => (positions.get(a.symbol) ?? 100) - (positions.get(b.symbol) ?? 100) || a.symbol.localeCompare(b.symbol));
  const size=Math.max(1,Math.min(100,limit));
  const start=Math.min(Math.max(0,offset),Math.max(0,Math.floor((rows.length-1)/size)*size));
  return {total: rows.length, offset:start, items:rows.slice(start,start+size)};
}
