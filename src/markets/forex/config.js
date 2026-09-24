export const FOREX_CURRENCIES = Object.freeze(["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"]);

export const FOREX_PAIRS = Object.freeze([
  { id: "EURUSD", base: "EUR", quote: "USD", label: "歐元／美元" },
  { id: "GBPUSD", base: "GBP", quote: "USD", label: "英鎊／美元" },
  { id: "USDJPY", base: "USD", quote: "JPY", label: "美元／日圓" },
  { id: "USDCHF", base: "USD", quote: "CHF", label: "美元／瑞郎" },
  { id: "USDCAD", base: "USD", quote: "CAD", label: "美元／加幣" },
  { id: "AUDUSD", base: "AUD", quote: "USD", label: "澳幣／美元" },
  { id: "NZDUSD", base: "NZD", quote: "USD", label: "紐幣／美元" }
]);

export const FOREX_RESERVED_PAIRS = Object.freeze([
  { id: "EURJPY", base: "EUR", quote: "JPY", label: "歐元／日圓" },
  { id: "GBPJPY", base: "GBP", quote: "JPY", label: "英鎊／日圓" },
  { id: "EURGBP", base: "EUR", quote: "GBP", label: "歐元／英鎊" },
  { id: "AUDJPY", base: "AUD", quote: "JPY", label: "澳幣／日圓" }
]);

export const FOREX_SESSION = Object.freeze({ ASIA: "ASIA", LONDON: "LONDON", NEW_YORK: "NEW_YORK", OVERLAP: "OVERLAP", LOW_LIQUIDITY: "LOW_LIQUIDITY", CLOSED: "CLOSED" });

export const FOREX_MODULE_CONFIG = Object.freeze({
  id: "forex",
  label: "外匯",
  apiBase: "https://api.frankfurter.dev/v2",
  provider: "ecb",
  defaultPair: "EURUSD",
  historyDays: 120,
  refreshMs: 30 * 60 * 1000
});
