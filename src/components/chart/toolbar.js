(() => {
  'use strict';
  const intervals = [
    ['1m','1 分'],['3m','3 分'],['5m','5 分'],['15m','15 分'],['30m','30 分'],
    ['1H','1 小時'],['2H','2 小時'],['4H','4 小時'],['6H','6 小時'],['8H','8 小時'],
    ['12H','12 小時'],['1D','1 日'],['3D','3 日'],['1W','1 週'],['1M','1 月']
  ];
  const defaultIntervals = ['1m','5m','15m','1H','4H','1D','1W'];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const store = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; } };
  let selectedIntervals = store('ox-chart-timeframes', defaultIntervals).filter(x => intervals.some(([id]) => id === x));
  if (!selectedIntervals.length) selectedIntervals = [...defaultIntervals];
  let filterMode = localStorage.getItem('ox-radar-filter-mode') || 'classic';
  let customFilters = store('ox-radar-custom-filters', []);
  const strip = $('#chart-timeframe-strip');
  const moreButton = $('#tf-more');
  const picker = $('#tf-picker-popover');
  const overlay = $('#chart-tools-overlay');
  const dialog = $('.chart-tools-dialog', overlay || document);
  const panels = $$('[data-chart-tools-panel]', overlay || document);
  const supported = new Map(intervals);

  function activeTf() { return $('.btn-tf.active', strip)?.dataset.tf || '1D'; }
  function addGlassMarker() {
    if (!strip) return;
    let marker = $('.tf-glass-indicator', strip);
    if (!marker) { marker = document.createElement('span'); marker.className = 'tf-glass-indicator'; marker.setAttribute('aria-hidden','true'); strip.prepend(marker); }
    const active = $('.btn-tf.active', strip);
    if (!active) return;
    const x = active.offsetLeft;
    marker.style.width = `${active.offsetWidth}px`;
    marker.style.transform = `translateX(${x}px)`;
    strip.classList.add('is-ready');
  }
  function renderTimeframes() {
    if (!strip) return;
    const current = activeTf();
    const visible = selectedIntervals.includes(current) ? selectedIntervals : [...selectedIntervals, current];
    strip.innerHTML = `${visible.map(id => `<button class="btn-tf${id === current ? ' active' : ''}" type="button" data-tf="${id}" aria-pressed="${id === current}">${id}</button>`).join('')}<span class="tf-glass-indicator" aria-hidden="true"></span>`;
    requestAnimationFrame(addGlassMarker);
  }
  function renderPicker() {
    if (!picker) return;
    picker.innerHTML = `${intervals.map(([id,label]) => `<button type="button" data-pick-tf="${id}" aria-current="${id === activeTf()}">${label}</button>`).join('')}<button type="button" class="tf-customize" data-open-timeframes>自訂時間級別…</button>`;
  }
  function renderPreferences() {
    const root = $('#chart-timeframe-preferences');
    if (!root) return;
    root.innerHTML = intervals.map(([id,label]) => `<label><input type="checkbox" value="${id}" ${selectedIntervals.includes(id)?'checked':''}><span>${label}</span></label>`).join('');
  }
  function openDialog(panel = 'indicators') {
    if (!overlay) return;
    panels.forEach(el => { el.hidden = el.dataset.chartToolsPanel !== panel; });
    overlay.classList.add('is-open'); overlay.setAttribute('aria-hidden','false');
    document.body.classList.add('chart-tools-open');
    $('#tf-picker-popover')?.setAttribute('hidden','');
    moreButton?.setAttribute('aria-expanded','false');
    dialog?.focus({preventScroll:true});
  }
  function closeDialog() {
    overlay?.classList.remove('is-open'); overlay?.setAttribute('aria-hidden','true');
    document.body.classList.remove('chart-tools-open');
    $('#chart-indicator-open')?.focus({preventScroll:true});
  }
  function setMode(mode) {
    filterMode = mode === 'custom' ? 'custom' : 'classic';
    localStorage.setItem('ox-radar-filter-mode', filterMode);
    $$('[data-filter-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filterMode === filterMode)));
    const custom = $('#chart-custom-filters'); if (custom) custom.hidden = filterMode !== 'custom';
    document.dispatchEvent(new CustomEvent('ox:radar-filter-change'));
  }
  function updateCustomFilters() {
    customFilters = $$('[data-custom-filter]:checked').map(input => input.dataset.customFilter);
    localStorage.setItem('ox-radar-custom-filters', JSON.stringify(customFilters));
    document.dispatchEvent(new CustomEvent('ox:radar-filter-change'));
  }
  function filterList(list) {
    if (filterMode !== 'custom' || !customFilters.length) return list;
    return list.filter(coin => customFilters.every(filter => {
      if (filter === 'surge') return !!(coin.isSurge || coin.volumeSurge || coin.surge);
      if (filter === 'score') return Number(coin.oxScore ?? coin.score ?? 0) >= 75;
      if (filter === 'trigger') return !!(coin.triggerActive || coin.patternTriggered || coin.hasTrigger);
      return true;
    }));
  }
  window.OXChartToolbar = {filterList, supportedIntervals: intervals.map(([id]) => id)};

  // Restore user's chart indicator choices without firing render handlers prematurely.
  const savedIndicators = store('ox-chart-indicators', null);
  if (savedIndicators) Object.entries(savedIndicators).forEach(([id, checked]) => { const input = document.getElementById(id); if (input) input.checked = !!checked; });
  const indicatorInputs = ['chk-vol','chk-ox-markers','chk-key-levels'].map(id => document.getElementById(id)).filter(Boolean);
  indicatorInputs.forEach(input => input.addEventListener('change', () => {
    localStorage.setItem('ox-chart-indicators', JSON.stringify(Object.fromEntries(indicatorInputs.map(item => [item.id,item.checked]))));
  }));

  renderTimeframes(); renderPicker(); renderPreferences();
  setMode(filterMode);
  $$('[data-custom-filter]').forEach(input => { input.checked = customFilters.includes(input.dataset.customFilter); });
  $$('[data-custom-filter]').forEach(input => input.addEventListener('change', updateCustomFilters));
  strip?.addEventListener('scroll', () => requestAnimationFrame(addGlassMarker), {passive:true});
  window.addEventListener('resize', () => requestAnimationFrame(addGlassMarker), {passive:true});
  strip?.addEventListener('click', event => {
    const button = event.target.closest('.btn-tf'); if (!button) return;
    $$('.btn-tf', strip).forEach(item => { const active = item === button; item.classList.toggle('active',active); item.setAttribute('aria-pressed',String(active)); });
    requestAnimationFrame(() => { button.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'}); addGlassMarker(); });
  });
  moreButton?.addEventListener('click', () => {
    const opening = picker.hidden;
    picker.hidden = !opening; moreButton.setAttribute('aria-expanded',String(opening));
  });
  picker?.addEventListener('click', event => {
    const pick = event.target.closest('[data-pick-tf]');
    if (pick) { const tf = pick.dataset.pickTf; const visibleButton = $(`.btn-tf[data-tf="${tf}"]`,strip); if (visibleButton) visibleButton.click(); else { selectedIntervals = [...selectedIntervals,tf]; renderTimeframes(); requestAnimationFrame(() => $(`.btn-tf[data-tf="${tf}"]`,strip)?.click()); } picker.hidden = true; moreButton.setAttribute('aria-expanded','false'); renderPicker(); return; }
    if (event.target.closest('[data-open-timeframes]')) openDialog('timeframes');
  });
  $('#chart-indicator-open')?.addEventListener('click', () => openDialog('indicators'));
  $$('[data-chart-tools-close]').forEach(button => button.addEventListener('click', closeDialog));
  overlay?.addEventListener('click', event => { if (event.target === overlay) closeDialog(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { if (overlay?.classList.contains('is-open')) closeDialog(); if (picker && !picker.hidden) { picker.hidden=true; moreButton?.setAttribute('aria-expanded','false'); } } });
  $$('[data-filter-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.filterMode)));
  $('#chart-timeframe-save')?.addEventListener('click', () => {
    const checked = $$('#chart-timeframe-preferences input:checked').map(input => input.value);
    if (!checked.length) return;
    selectedIntervals = intervals.map(([id]) => id).filter(id => checked.includes(id));
    localStorage.setItem('ox-chart-timeframes',JSON.stringify(selectedIntervals));
    renderTimeframes(); renderPicker(); closeDialog();
  });
  document.addEventListener('ox:radar-filter-change', () => {
    if (typeof renderCurrentTab === 'function') renderCurrentTab();
  });
})();
