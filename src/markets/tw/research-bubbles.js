import { escape, money, pct } from './research-ui.js';
import { quadrant } from './research-data.js';
const colors = ['#ed686d', '#e2ba5e', '#b4bab9', '#43b998'];
/** Bounded SVG renderer: exact axes; overlap is addressed with focus/search, never false positions. */
export function bubbleChart(sectors, mode = 'day', selected = '') {
  const points = sectors.map(s => ({ ...s, x: mode === 'momentum' ? s.flow5 : s.flow, y: mode === 'momentum' ? s.momentum : s.changePct }))
    .filter(s => Number.isFinite(s.x) && Number.isFinite(s.y));
  if (!points.length) return `<div class="twx-empty">${mode === 'momentum' ? '尚未累積完整 20 個交易日資料，請切回當日。' : '此範圍尚無完整法人資料。'}</div>`;
  const maxX = Math.max(...points.map(s => Math.abs(s.x)), 1e8) * 1.2;
  const maxY = Math.max(...points.map(s => Math.abs(s.y)), mode === 'momentum' ? 1e8 : 1) * 1.2;
  const maxArea = Math.max(...points.map(s => s.turnoverTwd), 1);
  const line = (x1, y1, x2, y2, cls = '') => `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  const dots = points.sort((a, b) => b.turnoverTwd - a.turnoverTwd).map(s => {
    const x = 240 + s.x / maxX * 182, y = 244 - s.y / maxY * 188;
    const radius = 10 + 29 * Math.sqrt(Math.max(0, s.turnoverTwd) / maxArea);
    const color = colors[quadrant(s.x, s.y)];
    const active = s.name === selected;
    return `<g class="twx-bubble ${active ? 'chosen' : ''}" role="button" tabindex="0" data-sector="${escape(s.name)}" aria-label="${escape(s.name)}，${money(s.x)}，${mode === 'momentum' ? money(s.y) : pct(s.y)}" style="--bubble:${color}"><title>${escape(s.name)} · ${money(s.x)} · ${mode === 'momentum' ? money(s.y) : pct(s.y)}</title><circle cx="${x}" cy="${y}" r="${radius}"/><text x="${x}" y="${y - 2}" text-anchor="middle">${escape(s.name.replace(/業$/, '').slice(0, 5))}</text><text class="twx-bubble-value" x="${x}" y="${y + 13}" text-anchor="middle">${money(s.x).replace(' 億', '')}</text></g>`;
  });
  return `<svg class="twx-bubbles" viewBox="0 0 480 494" role="group" aria-label="產業資金泡泡圖"><defs><radialGradient id="twx-chart-light"><stop stop-color="#ffffff" stop-opacity=".045"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs><rect x="22" y="15" width="436" height="451" fill="url(#twx-chart-light)"/><g class="twx-chart-grid">${[-1, -.5, .5, 1].map(n => line(58, 244 - n * 188, 422, 244 - n * 188)).join('')}${line(240, 30, 240, 458, 'axis')}${line(50, 244, 434, 244, 'axis')}</g><g class="twx-axis-label"><text x="14" y="35">${mode === 'momentum' ? '動能（億／日）' : '漲跌幅（%）'}</text><text x="240" y="485" text-anchor="middle">← 淨賣超　　估算金額（億）　　淨買超 →</text><text x="58" y="461">${(-maxX / 1e8).toFixed(0)}</text><text x="244" y="461">0</text><text x="422" y="461" text-anchor="end">+${(maxX / 1e8).toFixed(0)}</text>${[-1, -.5, .5, 1].map(n => `<text x="8" y="${248 - n * 188}">${(n * maxY / (mode === 'momentum' ? 1e8 : 1)).toFixed(1)}</text>`).join('')}</g>${dots.join('')}</svg>`;
}
