import { clamp } from "../../core/utils.js";

export function calculateCurrencyStrength(pairs, currencies) {
  const buckets = new Map(currencies.map(code => [code, []]));
  pairs.forEach(pair => { buckets.get(pair.baseCurrency)?.push(pair.changePct); buckets.get(pair.quoteCurrency)?.push(-pair.changePct); });
  return currencies.map(code => {
    const values = buckets.get(code) || [], momentum = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    return { code, momentum, inputs: values.length, score: clamp(50 + momentum * 30) };
  }).sort((a, b) => b.score - a.score);
}

export function renderForexStrength(container, analysis) {
  container.innerHTML = `<article class="fx-panel"><div class="fx-section-head"><div><small>CURRENCY STRENGTH</small><h3>八大貨幣強弱</h3></div><span>獨立 FX 相對動能 · 0 弱 / 50 中性 / 100 強</span></div><div class="fx-strength-list">${analysis.strengths.map(item => `<div class="fx-strength-row"><b>${item.code}</b><div class="fx-strength-track"><i style="width:${item.score.toFixed(1)}%"></i></div><strong>${item.score.toFixed(0)}</strong></div>`).join("")}</div></article>`;
}
