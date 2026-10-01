import { renderResearch, stopResearch } from './research-page.js?v=20261001-loading1';
import { mountResearch } from './research-ui.js';
import { createToolsRail } from '../../components/strength/tools-rail.js?v=20261001-loading1';
import { createTWMarketState } from './engine.js?v=20261001-loading1';
let selected = 'patterns', session = null, modules;
export function preloadTWStrength() {
  return modules ??= Promise.all([
    import('../crypto/patterns/view.js?v=20261001-loading1'),
    import('./patterns/source.js?v=20261001-loading1'), import('./patterns/index-cache.js?v=20261001-loading1')
  ]).catch(error => { modules = null; throw error; });
}
export function stopTWStrength() {
  if (!session) return;
  session.instance?.destroy(); session.rail.destroy(); session = null; stopResearch();
}
async function show(s) {
  if (session !== s) return;
  s.instance?.destroy(); s.instance = null; stopResearch(); s.host.replaceChildren();
  const generation = ++s.generation;
  s.host.hidden = selected !== 'patterns'; s.research.hidden = selected === 'patterns';
  if (selected !== 'patterns') { renderResearch('strength', s.state, { host: s.research }); return; }
  s.host.textContent = '載入型態畫板…';
  try {
    const [{ mountPatternSearch }, source, cache] = await preloadTWStrength();
    if (session !== s || generation !== s.generation || selected !== 'patterns') return;
    s.host.textContent = '';
    s.instance = mountPatternSearch(s.host, { source, cache, onOpenRadar(symbol) {
      document.dispatchEvent(new CustomEvent('ox:tw-chart-symbol',{detail:{symbol}}));
      document.querySelector('.dock-btn[data-view-target="radar"]')?.click();
    } });
  } catch (error) {
    if (session !== s || generation !== s.generation) return;
    s.host.textContent = '畫板載入失敗'; const retry = document.createElement('button');
    retry.textContent = '重新載入'; retry.onclick = () => show(s); s.host.append(retry);
  }
}
export function renderTWStrength(state) {
  const root = mountResearch('strength'); if (!root) return null;
  if (session?.root === root && root.querySelector('#ox-tw-tools-nav')) {
    session.state = state;
    if (selected !== 'patterns') renderResearch('strength', state, { host: session.research });
    return root;
  }
  stopTWStrength(); stopResearch(); root.replaceChildren();
  const host = document.createElement('div'), research = document.createElement('div');
  host.id = 'ox-tw-patterns'; research.id = 'ox-tw-sector-tools';
  const rail = createToolsRail({ tabs: [['patterns', '型態搜尋'], ['rotation', '板塊輪動']], selected, label: '台股指標分類', attribute: 'data-tw-tool', onSelect(id) { selected = id; if (session) show(session); } });
  rail.element.id = 'ox-tw-tools-nav';
  const style = document.createElement('style');
  style.textContent = '#ox-tw-tools-nav{margin:0 0 12px}#ox-tw-patterns,#ox-tw-sector-tools{min-width:0}#ox-tw-sector-tools[hidden],#ox-tw-patterns[hidden]{display:none!important}';
  root.append(style, rail.element, host, research);
  const s = { root, host, research, rail, state, instance: null, generation: 0 }; session = s;
  rail.position(); show(s); return root;
}

if(typeof document !== 'undefined') document.addEventListener('ox:tw-tool', event => { if(['patterns','rotation'].includes(event.detail?.tool)){selected=event.detail.tool;stopTWStrength();} });
