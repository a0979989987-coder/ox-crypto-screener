import { clamp, formatPercent, formatRate } from "../../core/utils.js";

export function buildForexRadar(pairs, strengths, session) {
  const scoreFor = code => strengths.find(item => item.code === code)?.score ?? 50;
  return pairs.map(pair => {
    const relativeStrength = scoreFor(pair.baseCurrency) - scoreFor(pair.quoteCurrency);
    const direction = relativeStrength >= 0 ? "LONG" : "SHORT";
    const score = clamp(50 + Math.abs(relativeStrength) * .8 + Math.min(20, Math.abs(pair.momentum) * 18) + (session.activity === "high" ? 8 : session.activity === "medium" ? 3 : 0));
    return { ...pair, direction, relativeStrength, score, liquidity: session.activity };
  }).sort((a, b) => b.score - a.score);
}

export function renderForexRadar(container, analysis, selectedPair) {
  container.innerHTML = `<article class="fx-panel"><div class="fx-section-head"><div><small>FX RADAR</small><h3>強貨幣 vs 弱貨幣</h3></div><span>${analysis.session.label} · FX 專用 Score</span></div><div class="fx-radar-grid">${analysis.radar.map(pair => `<button class="fx-pair-card ${pair.id === selectedPair ? "selected" : ""}" type="button" data-fx-pair="${pair.id}"><span><b>${pair.id}</b><small>${pair.direction} · ${pair.trend}</small></span><strong>${formatRate(pair.price, pair.id)}</strong><em class="${pair.changePct >= 0 ? "positive" : "negative"}">${formatPercent(pair.changePct)}</em><i>S ${pair.score.toFixed(0)} · RS ${pair.relativeStrength >= 0 ? "+" : ""}${pair.relativeStrength.toFixed(0)} · ${pair.liquidity}</i></button>`).join("")}</div></article>`;
}
