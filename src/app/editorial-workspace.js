/* Shared editorial UI. Market data and radar workspace remain owned by their modules. */
(() => {
  'use strict';
  const names = {home:'市場總覽',strength:'市場指標',radar:'雷達工作區',data:'數據與事件',media:'OX Journal',settings:'設定',news:'全球市場消息'};
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
  document.addEventListener('keydown',event => {
    if (!['Enter',' '].includes(event.key)) return;
    const action = event.target.closest('[data-home-symbol][role="button"]');
    if (action) { event.preventDefault(); action.click(); }
  });
  document.addEventListener('ox:viewchange',updateContext);
  document.addEventListener('ox:marketchange',updateContext);
  document.addEventListener('DOMContentLoaded',updateContext);
  updateContext();
})();
