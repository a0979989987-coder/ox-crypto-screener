// Official display widgets are a separate capability from a raw OHLCV API.
// Never treat permission to embed a widget as permission to extract its data.
import { EOD_INTERVALS } from './eod.js';
export const FREE_US_DISPLAY = Object.freeze({
  source: "tradingview-widget",
  chartMode: "widget",
  widgetDisplayAvailable: true,
  externalDisplayConfirmed: false,
  rawDataAvailable: false,
  feed: "TradingView 官方圖表；來源與延遲依圖表標示",
  delaySeconds: null,
  volumeScope: "依圖表內資料來源；不保證全市場成交量",
  extendedHours: false,
  update: "TradingView 官方圖表自行更新",
  pollMs: 0,
  depth: false,
  trades: false,
});

// Display capability is independent of the server's raw-data entitlement.
// Keep confirmed/native and private EOD validation paths intact.
export function usDisplayCapabilities(cap) {
  if (cap.publicMarketData === true || cap.externalDisplayConfirmed === true || cap.privateValidation === true ||
    (cap.dataScope === 'device' && cap.localDataAvailable === true)) return { ...cap };
  return { ...cap, chartMode: 'widget', widgetDisplayAvailable: true,
    displaySource: FREE_US_DISPLAY.source, intervals: EOD_INTERVALS };
}

export function widgetSymbol(symbol, asset = {}) {
  if (!/^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(symbol)) return null;
  // Pin US exchanges so TSM cannot resolve to Taiwan or a tokenized stock.
  const known = { SPY: "AMEX", IWM: "AMEX", QQQ: "NASDAQ", TSM: "NYSE" };
  const mic = asset.mic || "";
  const exchange = known[symbol] || (/^XN(AS|GS|MS|CM)$/.test(mic) || asset.exchange === "NASDAQ"
    ? "NASDAQ" : mic === "XASE" || mic === "ARCX" ? "AMEX"
      : mic === "BATS" || asset.exchange === "CBOE" ? "CBOE"
        : mic === "XNYS" || asset.exchange === "NYSE" ? "NYSE" : null);
  return exchange ? `${exchange}:${symbol}` : null;
}

export const WIDGET_INTERVALS = Object.freeze({
  "1m": "1", "5m": "5", "15m": "15", "30m": "30",
  "1H": "60", "4H": "240", "1D": "D", "1W": "W", "1M": "M",
});

export function chartWidgetSettings(symbol, interval, asset, {tools = false} = {}) {
  const qualified = widgetSymbol(symbol, asset);
  if (!qualified || !WIDGET_INTERVALS[interval]) return null;
  return {
    autosize: true, symbol: qualified, interval: WIDGET_INTERVALS[interval],
    timezone: "Asia/Taipei", theme: "dark", style: "1", locale: "zh_TW",
    // The OX toolbar owns the normal view. Provider analysis tools are opt-in;
    // never crop/mask the iframe or its required branding.
    allow_symbol_change: false, hide_side_toolbar: !tools, hide_top_toolbar: !tools,
    hide_legend: false, hide_volume: false,
    backgroundColor: "rgba(17, 20, 23, 1)", gridColor: "rgba(255, 255, 255, 0.04)",
    withdateranges: false, details: false, hotlist: false,
    save_image: false, calendar: false, support_host: "https://www.tradingview.com",
    // Embed versions may ignore candle preferences; retain the provider's
    // rendering and never mask/filter the frame to simulate custom candles.
    overrides: {
      "mainSeriesProperties.candleStyle.upColor": "#5ca5ff",
      "mainSeriesProperties.candleStyle.downColor": "#ff3078",
      "mainSeriesProperties.candleStyle.borderUpColor": "#5ca5ff",
      "mainSeriesProperties.candleStyle.borderDownColor": "#ff3078",
      "mainSeriesProperties.candleStyle.wickUpColor": "#5ca5ff",
      "mainSeriesProperties.candleStyle.wickDownColor": "#ff3078",
    },
    utm_source: typeof location === "undefined" ? "ox" : location.hostname,
    utm_medium: "widget", utm_campaign: "advanced-chart",
  };
}
