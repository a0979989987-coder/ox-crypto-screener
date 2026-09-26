/* Shared editorial UI. Market data and radar workspace remain owned by their modules. */
(() => {
  'use strict';
  const names = {home:'市場總覽',strength:'市場指標',radar:'雷達工作區',data:'數據與事件',media:'OX Journal',settings:'設定',news:'全球市場消息'};
  const modeKey = 'ox-ui-mode';
  function setMode(mode) {
    document.body.dataset.uiMode = mode === 'plus' ? 'plus' : 'pro';
    document.querySelectorAll('[data-ui-mode-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.uiModeChoice === document.body.dataset.uiMode));
    });
  }
  try { setMode(localStorage.getItem(modeKey)); } catch { setMode('pro'); }
  document.addEventListener('click',event => {
    const button = event.target.closest('[data-ui-mode-choice]');
    if (!button) return;
    setMode(button.dataset.uiModeChoice);
    try { localStorage.setItem(modeKey, document.body.dataset.uiMode); } catch { /* storage unavailable */ }
  });
  function updateContext() {
    const view = document.querySelector('.app-view.active')?.dataset.appView || 'home';
    document.body.dataset.view = view;
    document.querySelectorAll('[data-terminal-view]').forEach(el => { el.textContent = names[view] || names.home; });
    document.querySelectorAll('.ox-desktop-nav [data-view-target]').forEach(el => {
      const active = el.dataset.viewTarget === view;
      el.classList.toggle('active',active);
      if(active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-terminal-date]').forEach(el => {
      el.textContent = new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).format(new Date());
    });
  }
  document.addEventListener('click',event => {
    const tier = event.target.closest('[data-home-tier]');
    if (tier) {
      window.switchAppView?.('radar');
      document.querySelector(`#view-radar .tab-btn[data-tab="${tier.dataset.homeTier}"]`)?.click();
    }
  });
  document.addEventListener('click',event => {
    const collapse = event.target.closest('#radar-scanner-collapse');
    const reopen = event.target.closest('#radar-scanner-reopen');
    if (!collapse && !reopen) return;
    const radar = document.getElementById('view-radar');
    const hidden = !!collapse;
    radar?.classList.toggle('ox-scanner-collapsed', hidden);
    document.getElementById('radar-scanner-panel')?.setAttribute('aria-hidden', String(hidden));
    document.getElementById('radar-scanner-reopen')?.setAttribute('aria-expanded', String(!hidden));
    document.getElementById('radar-scanner-collapse')?.setAttribute('aria-expanded', String(!hidden));
    requestAnimationFrame(() => window.resizeChartToContainer?.());
  });
  document.addEventListener('keydown',event => {
    if (!['Enter',' '].includes(event.key)) return;
    const action = event.target.closest('[data-home-symbol][role="button"]');
    if (action) { event.preventDefault(); action.click(); }
  });
  document.addEventListener('ox:viewchange',updateContext);
  document.addEventListener('ox:marketchange',updateContext);
  document.addEventListener('DOMContentLoaded',updateContext);
  // Respond to scroll direction without measuring layout or intercepting gestures.
  const dock = document.querySelector('.app-dock.glass-nav');
  if (dock) {
    let lastY = Math.max(0, window.scrollY);
    let pending = false;
    let travel = 0;
    let lastToggle = 0;
    window.addEventListener('scroll', () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        const y = Math.max(0, window.scrollY);
        const delta = y - lastY;
        if (y < 35) { dock.classList.remove('ox-dock-compact'); travel = 0; }
        else if (!document.body.classList.contains('ox-mqs-open') && Math.abs(delta) < 90) {
          if (Math.sign(delta) !== Math.sign(travel)) travel = 0;
          travel += delta;
          if (Math.abs(travel) >= 26 && performance.now() - lastToggle > 260) {
            dock.classList.toggle('ox-dock-compact', travel > 0);
            lastToggle = performance.now();
            travel = 0;
          }
        }
        lastY = y;
        pending = false;
      });
    }, {passive:true});
  }
  updateContext();
})();
