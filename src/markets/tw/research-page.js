import { savedResearch, loadResearch, selectSectors, readWatchlist, quadrant } from './research-data.js';
import { escape, number, pct, money, direction, segments, mountResearch, stockRows } from './research-ui.js';
import { bubbleChart, bubblePoints } from './research-bubbles.js';
import { closeResearchDetails, showSector, showStock, watchClick } from './research-detail.js';
const prefs = { tab: 'bubble', scope: 'all', market: 'ALL', mode: 'auto', density: 'top', zoom: 1, panX: 0, panY: 0, sort: 'buy', query: '', quadrant: null };
let session, data = savedResearch(), loading = false, error = null, lastFetch = 0;
let outlook = { day: null, up: 0, down: 0, mine: null, status: '載入多空看法中', ready: false, checkedAt: 0, pending: false };
async function loadOutlook(s) {
  if (s.view !== 'home' || outlook.pending || Date.now() - outlook.checkedAt < 60000) return;
  outlook.pending = true; outlook.checkedAt = Date.now();
  try {
    const response = await fetch('/api/v1/tw/outlook', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error === 'POLL_NOT_CONFIGURED' ? '多空投票尚未啟用' : '多空投票暫時無法連線');
    outlook = { ...result, status: result.mine ? '已記錄，可修改 · 每個瀏覽器一票' : '每個瀏覽器一票', ready: true, checkedAt: Date.now(), pending: false };
  } catch (e) { outlook.ready = false; outlook.status = e.message === '多空投票尚未啟用' ? e.message : '多空投票暫時無法連線'; outlook.pending = false; }
  if (current(s)) paint(s);
}
async function submitOutlook(s, side) {
  if (!outlook.ready || outlook.pending) return;
  outlook.pending = true; outlook.status = '送出中'; paint(s);
  try {
    const response = await fetch('/api/v1/tw/outlook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day: outlook.day, side }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error === 'TRADING_DAY_CHANGED' ? '交易日已更新，請再投一次' : '送出失敗，請稍後再試');
    outlook = { ...result, status: '已記錄，可修改 · 每個瀏覽器一票', ready: true, checkedAt: Date.now(), pending: false };
  } catch (e) { outlook.status = e.message === '交易日已更新，請再投一次' ? e.message : '送出失敗，請稍後再試'; outlook.pending = false; outlook.checkedAt = 0; }
  if (current(s)) paint(s);
}
export function stopResearch() { session?.controller.abort(); session = null; closeResearchDetails(); }
const current = s => session === s && document.body.dataset.market === 'tw' && s.root.querySelector(`[data-twx-view="${s.view}"]`);
function homeContent(state) {
  const pulse = data?.pulse || state?.data?.pulse || {};
  const stocks = data?.stocks || [];
  const sectors = selectSectors(data).filter(s => Number.isFinite(s.flow));
  const leaders = [...sectors].sort((a, b) => b.flow - a.flow);
  const up = stocks.filter(s => s.changePct > 0).length, down = stocks.filter(s => s.changePct < 0).length;
  const flat = stocks.filter(s => s.changePct === 0).length;
  const total = up + down + flat;
  const { day, up: bulls, down: bears, mine: vote, ready } = outlook;
  const votes = bulls + bears, bullPct = votes ? Math.round(bulls / votes * 100) : 0;
  const chip = s => `<button type="button" class="twx-sector-chip" data-sector="${escape(s.name)}"><span>${escape(s.name)}</span><b class="${direction(s.flow)}">${money(s.flow)}</b></button>`;
  const watches = stocks.filter(s => readWatchlist().has(s.symbol));
  return `<div class="twx-home-grid"><section class="twx-glass twx-market"><div class="twx-indices">${['TAIEX', 'TPEX', 'TX'].map((symbol, i) => { const p = pulse[symbol]; return `<div><small>${['加權指數', '櫃買指數', '台指近月'][i]}</small><strong>${number(p?.price)}</strong><span class="${direction(p?.changePct)}">${pct(p?.changePct)}</span></div>`; }).join('')}</div><div class="twx-breadth"><div><span class="up">上漲 ${total ? up : '—'}</span><span>平盤 ${total ? flat : '—'}</span><span class="down">下跌 ${total ? down : '—'}</span></div><div class="twx-breadth-track"><i style="width:${total ? up / total * 100 : 0}%"></i><i style="width:${total ? flat / total * 100 : 0}%"></i><i style="width:${total ? down / total * 100 : 0}%"></i></div></div></section><section class="twx-glass twx-outlook"><div class="twx-section-head"><span>下一交易日</span><small>${day || '—'} · 我的看法</small></div><div class="twx-votes"><button type="button" data-vote="up" aria-pressed="${vote === 'up'}" ${!ready || outlook.pending ? 'disabled' : ''}><span class="up">↗</span>看漲</button><button type="button" data-vote="down" aria-pressed="${vote === 'down'}" ${!ready || outlook.pending ? 'disabled' : ''}><span class="down">↘</span>看跌</button></div><div class="twx-energy" aria-label="多空能量：看漲 ${bulls} 票，看跌 ${bears} 票"><div class="twx-energy-label"><span class="up">看漲 ${ready ? `${bulls} · ${bullPct}%` : '—'}</span><span>多空能量 · ${ready ? `${votes} 票` : '—'}</span><span class="down">看跌 ${ready ? `${bears} · ${votes ? 100 - bullPct : 0}%` : '—'}</span></div><div class="twx-energy-track">${ready && votes ? `<i class="up" style="width:${bullPct}%"></i><i class="down" style="width:${100 - bullPct}%"></i>` : ''}</div></div><small class="twx-vote-status" role="status">${escape(outlook.status)}</small></section><section class="twx-glass"><div class="twx-section-head"><span>法人買超產業</span><button type="button" data-go="strength">查看泡泡圖 ↗</button></div><div class="twx-chip-list">${leaders.filter(s => s.flow > 0).slice(0, 5).map(chip).join('') || '<span class="twx-muted">法人資料待更新</span>'}</div></section><section class="twx-glass"><div class="twx-section-head"><span>法人賣超產業</span><small>估算金額</small></div><div class="twx-chip-list">${leaders.filter(s => s.flow < 0).reverse().slice(0, 5).map(chip).join('') || '<span class="twx-muted">法人資料待更新</span>'}</div></section><section class="twx-glass twx-home-wide"><div class="twx-section-head"><span>法人動向</span><small>估算淨買超</small></div>${stockRows([...stocks].filter(s => Number.isFinite(s.netTwd)).sort((a, b) => b.netTwd - a.netTwd), readWatchlist(), 8) || '<div class="twx-empty">官方資料載入後顯示</div>'}</section><section class="twx-glass twx-home-wide"><div class="twx-section-head"><span>自選</span><small>${watches.length} 檔</small></div>${stockRows(watches, readWatchlist(), 20) || '<div class="twx-empty">點選股票旁的星星加入自選</div>'}</section></div>`;
}
function chartMode() {
  if (prefs.mode !== 'auto') return prefs.mode;
  return selectSectors(data, prefs).some(s => Number.isFinite(s.momentum) && Number.isFinite(s.flow20)) ? 'momentum' : 'day';
}
function minChartZoom() { return prefs.quadrant !== null ? 2 : prefs.density === 'all' && prefs.scope === 'all' ? 1.5 : 1; }
function resetChart() { prefs.zoom = minChartZoom(); prefs.panX = prefs.quadrant === null ? 0 : prefs.quadrant < 2 ? -195 : 195; prefs.panY = prefs.quadrant === null ? 0 : prefs.quadrant % 2 === 0 ? 195 : -195; }
function filtered() {
  const mode = chartMode();
  return selectSectors(data, prefs).filter(s => {
    const x = mode === 'momentum' ? s.flow5 : s.flow, y = mode === 'momentum' ? s.momentum : s.changePct;
    return prefs.quadrant === null || (Number.isFinite(x) && Number.isFinite(y) && quadrant(x, y) === prefs.quadrant);
  });
}
function results() {
  const sectors = filtered(), mode = chartMode();
  if (prefs.tab === 'bubble') return bubbleChart(sectors, mode, '', { ...prefs, density: prefs.scope === 'watch' ? 'all' : prefs.density });
  const sortKey = prefs.sort === 'up' || prefs.sort === 'down' ? 'changePct' : mode === 'momentum' ? 'flow5' : 'flow';
  const sign = ['sell', 'down'].includes(prefs.sort) ? 1 : -1;
  const sorted = [...sectors].filter(s => Number.isFinite(s[sortKey])).sort((a, b) => sign * (a[sortKey] - b[sortKey]));
  return `<div class="twx-ranking">${sorted.map((s, index) => `<button type="button" class="twx-rank" data-sector="${escape(s.name)}"><span class="twx-rank-number">${index + 1}</span><span><b>${escape(s.name)}</b><small>${s.buyCount} / ${s.covered} 檔買超</small></span><span class="${direction(s.changePct)}">${pct(s.changePct)}</span><strong class="${direction(s[sortKey])}">${['up', 'down'].includes(prefs.sort) ? money(s.flow) : money(s[sortKey])}</strong></button>`).join('') || '<div class="twx-empty">沒有符合條件的產業</div>'}</div>`;
}
function chartActions() {
  return `<div class="twx-chart-actions">${prefs.scope === 'all' ? segments('density', [['top', '金額前 10'], ['all', '全部產業']], prefs.density) : '<small>自選股票所屬產業</small>'}<div class="twx-zoom" role="group" aria-label="圖表縮放"><button type="button" data-zoom="out" aria-label="縮小圖表" ${prefs.zoom <= minChartZoom() ? 'disabled' : ''}>−</button><button type="button" data-zoom="reset" aria-label="重設圖表">${Math.round(prefs.zoom * 100)}%</button><button type="button" data-zoom="in" aria-label="放大圖表" ${prefs.zoom >= 8 ? 'disabled' : ''}>＋</button></div></div><small class="twx-chart-hint">細點為實際座標 · 泡泡內為當日金額 · 放大可拖曳</small>`;
}
function indicatorContent() {
  const all = selectSectors(data, prefs), mode = chartMode();
  const valid = bubblePoints(all, mode), counts = [0, 0, 0, 0];
  for (const s of valid) counts[quadrant(s.x, s.y)]++;
  const labels = mode === 'momentum' ? ['漲潮', '輪動', '觀望', '退潮'] : ['買超上漲', '買超下跌', '賣超上漲', '賣超下跌'];
  const hints = mode === 'momentum' ? ['淨買超且力道增強', '淨買超但力道放緩', '淨賣超但賣壓減弱', '淨賣超且賣壓增強'] : ['當日淨買超且上漲', '當日淨買超且下跌', '當日淨賣超且上漲', '當日淨賣超且下跌'];
  const days = (data?.history || []).filter(h => h.sectors?.length).length;
  const caption = mode === 'momentum' ? `官方產業 · 完整 20 日資料 ${valid.length}／${all.length} 類` : `官方產業 · 當日價量（非 5／20 日動能）${days < 20 ? ` · 歷史 ${days}／20 日` : ''}`;
  return `<div class="twx-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="搜尋股票或產業" placeholder="搜尋股票或產業" value="${escape(prefs.query)}"><select aria-label="市場篩選" data-market><option value="ALL" ${prefs.market === 'ALL' ? 'selected' : ''}>上市＋上櫃</option><option value="TWSE" ${prefs.market === 'TWSE' ? 'selected' : ''}>上市</option><option value="TPEX" ${prefs.market === 'TPEX' ? 'selected' : ''}>上櫃</option></select></div><div class="twx-quadrants">${labels.map((label, i) => `<button type="button" data-quadrant="${i}" aria-label="${label}：${hints[i]}" title="${hints[i]}" aria-pressed="${prefs.quadrant === i}" class="q${i}"><small>${label}</small><strong>${data && valid.length ? counts[i] : '—'}</strong></button>`).join('')}</div><div class="twx-visual"><section class="twx-glass twx-chart-panel"><div class="twx-chart-tools">${segments('mode', [['momentum', '5／20 日資金'], ['day', '當日價量']], mode)}<button type="button" class="twx-icon" data-expand aria-label="展開圖表">⛶</button></div><small class="twx-chart-method">${caption}</small>${prefs.tab === 'rank' ? segments('sort', [['buy', '買超'], ['sell', '賣超'], ['up', '漲幅'], ['down', '跌幅']], prefs.sort) : ''}<div class="twx-chart-content">${results()}</div>${prefs.tab === 'bubble' ? chartActions() : ''}</section><div class="twx-tools">${segments('tab', [['bubble', '泡泡圖'], ['rank', '排行']], prefs.tab)}${segments('scope', [['all', '全部'], ['watch', '自選']], prefs.scope)}</div></div><div class="twx-sector-list">${all.map(s => `<button type="button" data-sector="${escape(s.name)}"><span>${escape(s.name)}</span><b class="${direction(mode === 'momentum' ? s.flow5 : s.flow)}">${mode === 'momentum' && !Number.isFinite(s.momentum) ? '歷史不足' : money(mode === 'momentum' ? s.flow5 : s.flow)}</b></button>`).join('') || '<div class="twx-empty">尚無對應產業，請先在台股雷達收藏股票。</div>'}</div>`;
}
function paint(s) {
  if (session !== s) return;
  const content = s.view === 'home' ? homeContent(s.state) : indicatorContent();
  s.root.innerHTML = `<div class="twx" data-twx-view="${s.view}">${error && !data ? '<div class="twx-empty" role="status">資料暫時無法載入，請重新整理頁面。</div>' : ''}${content}</div>`;
}
async function refresh(s, force) {
  if (loading) return;
  loading = true; error = null; paint(s);
  const result = await loadResearch({ force, onCached(snapshot) { data = snapshot; if (current(s)) paint(s); } });
  loading = false; lastFetch = Date.now(); data = result.data; error = result.error;
  if (session && current(session)) paint(session);
}
export function renderResearch(view, state) {
  const root = mountResearch(view); if (!root) return null;
  if (session?.view === view && session.root === root && root.querySelector(`[data-twx-view="${view}"]`)) { session.state = state; if (!document.querySelector('.twx-dialog') && document.activeElement?.tagName !== 'INPUT') paint(session); loadOutlook(session); return root; }
  stopResearch();
  const s = { view, root, state, controller: new AbortController() }; session = s; paint(s); loadOutlook(s);
  root.addEventListener('click', event => {
    if (Date.now() < (s.suppressClickUntil || 0) && event.target.closest('.twx-bubble')) return;
    const button = event.target.closest('button, [data-sector]'); if (!button) return;
    if (button.dataset.watch) { event.stopPropagation(); watchClick(button); return; }
    if (button.dataset.stock) { showStock(data?.stocks.find(stock => stock.symbol === button.dataset.stock)); return; }
    if (button.dataset.sector) { const sector = selectSectors(data, prefs).find(x => x.name === button.dataset.sector) || selectSectors(data).find(x => x.name === button.dataset.sector); if (sector) showSector(sector); return; }
    if (button.dataset.go) { document.querySelector(`.dock-btn[data-view-target="${button.dataset.go}"]`)?.click(); return; }
    if (button.dataset.vote) {
      submitOutlook(s, button.dataset.vote); return;
    }
    if (button.hasAttribute('data-expand')) { root.querySelector('.twx-chart-panel').classList.toggle('expanded'); button.setAttribute('aria-label', root.querySelector('.expanded') ? '收合圖表' : '展開圖表'); return; }
    if (button.dataset.zoom) {
      if (button.dataset.zoom === 'reset') resetChart();
      else { prefs.zoom = Math.max(minChartZoom(), Math.min(8, prefs.zoom + (button.dataset.zoom === 'in' ? .5 : -.5))); if (prefs.zoom === minChartZoom()) resetChart(); }
      const expanded = !!root.querySelector('.twx-chart-panel.expanded'); paint(s);
      if (expanded) root.querySelector('.twx-chart-panel')?.classList.add('expanded'); return;
    }
    if (button.dataset.quadrant !== undefined) { const q = Number(button.dataset.quadrant); prefs.quadrant = prefs.quadrant === q ? null : q; resetChart(); paint(s); return; }
    for (const key of ['tab', 'scope', 'mode', 'sort', 'density']) if (button.dataset[key]) {
      prefs[key] = button.dataset[key]; prefs.quadrant = null; resetChart();
      const group = button.closest('.twx-segments'); const buttons = [...group.querySelectorAll('button')]; group.style.setProperty('--active', buttons.indexOf(button));
      buttons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      setTimeout(() => { if (current(s)) paint(s); }, 175); return;
    }
  }, { signal: s.controller.signal });
  root.addEventListener('input', event => { if (event.target.matches('input[type="search"]')) { prefs.query = event.target.value; resetChart(); const cursor = event.target.selectionStart; paint(s); const input = root.querySelector('input[type=search]'); input.focus({ preventScroll: true }); input.setSelectionRange(cursor, cursor); } }, { signal: s.controller.signal });
  root.addEventListener('change', event => { if (event.target.matches('[data-market]')) { prefs.market = event.target.value; prefs.mode = 'auto'; prefs.quadrant = null; resetChart(); paint(s); } }, { signal: s.controller.signal });
  root.addEventListener('keydown', event => { if (event.target.matches('[data-sector]') && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); } }, { signal: s.controller.signal });
  let drag = null, frame = 0;
  root.addEventListener('pointerdown', event => {
    const chart = event.target.closest('.twx-bubbles'); if (!chart || prefs.zoom <= 1 || event.button !== 0) return;
    const rect = chart.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, panX: prefs.panX, panY: prefs.panY, scale: 480 / rect.width, moved: false };
    root.setPointerCapture(event.pointerId);
  }, { signal: s.controller.signal });
  root.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) < 5 && !drag.moved) return;
    drag.moved = true; event.preventDefault();
    const bound = prefs.zoom * 170;
    prefs.panX = Math.max(-bound, Math.min(bound, drag.panX + dx * drag.scale));
    prefs.panY = Math.max(-bound, Math.min(bound, drag.panY + dy * drag.scale));
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (current(s)) root.querySelector('.twx-chart-content').innerHTML = results(); });
  }, { signal: s.controller.signal });
  const finishDrag = event => {
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.moved) s.suppressClickUntil = Date.now() + 350;
    if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
    drag = null;
  };
  root.addEventListener('pointerup', finishDrag, { signal: s.controller.signal });
  root.addEventListener('pointercancel', finishDrag, { signal: s.controller.signal });
  s.controller.signal.addEventListener('abort', () => { if (frame) cancelAnimationFrame(frame); }, { once: true });
  if (Date.now() - lastFetch > 300000) refresh(s, false);
  return root;
}
