import { savedResearch, loadResearch, selectSectors, readWatchlist, quadrant } from './research-data.js';
import { escape, number, pct, money, direction, segments, mountResearch, statusLine, stockRows } from './research-ui.js';
import { bubbleChart } from './research-bubbles.js';
import { closeResearchDetails, showSector, showStock, watchClick } from './research-detail.js';
const prefs = { tab: 'bubble', scope: 'all', market: 'ALL', mode: 'day', sort: 'buy', query: '', quadrant: null };
let session, data = savedResearch(), loading = false, error = null, lastFetch = 0;
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
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  let vote; try { vote = localStorage.getItem(`ox-tw-outlook:${day}`); } catch {}
  const chip = s => `<button type="button" class="twx-sector-chip" data-sector="${escape(s.name)}"><span>${escape(s.name)}</span><b class="${direction(s.flow)}">${money(s.flow)}</b></button>`;
  const watches = stocks.filter(s => readWatchlist().has(s.symbol));
  return `<div class="twx-home-grid"><section class="twx-glass twx-market"><div class="twx-indices">${['TAIEX', 'TPEX', 'TX'].map((symbol, i) => { const p = pulse[symbol]; return `<div><small>${['加權指數', '櫃買指數', '台指近月'][i]}</small><strong>${number(p?.price)}</strong><span class="${direction(p?.changePct)}">${pct(p?.changePct)}</span></div>`; }).join('')}</div><div class="twx-breadth"><div><span class="up">上漲 ${total ? up : '—'}</span><span>平盤 ${total ? flat : '—'}</span><span class="down">下跌 ${total ? down : '—'}</span></div><div class="twx-breadth-track"><i style="width:${total ? up / total * 100 : 0}%"></i><i style="width:${total ? flat / total * 100 : 0}%"></i><i style="width:${total ? down / total * 100 : 0}%"></i></div></div></section><section class="twx-glass twx-outlook"><div class="twx-section-head"><span>下一交易日</span><small>我的看法</small></div><div class="twx-votes"><button type="button" data-vote="up" data-day="${day}" aria-pressed="${vote === 'up'}"><span class="up">↗</span>看漲</button><button type="button" data-vote="down" data-day="${day}" aria-pressed="${vote === 'down'}"><span class="down">↘</span>看跌</button></div><small class="twx-vote-status">${vote ? '已記錄，可修改 · 僅儲存於此裝置' : '僅儲存於此裝置'}</small></section><section class="twx-glass"><div class="twx-section-head"><span>法人買超產業</span><button type="button" data-go="strength">查看泡泡圖 ↗</button></div><div class="twx-chip-list">${leaders.filter(s => s.flow > 0).slice(0, 5).map(chip).join('') || '<span class="twx-muted">法人資料待更新</span>'}</div></section><section class="twx-glass"><div class="twx-section-head"><span>法人賣超產業</span><small>估算金額</small></div><div class="twx-chip-list">${leaders.filter(s => s.flow < 0).reverse().slice(0, 5).map(chip).join('') || '<span class="twx-muted">法人資料待更新</span>'}</div></section><section class="twx-glass twx-home-wide"><div class="twx-section-head"><span>法人動向</span><small>估算淨買超</small></div>${stockRows([...stocks].filter(s => Number.isFinite(s.netTwd)).sort((a, b) => b.netTwd - a.netTwd), readWatchlist(), 8) || '<div class="twx-empty">官方資料載入後顯示</div>'}</section><section class="twx-glass twx-home-wide"><div class="twx-section-head"><span>自選</span><small>${watches.length} 檔</small></div>${stockRows(watches, readWatchlist(), 20) || '<div class="twx-empty">點選股票旁的星星加入自選</div>'}</section></div>`;
}
function filtered() {
  return selectSectors(data, prefs).filter(s => { const x = prefs.mode === 'momentum' ? s.flow5 : s.flow, y = prefs.mode === 'momentum' ? s.momentum : s.changePct; return prefs.quadrant === null || (Number.isFinite(x) && Number.isFinite(y) && quadrant(x, y) === prefs.quadrant); });
}
function results() {
  const sectors = filtered();
  if (prefs.tab === 'bubble') return bubbleChart(sectors, prefs.mode);
  const sortKey = prefs.sort === 'up' || prefs.sort === 'down' ? 'changePct' : prefs.mode === 'momentum' ? 'flow5' : 'flow';
  const sign = ['sell', 'down'].includes(prefs.sort) ? 1 : -1;
  const sorted = [...sectors].filter(s => Number.isFinite(s[sortKey])).sort((a, b) => sign * (a[sortKey] - b[sortKey]));
  return `<div class="twx-ranking">${sorted.map((s, index) => `<button type="button" class="twx-rank" data-sector="${escape(s.name)}"><span class="twx-rank-number">${index + 1}</span><span><b>${escape(s.name)}</b><small>${s.buyCount} / ${s.covered} 檔買超</small></span><span class="${direction(s.changePct)}">${pct(s.changePct)}</span><strong class="${direction(s[sortKey])}">${['up', 'down'].includes(prefs.sort) ? money(s.flow) : money(s[sortKey])}</strong></button>`).join('') || '<div class="twx-empty">沒有符合條件的產業</div>'}</div>`;
}
function indicatorContent() {
  const canMomentum = prefs.scope === 'all' && prefs.market === 'ALL' && data?.sectors?.some(s => Number.isFinite(s.momentum));
  if (!canMomentum) prefs.mode = 'day';
  const all = selectSectors(data, prefs);
  const counts = [0, 0, 0, 0];
  for (const s of all) { const x = prefs.mode === 'momentum' ? s.flow5 : s.flow, y = prefs.mode === 'momentum' ? s.momentum : s.changePct; if (Number.isFinite(x) && Number.isFinite(y)) counts[quadrant(x, y)]++; }
  const labels = prefs.mode === 'momentum' ? ['流入增強', '流入減弱', '流出減弱', '流出增強'] : ['買超上漲', '買超下跌', '賣超上漲', '賣超下跌'];
  return `<div class="twx-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="搜尋股票或產業" placeholder="搜尋股票或產業" value="${escape(prefs.query)}"><select aria-label="市場篩選" data-market><option value="ALL" ${prefs.market === 'ALL' ? 'selected' : ''}>上市＋上櫃</option><option value="TWSE" ${prefs.market === 'TWSE' ? 'selected' : ''}>上市</option><option value="TPEX" ${prefs.market === 'TPEX' ? 'selected' : ''}>上櫃</option></select></div><div class="twx-quadrants">${labels.map((label, i) => `<button type="button" data-quadrant="${i}" aria-pressed="${prefs.quadrant === i}" class="q${i}"><small>${label}</small><strong>${data ? counts[i] : '—'}</strong></button>`).join('')}</div><div class="twx-visual"><section class="twx-glass twx-chart-panel"><div class="twx-chart-tools">${segments('mode', canMomentum ? [['day', '當日'], ['momentum', '5／20 日動能']] : [['day', '當日']], prefs.mode)}<button type="button" class="twx-icon" data-expand aria-label="展開圖表">⛶</button></div>${prefs.tab === 'rank' ? segments('sort', [['buy', '買超'], ['sell', '賣超'], ['up', '漲幅'], ['down', '跌幅']], prefs.sort) : ''}<div class="twx-chart-content">${results()}</div></section><div class="twx-tools">${segments('tab', [['bubble', '泡泡圖'], ['rank', '排行']], prefs.tab)}${segments('scope', [['all', '全部'], ['watch', '自選']], prefs.scope)}</div></div><div class="twx-sector-list">${all.map(s => `<button type="button" data-sector="${escape(s.name)}"><span>${escape(s.name)}</span><b class="${direction(s.flow)}">${money(s.flow)}</b></button>`).join('')}</div>`;
}
function paint(s) {
  if (session !== s) return;
  const content = s.view === 'home' ? homeContent(s.state) : indicatorContent();
  s.root.innerHTML = `<div class="twx" data-twx-view="${s.view}">${statusLine(data, loading, error)}${error && !data ? '<div class="twx-empty" role="status">資料暫時無法載入，請點右上角重試。</div>' : ''}${content}</div>`;
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
  if (session?.view === view && session.root === root && root.querySelector(`[data-twx-view="${view}"]`)) { session.state = state; if (!document.querySelector('.twx-dialog') && document.activeElement?.tagName !== 'INPUT') paint(session); return root; }
  stopResearch();
  const s = { view, root, state, controller: new AbortController() }; session = s; paint(s);
  root.addEventListener('click', event => {
    const button = event.target.closest('button, [data-sector]'); if (!button) return;
    if (button.hasAttribute('data-refresh')) { refresh(s, true); window.OXModules?.router?.get('tw')?.reload?.(); return; }
    if (button.dataset.watch) { event.stopPropagation(); watchClick(button); return; }
    if (button.dataset.stock) { showStock(data?.stocks.find(stock => stock.symbol === button.dataset.stock)); return; }
    if (button.dataset.sector) { const sector = selectSectors(data, prefs).find(x => x.name === button.dataset.sector) || selectSectors(data).find(x => x.name === button.dataset.sector); if (sector) showSector(sector); return; }
    if (button.dataset.go) { document.querySelector(`.dock-btn[data-view-target="${button.dataset.go}"]`)?.click(); return; }
    if (button.dataset.vote) {
      try { localStorage.setItem(`ox-tw-outlook:${button.dataset.day}`, button.dataset.vote); } catch { root.querySelector('.twx-vote-status').textContent = '無法儲存，請確認瀏覽器儲存設定'; return; }
      root.querySelectorAll('[data-vote]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      root.querySelector('.twx-vote-status').textContent = '已記錄，可修改 · 僅儲存於此裝置'; return;
    }
    if (button.hasAttribute('data-expand')) { root.querySelector('.twx-chart-panel').classList.toggle('expanded'); button.setAttribute('aria-label', root.querySelector('.expanded') ? '收合圖表' : '展開圖表'); return; }
    if (button.dataset.quadrant !== undefined) { const q = Number(button.dataset.quadrant); prefs.quadrant = prefs.quadrant === q ? null : q; paint(s); return; }
    for (const key of ['tab', 'scope', 'mode', 'sort']) if (button.dataset[key]) {
      prefs[key] = button.dataset[key]; prefs.quadrant = null;
      const group = button.closest('.twx-segments'); const buttons = [...group.querySelectorAll('button')]; group.style.setProperty('--active', buttons.indexOf(button));
      buttons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      setTimeout(() => { if (current(s)) paint(s); }, 175); return;
    }
  }, { signal: s.controller.signal });
  root.addEventListener('input', event => { if (event.target.matches('input[type="search"]')) { prefs.query = event.target.value; root.querySelector('.twx-chart-content').innerHTML = results(); } }, { signal: s.controller.signal });
  root.addEventListener('change', event => { if (event.target.matches('[data-market]')) { prefs.market = event.target.value; prefs.quadrant = null; paint(s); } }, { signal: s.controller.signal });
  root.addEventListener('keydown', event => { if (event.target.matches('[data-sector]') && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); } }, { signal: s.controller.signal });
  if (Date.now() - lastFetch > 300000) refresh(s, false);
  return root;
}
