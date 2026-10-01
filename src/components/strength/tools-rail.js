import { revealStyledShadow } from '../style-ready.js?v=20261001-loading1';
// Both markets use one rail, including the sliding white glass indicator.
export function createToolsRail({ tabs, selected, label, attribute = 'data-tool', equal = false, onSelect }) {
  const element = document.createElement('div');
  element.style.cssText = 'grid-column:1/-1;min-width:0;';
  const shadow = element.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<link rel="stylesheet" href="${new URL('../../markets/tw/radar-ui.css?v=20261001-twlayout1', import.meta.url)}"><style>:host{display:block}:host([hidden]){display:none}.tw-radar-root .twr-mode-rail{width:max-content;min-width:100%}.tw-radar-root .twr-mode-rail button{flex:0 0 auto;padding:7px 12px;font-family:inherit;min-height:34px;font-size:11px}${equal?'.tw-radar-root .twr-mode-rail{display:flex;width:100%;min-width:0}.tw-radar-root .twr-mode-rail button{flex:1 1 0;min-width:0;text-align:center;justify-content:center}':''}.tw-radar-root{font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif}@media(max-width:600px){.tw-radar-root .twr-mode-rail button{padding:6px 10px;min-height:33px;font-size:11px}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}</style><div class="tw-radar-root"><nav class="twr-mode-viewport" aria-label="${label}"><div class="twr-mode-rail" role="tablist"><span class="twr-mode-indicator" aria-hidden="true"></span>${tabs.map(([id, title]) => `<button type="button" role="tab" ${attribute}="${id}" aria-selected="${id === selected}" tabindex="${id === selected ? 0 : -1}" class="${id === selected ? 'active' : ''}">${title}</button>`).join('')}</div></nav></div>`;
  const life = new AbortController();
  revealStyledShadow(shadow, life.signal, '.tw-radar-root', 41);
  function position() {
    const rail = shadow.querySelector('.twr-mode-rail'), button = rail.querySelector('.active');
    if (!button) return;
    rail.style.setProperty('--mode-x', button.offsetLeft + 'px');
    rail.style.setProperty('--mode-width', button.offsetWidth + 'px');
  }
  shadow.addEventListener('click', event => {
    const button = event.target.closest(`[${attribute}]`); if (!button) return;
    shadow.querySelectorAll('button').forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active); item.setAttribute('aria-selected', active); item.tabIndex = active ? 0 : -1;
    });
    position();
    button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
    onSelect(button.getAttribute(attribute));
  }, { signal: life.signal });
  shadow.addEventListener('keydown', event => {
    const buttons = [...shadow.querySelectorAll('button')], i = buttons.indexOf(shadow.activeElement); if (i < 0) return;
    const next = event.key === 'ArrowRight' ? (i + 1) % buttons.length : event.key === 'ArrowLeft' ? (i + buttons.length - 1) % buttons.length : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); buttons[next].focus(); buttons[next].click();
  }, { signal: life.signal });
  shadow.querySelector('link').addEventListener('load', position, { signal: life.signal });
  const resize = new ResizeObserver(position); resize.observe(element);
  return { element, shadow, position, destroy() { life.abort(); resize.disconnect(); } };
}
