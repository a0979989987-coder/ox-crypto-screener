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
  function openMenu() {
    syncScannerFilterUI();
    const rect = logo.getBoundingClientRect();
    menu.hidden = false;
    const left = Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8));
    menu.style.left = `${left}px`;
    menu.style.setProperty('--radar-menu-origin-x', `${rect.left + rect.width / 2 - left}px`);
    menu.style.top = `${Math.max(8, Math.min(rect.bottom + 5, innerHeight - menu.offsetHeight - 8))}px`;
    logo.setAttribute('aria-expanded', 'true');
    menu.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
  }
  function select(tier) {
    setScannerTierFilter(tier);
    closeMenu();
  }

  logo.addEventListener('pointerdown', event => {
    cancelPress();
    suppressClick = false;
    if (!event.isPrimary || event.button !== 0) return;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY };
    timer = setTimeout(() => {
      timer = 0;
      if (!press) return;
      suppressClick = true;
      openMenu();
    }, 3000);
  }, { passive: true });
  document.addEventListener('pointermove', event => {
    if (!press || event.pointerId !== press.id) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) {
      suppressClick = true;
      cancelPress();
      closeMenu();
    }
  }, { passive: true });
  document.addEventListener('pointerup', cancelPress, { passive: true });
  document.addEventListener('pointercancel', () => {
    suppressClick = true;
    cancelPress();
    closeMenu();
  }, { passive: true });
  document.addEventListener('scroll', () => {
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
    if (event.key === 'ArrowDown') { event.preventDefault(); openMenu(); }
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
    if (press && event.pointerId !== press.id) { suppressClick = true; cancelPress(); }
    if (!logo.contains(event.target) && !menu.contains(event.target)) closeMenu();
  }, { passive: true });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); closeMenu(true); }
  });
  menu.addEventListener('focusout', event => {
    if (!menu.contains(event.relatedTarget) && event.relatedTarget !== logo) closeMenu();
  });
  for (const type of ['ox:viewchange', 'ox:marketchange', 'ox:radarvisibilitychange']) {
    document.addEventListener(type, () => { cancelPress(); closeMenu(); });
  }
  window.addEventListener('resize', () => { cancelPress(); closeMenu(); }, { passive: true });
  window.addEventListener('blur', () => { cancelPress(); closeMenu(); });
})();
