import { FOREX_CURRENCIES, FOREX_PAIRS, FOREX_RESERVED_PAIRS } from "./config.js";
import { clamp, finiteNumber } from "../../core/utils.js";
import { getForexSession } from "./session.js";
import { calculateCurrencyStrength } from "./strength.js";
import { buildForexRadar } from "./radar.js";

const rate = (pair, usdRates) => {
  const basePerUsd = pair.base === "USD" ? 1 : finiteNumber(usdRates[pair.base], NaN);
  const quotePerUsd = pair.quote === "USD" ? 1 : finiteNumber(usdRates[pair.quote], NaN);
  return !Number.isFinite(basePerUsd) || !Number.isFinite(quotePerUsd) || !basePerUsd ? NaN : quotePerUsd / basePerUsd;
};
const change = (current, previous) => !Number.isFinite(current) || !Number.isFinite(previous) || !previous ? 0 : ((current - previous) / previous) * 100;

function modelPair(definition, history, session) {
  const series = history.dates.map(date => ({ date, value: rate(definition, history.rates[date] || {}) })).filter(point => Number.isFinite(point.value) && point.value > 0);
  if (series.length < 2) throw new Error(`${definition.id} 缺少足夠的每日參考匯率`);
  const price = series.at(-1)?.value ?? 0, previous = series.at(-2)?.value ?? price, recent = series.slice(-20).map(point => point.value);
  const high = Math.max(...recent), low = Math.min(...recent), momentum = change(price, series.at(-6)?.value ?? previous);
  const changePct = change(price, previous), position = high === low ? 50 : ((price - low) / (high - low)) * 100;
  const trend = momentum > .08 ? "UP" : momentum < -.08 ? "DOWN" : "RANGE";
  const recentReturns = series.slice(-15).map((point, index, subset) => index ? Math.abs(change(point.value, subset[index - 1].value)) : null).filter(Number.isFinite);
  const averageDailyMovePct = recentReturns.length ? recentReturns.reduce((sum, value) => sum + value, 0) / recentReturns.length : null;
  return { symbol: definition.id, id: definition.id, baseCurrency: definition.base, quoteCurrency: definition.quote, base: definition.base, quote: definition.quote, label: definition.label, price, current: price, changePct, change: changePct, high, high20: high, low, low20: low, volume: null, activityProxy: session.activity, spread: null, session: session.id, timestamp: history.updatedAt, candles: series.map((point, index) => ({ time: point.date, open: series[index - 1]?.value ?? point.value, high: Math.max(series[index - 1]?.value ?? point.value, point.value), low: Math.min(series[index - 1]?.value ?? point.value, point.value), close: point.value })), series, momentum, trend, position: clamp(position), averageDailyMovePct };
}

export function analyzeForexHistory(history, { now = new Date() } = {}) {
  const session = getForexSession(now);
  const pairs = FOREX_PAIRS.map(definition => modelPair(definition, history, session));
  const radarPairs = [...pairs, ...FOREX_RESERVED_PAIRS.map(definition => modelPair(definition, history, session))];
  const strengths = calculateCurrencyStrength(pairs, FOREX_CURRENCIES);
  return { ...history, session, pairs, strengths, strongest: strengths[0], weakest: strengths.at(-1), radar: buildForexRadar(radarPairs, strengths, session) };
}
