import { escape, money, pct } from './research-ui.js';
import { quadrant } from './research-data.js';
const colors = ['#ed686d', '#e2ba5e', '#b4bab9', '#43b998'];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
// Symmetric and monotonic: large outliers no longer push every other sector to zero.
export function flowScale(values) {
  const magnitudes = values.map(Math.abs).filter(value => value > 0 && Number.isFinite(value)).sort((a, b) => a - b);
  const maximum = magnitudes.at(-1) || 1;
  const typical = magnitudes[Math.floor((magnitudes.length - 1) / 4)] || maximum;
  const knee = Math.max(typical, maximum / 1000, 1);
  const denominator = Math.asinh(maximum / knee);
  return { maximum, position(value) { return Math.asinh(value / knee) / denominator; } };
}
function labelFits(box, placed) {
  return box.left >= 52 && box.right <= 428 && box.top >= 38 && box.bottom <= 448 &&
    placed.every(other => box.right + 5 < other.left || box.left > other.right + 5 || box.bottom + 5 < other.top || box.top > other.bottom + 5);
}
export function bubbleChart(sectors, mode = 'day', selected = '') {
  const points = sectors.map(s => ({ ...s, x: mode === 'momentum' ? s.flow5 : s.flow, y: mode === 'momentum' ? s.momentum : s.changePct }))
    .filter(s => Number.isFinite(s.x) && Number.isFinite(s.y));
  if (!points.length) return `<div class="twx-empty">${mode === 'momentum' ? '尚未累積完整 20 個交易日資料，請切回當日。' : '此範圍尚無完整法人資料。'}</div>`;
  const xScale = flowScale(points.map(s => s.x));
  const maxY = Math.max(...points.map(s => Math.abs(s.y)), mode === 'momentum' ? 1e8 : 1) * 1.15;
  const maxArea = Math.max(...points.map(s => s.turnoverTwd || 0), 1);
  const line = (x1, y1, x2, y2, cls = '') => `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  const plotted = points.map(s => ({ ...s,
    px: clamp(240 + xScale.position(s.x) * 180, 60, 420),
    py: clamp(244 - s.y / maxY * 186, 48, 440),
    radius: 9 + 18 * Math.sqrt(Math.max(0, s.turnoverTwd || 0) / maxArea)
  }));
  // Draw large circles first, leaving small circles tappable in crowded areas.
  const dots = [...plotted].sort((a, b) => b.radius - a.radius).map(s => {
    const color = colors[quadrant(s.x, s.y)];
    const active = s.name === selected;
    return `<g class="twx-bubble ${active ? 'chosen' : ''}" role="button" tabindex="0" data-sector="${escape(s.name)}" aria-label="${escape(s.name)}，${money(s.x)}，${mode === 'momentum' ? money(s.y) : pct(s.y)}" style="--bubble:${color}"><title>${escape(s.name)} · ${money(s.x)} · ${mode === 'momentum' ? money(s.y) : pct(s.y)}</title><circle cx="${s.px}" cy="${s.py}" r="${s.radius}"/></g>`;
  });
  // Labels never intercept taps. The complete sector list remains below the chart.
  const placed = [];
  const labels = [...plotted].sort((a, b) => Number(b.name === selected) - Number(a.name === selected) || b.radius - a.radius).flatMap(s => {
    if (placed.length >= 10 || (s.radius < 13 && s.name !== selected)) return [];
    const crowded = plotted.some(other => other !== s && Math.hypot(other.px - s.px, other.py - s.py) < s.radius + other.radius + 8);
    if (crowded && s.name !== selected) return [];
    const name = s.name.replace(/業$/, '').slice(0, 6);
    const width = Math.max(46, name.length * 12 + 8);
    const labelX = clamp(s.px, 57 + width / 2, 423 - width / 2);
    const box = { left: labelX - width / 2, right: labelX + width / 2, top: s.py - 11, bottom: s.py + 10 };
    if (!labelFits(box, placed)) return [];
    placed.push(box);
    return [`<text class="twx-bubble-label" x="${labelX}" y="${s.py + 4}" text-anchor="middle">${escape(name)}</text>`];
  }).join('');
  const maxBillions = Math.ceil(xScale.maximum / 1e8);
  return `<svg class="twx-bubbles" viewBox="0 0 480 494" role="group" aria-label="產業資金泡泡圖；水平軸為對稱壓縮刻度，點選泡泡查看產業"><defs><radialGradient id="twx-chart-light"><stop stop-color="#ffffff" stop-opacity=".045"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs><rect x="22" y="15" width="436" height="451" fill="url(#twx-chart-light)"/><g class="twx-chart-grid">${[-1, -.5, .5, 1].map(n => line(58, 244 - n * 186, 422, 244 - n * 186)).join('')}${line(240, 30, 240, 458, 'axis')}${line(50, 244, 434, 244, 'axis')}</g><g class="twx-axis-label"><text x="14" y="35">${mode === 'momentum' ? '動能（億／日）' : '漲跌幅（%）'}</text><text x="240" y="485" text-anchor="middle">← 淨賣超　估算金額（億）· 壓縮刻度　淨買超 →</text><text x="58" y="461">-${maxBillions}</text><text x="244" y="461">0</text><text x="422" y="461" text-anchor="end">+${maxBillions}</text>${[-1, -.5, .5, 1].map(n => `<text x="8" y="${248 - n * 186}">${(n * maxY / (mode === 'momentum' ? 1e8 : 1)).toFixed(1)}</text>`).join('')}</g>${dots.join('')}<g class="twx-bubble-labels" aria-hidden="true">${labels}</g></svg>`;
}
