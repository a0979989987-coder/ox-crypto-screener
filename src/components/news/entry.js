(() => {
  'use strict';
  function bind() {
    const entries = [...document.querySelectorAll('.app-dock [data-view-target="data"], .ox-desktop-nav [data-view-target="data"]')].filter(n => !n.dataset.oxNewsEntry);
    if (!entries.length) return;
    const menu = document.createElement('div'); menu.id = 'ox-news-entry-menu'; menu.className = 'oxn-entry-menu'; menu.setAttribute('role', 'menu'); menu.hidden = true;
    for (const [id, label] of [['market', '本市場新聞'], ['all', '新聞總頁']]) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.destination = id; b.setAttribute('role', 'menuitem');
      b.addEventListener('click', () => { close(); if (id === 'all') window.OXNews.open(); else window.OXNews.openMarket(); }); menu.append(b);
    }
    document.body.append(menu);
    let active = entries[0], closeTimer, holdTimer, tapTimer, pointer = null, lastTap = 0, pointerType = 'mouse';
    function position() {
      const r = active.getBoundingClientRect(), width = Math.min(250, innerWidth - 24); menu.style.width = width + 'px';
      menu.style.left = Math.max(12, Math.min(innerWidth - width - 12, r.left + r.width / 2 - width / 2)) + 'px';
      menu.style.bottom = ''; menu.style.top = '';
      if (r.top > innerHeight / 2) menu.style.bottom = Math.max(12, innerHeight - r.top + 8) + 'px';
      else menu.style.top = Math.max(12, r.bottom + 6) + 'px';
    }
    function open(focus = false) { clearTimeout(closeTimer); menu.hidden = false; position(); menu.classList.add('is-open'); active.setAttribute('aria-expanded', 'true'); if (focus) menu.querySelector('button').focus(); }
    function close() { clearTimeout(closeTimer); menu.classList.remove('is-open'); entries.forEach(n => n.setAttribute('aria-expanded', 'false')); closeTimer = setTimeout(() => { menu.hidden = true; }, 280); }
    function leave() { clearTimeout(closeTimer); closeTimer = setTimeout(close, 150); }
    function cancel(clearTap = false) { clearTimeout(holdTimer); pointer = null; if (clearTap) { clearTimeout(tapTimer); lastTap = 0; } }
    for (const entry of entries) {
      entry.dataset.oxNewsEntry = '1'; entry.setAttribute('aria-haspopup', 'menu'); entry.setAttribute('aria-expanded', 'false');
      entry.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { active = entry; open(); } });
      entry.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') leave(); });
      entry.addEventListener('pointerdown', e => {
        pointerType = e.pointerType || 'mouse'; if (!e.isPrimary || e.button !== 0) { cancel(true); return; }
        active = entry; const second = pointerType !== 'mouse' && lastTap && performance.now() - lastTap < 320;
        if (second) clearTimeout(tapTimer); // Cancel the first navigation before the second finger is released.
        pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, second, held: false };
        if (pointerType !== 'mouse') holdTimer = setTimeout(() => { if (!pointer) return; clearTimeout(tapTimer); lastTap = 0; pointer.held = true; open(); }, 480);
      }, { passive: true });
      entry.addEventListener('pointermove', e => { if (pointer && Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 10) cancel(true); }, { passive: true });
      entry.addEventListener('pointerup', () => {
        const gesture = pointer; cancel(); if (pointerType === 'mouse' || !gesture || gesture.held) return;
        clearTimeout(tapTimer);
        if (gesture.second) { lastTap = 0; open(); return; }
        lastTap = performance.now(); tapTimer = setTimeout(() => { lastTap = 0; window.OXNews.openMarket(); }, 320);
      }, { passive: true });
      entry.addEventListener('pointercancel', () => cancel(true), { passive: true });
      entry.addEventListener('click', e => {
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.detail === 0 || pointerType === 'mouse') { active = entry; open(true); }
      }, true);
      entry.addEventListener('dblclick', e => { e.preventDefault(); e.stopPropagation(); });
      entry.addEventListener('contextmenu', e => { if (pointerType !== 'mouse') e.preventDefault(); });
      entry.addEventListener('keydown', e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); active = entry; open(true); } if (e.key === 'Escape') close(); });
    }
    menu.addEventListener('pointerenter', () => clearTimeout(closeTimer)); menu.addEventListener('pointerleave', leave);
    menu.addEventListener('keydown', e => {
      const items = [...menu.querySelectorAll('button')], index = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); close(); active.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); }
    });
    menu.addEventListener('focusout', e => { if (!menu.contains(e.relatedTarget) && !entries.includes(e.relatedTarget)) leave(); });
    document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target) && !entries.some(n => n.contains(e.target))) close(); }, { passive: true });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('is-open')) close(); });
    document.addEventListener('ox:viewchange', () => { close(); cancel(true); });
    window.addEventListener('blur', () => { cancel(true); close(); });
    window.addEventListener('resize', () => { if (!menu.hidden) position(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true }); else bind();
})();
