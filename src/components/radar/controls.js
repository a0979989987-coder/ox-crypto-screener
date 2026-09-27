/* Gestures only: the existing currentTab and setScannerTierFilter own selection. */
(() => {
  'use strict';
  const logo = document.querySelector('.radar-combined-tab');
  const menu = document.getElementById('radar-tier-menu');
  if (!logo || !menu) return;
  // A portal avoids clipping by the scanner's scroll/overflow containers.
  document.body.append(menu);
  const tiers = ['all', 't1', 't2', 't3'];
  let press = null;
  let timer = 0;
  let suppressClick = false;

  function cancelPress() {
    clearTimeout(timer);
    timer = 0;
    press = null;
  }
  function closeMenu(restoreFocus = false) {
    menu.hidden = true;
    logo.setAttribute('aria-expanded', 'false');
    if (restoreFocus) logo.focus({ preventScroll: true });
  }
  function positionMenu() {
    const rect = logo.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8));
    menu.style.left = `${left}px`;
    menu.style.setProperty('--radar-menu-origin-x', `${rect.left + rect.width / 2 - left}px`);
    menu.style.top = `${Math.max(8, Math.min(rect.bottom + 5, innerHeight - menu.offsetHeight - 8))}px`;
  }
  function openMenu(keyboard = false) {
    syncScannerFilterUI();
    menu.hidden = false;
    positionMenu();
    logo.setAttribute('aria-expanded', 'true');
    // Moving focus while a finger is held can cancel the gesture on mobile.
    if (keyboard) menu.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
  }
  function select(tier) {
    setScannerTierFilter(tier);
    closeMenu();
  }

  function beginPress(kind, id, x, y) {
    cancelPress();
    suppressClick = false;
    press = { kind, id, x, y };
    timer = setTimeout(() => {
      timer = 0;
      if (!press) return;
      suppressClick = true;
      openMenu();
    }, 3000);
  }
  function movePress(x, y) {
    if (Math.hypot(x - press.x, y - press.y) <= 12) return;
    suppressClick = true;
    cancelPress();
    closeMenu();
  }
  // Touch owns its entire lifecycle. Safari may cancel a compatibility pointer
  // during a held touch; that must not destroy the touch timer or open menu.
  logo.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) return;
    const touch = event.changedTouches[0];
    beginPress('touch', touch.identifier, touch.clientX, touch.clientY);
  }, { passive: true });
  document.addEventListener('touchmove', event => {
    if (press?.kind !== 'touch') return;
    const touch = [...event.touches].find(touch => touch.identifier === press.id);
    if (touch) movePress(touch.clientX, touch.clientY);
  }, { passive: true });
  function endTouch(event) {
    if (press?.kind !== 'touch' || ![...event.changedTouches].some(touch => touch.identifier === press.id)) return;
    if (event.type === 'touchcancel') suppressClick = true;
    cancelPress();
    // A completed long press stays open on release/cancel; a real drag or
    // scroll already dismisses it. All listeners remain passive for scrolling.
  }
  document.addEventListener('touchend', endTouch, { passive: true });
  document.addEventListener('touchcancel', endTouch, { passive: true });
  logo.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' || !event.isPrimary || event.button !== 0) return;
    beginPress('pointer', event.pointerId, event.clientX, event.clientY);
  }, { passive: true });
  document.addEventListener('pointermove', event => {
    if (press?.kind === 'pointer' && event.pointerId === press.id) movePress(event.clientX, event.clientY);
  }, { passive: true });
  for (const type of ['pointerup', 'pointercancel']) {
    document.addEventListener(type, event => {
      if (press?.kind !== 'pointer' || event.pointerId !== press.id) return;
      if (type === 'pointercancel') suppressClick = true;
      cancelPress();
    }, { passive: true });
  }
  document.addEventListener('scroll', event => {
    // Ignore unrelated tickers/containers scrolling elsewhere on the page.
    const target = event.target;
    if (target !== document && !target.contains?.(logo) && !target.closest?.('#radar-scanner-panel')) return;
    if (press) suppressClick = true;
    cancelPress();
    closeMenu();
  }, { capture: true, passive: true });
  logo.addEventListener('contextmenu', event => event.preventDefault());
  logo.addEventListener('click', event => {
    // Do not allow the old delegated tab click to overwrite a gesture's result.
    event.preventDefault();
    event.stopPropagation();
    if (suppressClick) { suppressClick = false; return; }
    if (event.target.closest('[data-radar-tier-cycle]') || event.detail === 0) {
      select(tiers[(tiers.indexOf(state.currentTab) + 1) % tiers.length]);
    } else if (!tiers.includes(state.currentTab)) {
      select('all');
    }
  });
  logo.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); openMenu(true); }
  });
  menu.addEventListener('click', event => {
    const button = event.target.closest('[data-radar-tier]');
    if (!button) return;
    select(button.dataset.radarTier);
    logo.focus({ preventScroll: true });
  });
  menu.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...menu.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  });
  document.addEventListener('pointerdown', event => {
    if (press?.kind === 'pointer' && event.pointerId !== press.id) { suppressClick = true; cancelPress(); }
    if (!logo.contains(event.target) && !menu.contains(event.target)) closeMenu();
  }, { passive: true });
  document.addEventListener('touchstart', event => {
    if (event.touches.length > 1) { suppressClick = true; cancelPress(); closeMenu(); }
    if (!logo.contains(event.target) && !menu.contains(event.target)) closeMenu();
  }, { passive: true });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); closeMenu(true); }
  });
  menu.addEventListener('focusout', event => {
    if (event.relatedTarget && !menu.contains(event.relatedTarget) && event.relatedTarget !== logo) closeMenu();
  });
  for (const type of ['ox:viewchange', 'ox:marketchange', 'ox:radarvisibilitychange']) {
    document.addEventListener(type, () => { cancelPress(); closeMenu(); });
  }
  // Mobile browser chrome can resize the viewport during a stationary hold.
  window.addEventListener('resize', () => { if (!menu.hidden) positionMenu(); }, { passive: true });
  window.addEventListener('blur', () => { cancelPress(); closeMenu(); });
})();
