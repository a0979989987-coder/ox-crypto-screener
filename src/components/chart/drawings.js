/* Drawings belong to the existing crypto chart. Editing is available only while expanded. */
(() => {
  'use strict';
  const box = document.querySelector('#view-radar .chart-box');
  const chartEl = document.getElementById('chart');
  if (!box || !chartEl) return;
  const key = 'ox-chart-drawings-v1';
  let drawings = {};
  try { drawings = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (_) {}
  const toolbar = document.createElement('div');
  toolbar.className = 'chart-drawing-tools';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', '圖表畫線工具');
  toolbar.innerHTML = `
    <button type="button" data-action="menu" aria-label="選擇畫線工具" aria-haspopup="true" aria-expanded="false" title="畫線工具">╱<small>▾</small></button>
    <div class="drawing-tool-menu" role="menu" hidden>
      <span>線條</span>
      <button type="button" role="menuitem" data-draw="trend">趨勢線</button>
      <button type="button" role="menuitem" data-draw="ray">射線</button>
      <button type="button" role="menuitem" data-draw="horizontal">水平線</button>
      <button type="button" role="menuitem" data-draw="vertical">垂直線</button>
      <span>圖形與測量</span>
      <button type="button" role="menuitem" data-draw="rectangle">矩形</button>
      <button type="button" role="menuitem" data-draw="fib">斐波那契回撤</button>
    </div>
    <button type="button" data-action="select" aria-label="選取畫線" title="選取畫線">⌖</button>
    <button type="button" data-action="delete" aria-label="刪除所選畫線" title="刪除所選畫線" hidden>⌫</button>
    <button type="button" data-action="undo" aria-label="復原上一條畫線" title="復原上一條">↶</button>`;
  box.append(toolbar);
  const layer = document.createElement('canvas');
  layer.className = 'chart-drawing-layer';
  layer.setAttribute('aria-label', '圖表畫線區');
  chartEl.append(layer);
  let tool = null;
  let selected = null;
  let menuOpen = false;
  let preview = null;
  let pointer = null;
  let raf = 0;
  let width = 0;
  let height = 0;
  const expanded = () => document.body.classList.contains('chart-focus') || document.fullscreenElement === box || document.webkitFullscreenElement === box;
  const scope = () => `${state.symbol}:${state.period}`;
  const current = () => Array.isArray(drawings[scope()]) ? drawings[scope()] : [];
  const save = () => { try { localStorage.setItem(key, JSON.stringify(drawings)); } catch (_) {} };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };
  function sync() {
    if (!expanded()) { tool = null; selected = null; menuOpen = false; }
    if (selected && !current().includes(selected)) selected = null;
    const menu = toolbar.querySelector('.drawing-tool-menu');
    menu.hidden = !menuOpen;
    toolbar.querySelector('[data-action="menu"]').setAttribute('aria-expanded', String(menuOpen));
    toolbar.querySelector('[data-action="menu"]').setAttribute('aria-pressed', String(!!tool && tool !== 'select'));
    toolbar.querySelector('[data-action="select"]').setAttribute('aria-pressed', String(tool === 'select'));
    toolbar.querySelector('[data-action="delete"]').hidden = !selected;
    toolbar.querySelectorAll('[data-draw]').forEach(button => button.setAttribute('aria-current', String(button.dataset.draw === tool)));
    layer.classList.toggle('is-editing', !!tool && expanded());
    if (!expanded()) preview = null;
    schedule();
  }
  function plotSize() {
    return {
      w: Math.max(0, chartEl.clientWidth - (state.chart?.priceScale('right').width?.() || 0)),
      h: Math.max(0, chartEl.clientHeight - (state.chart?.timeScale().height?.() || 0))
    };
  }
  function anchor(event) {
    const rect = layer.getBoundingClientRect();
    const x = Math.max(0, Math.min(width - 1, event.clientX - rect.left));
    const y = Math.max(0, Math.min(height - 1, event.clientY - rect.top));
    const time = state.chart?.timeScale().coordinateToTime(x) ?? state.candleData?.at(-1)?.time;
    const price = state.candleSeries?.coordinateToPrice(y);
    return time != null && Number.isFinite(price) ? { time, price } : null;
  }
  function drawLine(ctx, item) {
    const y1 = state.candleSeries.priceToCoordinate(item.a.price);
    const x1 = item.type === 'horizontal' ? 0 : state.chart.timeScale().timeToCoordinate(item.a.time);
    const y2 = item.type === 'horizontal' ? y1 : state.candleSeries.priceToCoordinate(item.b.price);
    const x2 = item.type === 'horizontal' ? width : state.chart.timeScale().timeToCoordinate(item.b.time);
    if (![x1, y1, x2, y2].every(Number.isFinite)) return;
    if (item.type === 'vertical') { ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, height); ctx.stroke(); return; }
    if (item.type === 'rectangle') {
      ctx.fillStyle = document.body.classList.contains('theme-light') ? '#27364020' : '#f3f1e91c';
      ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      ctx.fillStyle = ctx.strokeStyle;
      return;
    }
    if (item.type === 'fib') {
      ctx.save(); ctx.font = '10px system-ui'; ctx.textAlign = 'right';
      for (const level of [0, .236, .382, .5, .618, .786, 1]) {
        const y = y1 + (y2 - y1) * level;
        ctx.beginPath(); ctx.moveTo(Math.min(x1, x2), y); ctx.lineTo(Math.max(x1, x2), y); ctx.stroke();
        ctx.fillText(`${(level * 100).toFixed(1)}%`, Math.max(x1, x2) - 3, y - 3);
      }
      ctx.restore(); return;
    }
    if (item.type === 'ray' && Math.abs(x2 - x1) > 1) {
      const endX = x2 > x1 ? width : 0;
      const endY = y1 + (y2 - y1) * (endX - x1) / (x2 - x1);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(endX, endY); ctx.stroke();
      return;
    }
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    if (item.type !== 'horizontal') for (const [x, y] of [[x1, y1], [x2, y2]]) {
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    }
  }
  function segmentDistance(x, y, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - x1 - t * dx, y - y1 - t * dy);
  }
  function distanceToDrawing(item, x, y) {
    const y1 = state.candleSeries.priceToCoordinate(item.a.price);
    if (item.type === 'horizontal') return Number.isFinite(y1) ? Math.abs(y - y1) : Infinity;
    const x1 = state.chart.timeScale().timeToCoordinate(item.a.time);
    if (item.type === 'vertical') return Number.isFinite(x1) ? Math.abs(x - x1) : Infinity;
    const x2 = state.chart.timeScale().timeToCoordinate(item.b.time);
    const y2 = state.candleSeries.priceToCoordinate(item.b.price);
    if (![x1, x2, y1, y2].every(Number.isFinite)) return Infinity;
    if (item.type === 'rectangle' || item.type === 'fib') {
      const left = Math.min(x1, x2), right = Math.max(x1, x2);
      const top = Math.min(y1, y2), bottom = Math.max(y1, y2);
      if (item.type === 'fib') return x >= left && x <= right ? Math.min(...[0,.236,.382,.5,.618,.786,1].map(level => Math.abs(y - (y1 + (y2 - y1) * level)))) : Infinity;
      if (x >= left && x <= right && y >= top && y <= bottom) return 0;
      return Math.min(segmentDistance(x,y,left,top,right,top),segmentDistance(x,y,left,bottom,right,bottom),segmentDistance(x,y,left,top,left,bottom),segmentDistance(x,y,right,top,right,bottom));
    }
    if (item.type === 'ray' && Math.abs(x2 - x1) > 1) {
      const endX = x2 > x1 ? width : 0;
      return segmentDistance(x,y,x1,y1,endX,y1+(y2-y1)*(endX-x1)/(x2-x1));
    }
    return segmentDistance(x,y,x1,y1,x2,y2);
  }
  function selectAt(event) {
    const rect = layer.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    const tolerance = window.matchMedia('(max-width:900px)').matches ? 18 : 11;
    let closest = null, distance = tolerance;
    for (const item of [...current()].reverse()) {
      const d = distanceToDrawing(item,x,y);
      if (d <= distance) { closest = item; distance = d; }
    }
    selected = closest;
    sync();
  }
  function draw() {
    raf = 0;
    if (!state.chart || !state.candleSeries) return;
    const size = plotSize();
    width = size.w; height = size.h;
    layer.style.width = `${width}px`;
    layer.style.height = `${height}px`;
    const dpr = window.devicePixelRatio || 1;
    const pxW = Math.round(width * dpr), pxH = Math.round(height * dpr);
    if (layer.width !== pxW || layer.height !== pxH) { layer.width = pxW; layer.height = pxH; }
    const ctx = layer.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const light = document.body.classList.contains('theme-light');
    ctx.strokeStyle = light ? '#273640' : '#f3f1e9'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.5;
    ctx.shadowColor = light ? '#627788' : '#fff'; ctx.shadowBlur = 4;
    for (const item of current()) {
      ctx.save();
      if (item === selected) { ctx.lineWidth = 2.8; ctx.shadowBlur = 10; }
      drawLine(ctx, item);
      ctx.restore();
    }
    if (preview) { ctx.globalAlpha = .7; drawLine(ctx, preview); ctx.globalAlpha = 1; }
  }
  toolbar.addEventListener('click', event => {
    const button = event.target.closest('[data-draw], [data-action]');
    if (!button || !expanded()) return;
    const action = button.dataset.action || button.dataset.draw;
    if (action === 'menu') menuOpen = !menuOpen;
    else if (action === 'select') { tool = tool === 'select' ? null : 'select'; menuOpen = false; }
    else if (action === 'undo') { const removed = current().pop(); if (removed === selected) selected = null; save(); preview = null; menuOpen = false; }
    else if (action === 'delete') {
      const index = current().indexOf(selected);
      if (index >= 0) { current().splice(index,1); save(); }
      selected = null; menuOpen = false;
    } else { tool = action; selected = null; menuOpen = false; }
    sync();
  });
  document.addEventListener('pointerdown', event => {
    if (menuOpen && !toolbar.contains(event.target)) { menuOpen = false; sync(); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && expanded()) { menuOpen = false; selected = null; sync(); }
    if ((event.key === 'Delete' || event.key === 'Backspace') && expanded() && selected && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
      const index = current().indexOf(selected);
      if (index >= 0) { current().splice(index,1); save(); }
      selected = null; sync(); event.preventDefault();
    }
  });
  layer.addEventListener('pointerdown', event => {
    if (!tool || !expanded() || pointer != null || event.button > 0) return;
    if (tool === 'select') { selectAt(event); event.preventDefault(); return; }
    const a = anchor(event);
    if (!a) return;
    pointer = event.pointerId;
    preview = { type: tool, a, b: a };
    layer.setPointerCapture(pointer);
    schedule();
    event.preventDefault();
  });
  layer.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer || !preview) return;
    preview.b = anchor(event) || preview.b;
    schedule();
  });
  function finish(event) {
    if (event.pointerId !== pointer || !preview) return;
    if (event.type !== 'pointercancel') {
      preview.b = anchor(event) || preview.b;
      if (['horizontal', 'vertical'].includes(preview.type) || preview.a.time !== preview.b.time || Math.abs(preview.a.price - preview.b.price) > 0) {
        drawings[scope()] ||= [];
        drawings[scope()].push(preview);
        save();
      }
    }
    pointer = null; preview = null; schedule();
  }
  layer.addEventListener('pointerup', finish);
  layer.addEventListener('pointercancel', finish);
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  document.addEventListener('ox:marketchange', sync);
  document.addEventListener('ox:chartpriceview', schedule);
  window.addEventListener('resize', schedule, { passive: true });
  chartEl.addEventListener('pointermove', schedule, { passive: true });
  chartEl.addEventListener('touchmove', schedule, { passive: true });
  chartEl.addEventListener('wheel', schedule, { passive: true });
  new ResizeObserver(schedule).observe(chartEl);
  const bind = () => {
    if (!state.chart) { setTimeout(bind, 50); return; }
    state.chart.timeScale().subscribeVisibleLogicalRangeChange(schedule);
    document.addEventListener('ox:chartdata', schedule);
    sync();
  };
  bind();
})();
