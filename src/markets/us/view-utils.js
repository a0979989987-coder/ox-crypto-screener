export const e = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const price = (n) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
export const pct = (n) =>
  n === null || n === undefined ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
export const tone = (n) => (n >= 0 ? "us2-up" : "us2-down");
// Private validation never marks public redistribution rights as confirmed.
export const nativeAllowed = cap => cap.externalDisplayConfirmed !== false || cap.legacy ||
  (cap.dataScope === 'device' && cap.localDataAvailable === true) ||
  (cap.privateValidation === true && typeof location !== 'undefined' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname));
export const sourceInfo = source => ({
  'binance-equity': {label:'幣安股票永續合約 · USDT',url:'https://www.binance.com/en/futures'},
  'device-eod': { label: '本機盤後資料 · 個人使用', url: null },
  'finance-query-eod': { label: 'Finance Query / Yahoo · 盤後', url: 'https://verdenroz.github.io/finance-query/' },
  'finance-query-eod-private': { label: 'Finance Query / Yahoo · 私人盤後驗證', url: 'https://verdenroz.github.io/finance-query/' },
  'twelve-data': { label: 'Twelve Data', url: 'https://twelvedata.com/' },
  'finmind-private-eod': { label: 'FinMind · 私人日線驗證', url: 'https://finmind.github.io/' },
  'finance-query': { label: 'Finance Query / Yahoo', url: 'https://verdenroz.github.io/finance-query/' },
  'finance-query-private': { label: 'Finance Query / Yahoo · 私人驗證', url: 'https://verdenroz.github.io/finance-query/' },
  'tradingview-widget': { label: 'TradingView', url: 'https://www.tradingview.com/' },
}[source] || { label: source || '來源未確認', url: null });
export const compact = (n) =>
  n === null || n === undefined
    ? "—"
    : Intl.NumberFormat("zh-TW", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(n);
export const fmt = (t) =>
  t
    ? new Intl.DateTimeFormat("zh-TW", {
        timeZone: "Asia/Taipei",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(t))
    : "時間未提供";
export const read = (key, d) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? d;
  } catch {
    return d;
  }
};
export const save = (key, v) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
};
export const prefsKey = "ox-us-v2:preferences",
  watchKey = "ox-us-v2:watchlist";
export const toolNames = {
  patterns: "型態畫板",
  bubbles: "泡泡圖",
  heatmap: "熱力圖",
  relative: "相對強弱",
  ranking: "量價排行",
};
export const patterns = {
  all: "全部型態",
  W: "W 底",
  M: "M 頂",
  triangle: "三角收斂",
  IHS: "頭肩底",
  HS: "頭肩頂",
  horizontal: "水平關鍵位",
  trend: "趨勢線",
};
export const sectorETF = {
  XLK: "科技",
  XLF: "金融",
  XLE: "能源",
  XLV: "醫療",
  XLY: "非必需消費",
  XLP: "必需消費",
  XLI: "工業",
  XLB: "原物料",
  XLU: "公用事業",
  XLRE: "房地產",
  XLC: "通訊",
};
