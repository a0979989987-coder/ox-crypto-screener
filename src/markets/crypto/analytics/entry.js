// Crypto-only inline tools. Preserve the existing strength calculations and DOM.
const section = document.querySelector('#view-strength .strength-page');
if (section) {
  const tabs = [['patterns','型態搜尋'],['overview','總覽'],['strength','強弱對比'],['heatmap','熱力圖'],['rotation','板塊輪動'],['flow','主動買賣'],['liquidations','爆倉'],['zones','清算'],['derivatives','合約'],['order','訂單流']];
  let selected = 'patterns';
  const nav = document.createElement('div'); nav.id='ox-crypto-tools-nav'; nav.style.cssText='grid-column:1/-1;min-width:0;'; nav.hidden=true;
  const ns = nav.attachShadow({mode:'open'});
  const twCSS = new URL('../../tw/radar-ui.css',import.meta.url);
  ns.innerHTML = `<link rel="stylesheet" href="${twCSS.href}"><style>:host{display:block}:host([hidden]){display:none}.tw-radar-root .twr-mode-rail{width:max-content;min-width:100%}.tw-radar-root .twr-mode-rail button{flex:0 0 auto;padding:7px 12px;font-family:inherit;min-height:34px;font-size:11px}.tw-radar-root{font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif}@media(max-width:600px){.tw-radar-root .twr-mode-rail button{padding:6px 10px;min-height:33px;font-size:11px}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}</style><div class="tw-radar-root"><nav class="twr-mode-viewport" aria-label="Crypto 指標分類"><div class="twr-mode-rail" role="tablist"><span class="twr-mode-indicator" aria-hidden="true"></span>${tabs.map(([id,label])=>`<button type="button" role="tab" data-crypto-tool="${id}" aria-selected="${id===selected}" tabindex="${id===selected?0:-1}" class="${id===selected?'active':''}">${label}</button>`).join('')}</div></nav></div>`;
  section.prepend(nav);
  const boundaryStyle=document.createElement('style');
  boundaryStyle.textContent='body[data-view="strength"] .ox-live-shell{margin-bottom:14px!important}#view-strength .strength-page{padding-top:8px!important}#view-strength .strength-page[data-crypto-tool]:not([data-crypto-tool="strength"]) > :not(#ox-crypto-tools-nav):not(#ox-crypto-tools-inline){display:none!important}#view-strength .strength-page > [hidden]{display:none!important}#view-strength .strength-page[data-crypto-tool="strength"] .strength-compare-top .page-kicker,#view-strength .strength-page[data-crypto-tool="strength"] .strength-compare-top h2,#view-strength .strength-page[data-crypto-tool="strength"] .strength-compare-top p,#view-strength .strength-page[data-crypto-tool="strength"] .strength-compare-side span,#view-strength .strength-page[data-crypto-tool="strength"] .strength-head p,#view-strength .strength-page[data-crypto-tool="strength"] .strength-explain{display:none!important}#view-strength .strength-page[data-crypto-tool="strength"] .strength-compare-top{justify-content:flex-end;margin-bottom:8px}';
  section.append(boundaryStyle);
  boundaryStyle.textContent+='#view-strength .strength-page[data-crypto-tool="patterns"]{row-gap:4px!important}';
  function positionIndicator(){const rail=ns.querySelector('.twr-mode-rail'),button=rail.querySelector('.active');if(!button)return;rail.style.setProperty('--mode-x',button.offsetLeft+'px');rail.style.setProperty('--mode-width',button.offsetWidth+'px');}
  new ResizeObserver(positionIndicator).observe(nav); ns.querySelector('link').addEventListener('load',positionIndicator);
  ns.addEventListener('click',e=>{const b=e.target.closest('[data-crypto-tool]');if(!b)return;selected=b.dataset.cryptoTool;ns.querySelectorAll('button').forEach(x=>{const a=x===b;x.classList.toggle('active',a);x.setAttribute('aria-selected',a);x.tabIndex=a?0:-1;});positionIndicator();b.scrollIntoView({block:'nearest',inline:'nearest',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});unmount();sync();});
  ns.addEventListener('keydown',e=>{const buttons=[...ns.querySelectorAll('button')],i=buttons.indexOf(ns.activeElement);if(i<0)return;let n;if(e.key==='ArrowRight')n=(i+1)%buttons.length;else if(e.key==='ArrowLeft')n=(i+buttons.length-1)%buttons.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=buttons.length-1;else return;e.preventDefault();buttons[n].focus();buttons[n].click();});
  const slot = document.createElement('section');
  slot.id = 'ox-crypto-tools-inline';
  slot.setAttribute('aria-label', '加密市場工具');
  slot.style.cssText = 'grid-column:1/-1;min-width:0;margin:8px 0 18px;';
  slot.hidden = true;
  const anchor = section.querySelector('.strength-compare-panel');
  if (anchor) anchor.after(slot); else section.prepend(slot);
  const host = document.createElement('div'); slot.append(host);
  let instance = null, pending = false, generation = 0, observer = null, dialog = null;
  let previousOverflow = '';
  const active = () => (document.body.dataset.market || 'crypto') === 'crypto' && document.body.dataset.view === 'strength';
  function exitFocus() {
    if (!dialog) return;
    slot.append(host); dialog.close(); dialog.remove(); dialog = null;
    document.body.style.overflow = previousOverflow;
  }
  function syncFocus() {
    const focused = host.shadowRoot?.querySelector('.cfx')?.classList.contains('focused');
    if (!focused) { exitFocus(); return; }
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', 'Crypto 全螢幕圖表');
    dialog.style.cssText = 'inset:0;width:100vw;max-width:none;height:100dvh;max-height:none;margin:0;padding:0;border:0;background:#0d1215;';
    dialog.append(host); document.body.append(dialog);
    previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    dialog.addEventListener('cancel', e => { e.preventDefault(); instance?.closeInner(); });
    dialog.showModal();
  }
  function unmount() {
    generation++; pending = false; observer?.disconnect(); observer = null;
    exitFocus(); instance?.destroy(); instance = null; slot.hidden = true;
  }
  async function sync() {
    nav.hidden = !active();
    if (!active()) { delete section.dataset.cryptoTool; unmount(); return; }
    section.dataset.cryptoTool=selected; positionIndicator();
    if(selected==='strength'){unmount();return;}
    slot.hidden = false;
    if (instance || pending) return;
    pending = true; const token = ++generation;
    try {
      if(selected==='patterns'){
        const { mountPatternSearch } = await import('../patterns/view.js?v=patterns5b-20260929');
        if(token!==generation||!active())return;
        instance=mountPatternSearch(host);
        return;
      }
      const { mountCryptoFlow } = await import('./flow-view.js?v=crypto-live2-20260928');
      if (token !== generation || !active()) return;
      instance = mountCryptoFlow(host, { initialTab:selected, autoRefresh:true, onExit() { ns.querySelector('[data-crypto-tool="strength"]').click(); } });
      const style = document.createElement('style');
      style.textContent = ':host{display:block}.cfx{min-height:0;border:1px solid #344248;border-radius:14px;overflow:hidden}.cfx-top{height:43px;padding:0 12px}.cfx-back,.cfx-brand,.cfx-source-badge,.cfx-tabs{display:none}.cfx-tabs{padding:0 12px;gap:18px}.cfx-content{padding:12px 10px}.cfx.focused{border:0;border-radius:0}.cfx.focused .cfx-brand{display:flex}';
      host.shadowRoot.append(style);
      observer = new MutationObserver(syncFocus);
      observer.observe(host.shadowRoot.querySelector('.cfx'), {attributes:true,attributeFilter:['class']});
    } catch (error) {
      console.warn('[OX Crypto tool]',error);
      if (token === generation) { host.textContent = '工具載入失敗'; const retry = document.createElement('button'); retry.textContent='重新載入'; retry.onclick=()=>{host.textContent='';sync();}; host.append(retry); }
    } finally { if (token === generation) pending = false; }
  }
  document.addEventListener('ox:marketchange', sync);
  document.addEventListener('ox:viewchange', sync);
  sync();
}
