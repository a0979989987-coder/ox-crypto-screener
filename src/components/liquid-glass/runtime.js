(() => {
  "use strict";
  let dockRaf = 0;
  let radarRaf = 0;

  function alignDockLens() {
    dockRaf = 0;
    const dock = document.querySelector('.app-dock');
    const indicator = dock?.querySelector('.ox-dock-indicator');
    const active = dock?.querySelector('.dock-btn.active');
    if (!dock || !indicator || !active) return;
    if (active.classList.contains('dock-radar')) {
      indicator.style.opacity = '0';
      return;
    }
    const dr = dock.getBoundingClientRect();
    const br = active.getBoundingClientRect();
    if (!dr.width || !br.width) return;
    const pad = window.innerWidth <= 720 ? 7 : 10;
    const width = Math.max(42, Math.min(br.width - pad, window.innerWidth <= 720 ? 92 : 108));
    const left = (br.left - dr.left) + (br.width - width) / 2;
    indicator.style.left = `${left.toFixed(2)}px`;
    indicator.style.width = `${width.toFixed(2)}px`;
    indicator.style.transform = 'translate3d(0,0,0)';
    indicator.style.opacity = '1';
  }

  function scheduleDock() {
    if (dockRaf) return;
    dockRaf = requestAnimationFrame(alignDockLens);
  }

  function decorateRadarDirection() {
    radarRaf = 0;
    document.querySelectorAll('#view-radar .coin-card').forEach(card => {
      card.classList.toggle('ox-side-long', !!card.querySelector('.badge-long'));
      card.classList.toggle('ox-side-short', !!card.querySelector('.badge-short'));
    });
  }

  function scheduleRadar() {
    if (radarRaf) return;
    radarRaf = requestAnimationFrame(decorateRadarDirection);
  }

  function boot() {
    scheduleDock();
    scheduleRadar();

    document.addEventListener('click', e => {
      if (e.target.closest('.dock-btn')) requestAnimationFrame(scheduleDock);
      if (e.target.closest('.tab-btn,.coin-card')) requestAnimationFrame(scheduleRadar);
    }, { passive: true });
    document.addEventListener('ox:viewchange', () => requestAnimationFrame(scheduleDock));
    document.addEventListener('ox:themechange', () => requestAnimationFrame(() => { scheduleDock(); scheduleRadar(); }));
    window.addEventListener('resize', scheduleDock, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(scheduleDock, 90), { passive: true });

    const dock = document.querySelector('.app-dock');
    if (dock && 'ResizeObserver' in window) new ResizeObserver(scheduleDock).observe(dock);

    const radar = document.getElementById('screener-list') || document.getElementById('view-radar');
    if (radar) {
      const mo = new MutationObserver(scheduleRadar);
      // Class updates here must not schedule another render frame.
      mo.observe(radar, { subtree:true, childList:true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
