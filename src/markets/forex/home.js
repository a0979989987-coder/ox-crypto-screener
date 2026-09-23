import { formatPercent, formatRate } from "../../core/utils.js";

function linePath(series, width = 720, height = 190) {
  const values = series.map(point => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return series.map((point, index) => {
    const x = series.length === 1 ? 0 : (index / (series.length - 1)) * width;
    const y = height - ((point.value - min) / span) * height;
    return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

export function renderForexHome(container, analysis, selectedPair) {
  const pair = analysis.pairs.find(item => item.id === selectedPair) || analysis.pairs[0];
  const positive = pair.change >= 0;
  const path = linePath(pair.series.slice(-60));
  container.innerHTML = `
    <div class="fx-hero-grid">
      <article class="fx-panel fx-chart-panel">
        <div class="fx-panel-head">
          <div><small>FOREX · DAILY REFERENCE</small><h2>${pair.id}</h2><p>${pair.label}</p></div>
          <div class="fx-quote"><strong>${formatRate(pair.current, pair.id)}</strong><span class="${positive ? "positive" : "negative"}">${formatPercent(pair.change)}</span></div>
        </div>
        <svg class="fx-line-chart ${positive ? "up" : "down"}" viewBox="0 0 720 190" preserveAspectRatio="none" role="img" aria-label="${pair.id} 近 60 個交易日走勢">
          <path class="fx-grid" d="M0 47.5H720M0 95H720M0 142.5H720"/>
          <path class="fx-area" d="${path} L720,190 L0,190 Z"/>
          <path class="fx-line" d="${path}"/>
        </svg>
        <div class="fx-chart-foot"><span>20 日低 ${formatRate(pair.low20, pair.id)}</span><span>區間位置 ${pair.position.toFixed(0)}%</span><span>20 日高 ${formatRate(pair.high20, pair.id)}</span></div>
      </article>
      <article class="fx-panel fx-session-panel">
        <small>FOREX MARKET PULSE</small><h3>${analysis.session.label}</h3>
        <div class="fx-session-state ${analysis.session.activity}">${analysis.session.id} · ${analysis.session.activity}</div>
        <div class="fx-leader"><span>最強</span><b>${analysis.strongest.code}</b><em>${analysis.strongest.score.toFixed(0)}</em></div>
        <div class="fx-leader weak"><span>最弱</span><b>${analysis.weakest.code}</b><em>${analysis.weakest.score.toFixed(0)}</em></div>
        <p>Daily ECB reference rates；活動/流動性依時段推估，不提供真實成交量或 spread。</p>
      </article>
    </div>
    <div class="fx-pulse-row">${["EURUSD", "GBPUSD", "USDJPY"].map(id => { const item = analysis.pairs.find(pair => pair.id === id); return `<div><small>${id}</small><b>${formatRate(item.price, id)}</b><em class="${item.changePct >= 0 ? "positive" : "negative"}">${formatPercent(item.changePct)}</em></div>`; }).join("")}</div>
    <div class="fx-opportunity"><small>TOP RADAR OPPORTUNITY</small><b>${analysis.radar[0].id} · ${analysis.radar[0].direction}</b><span>Score ${analysis.radar[0].score.toFixed(0)} · ${analysis.radar[0].trend} · ${analysis.radar[0].liquidity}</span></div>`;
}
