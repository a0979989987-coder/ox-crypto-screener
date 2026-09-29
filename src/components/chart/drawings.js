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
  toolbar.innerHTML = '<button type="button" data-draw="trend" aria-label="趨勢線：拖曳畫線" title="趨勢線">╱</button><button type="button" data-draw="ray" aria-label="射線：拖曳決定方向" title="射線">↗</button><button type="button" data-draw="horizontal" aria-label="水平線：點選價格" title="水平線">─</button><button type="button" data-draw="vertical" aria-label="垂直線：點選時間" title="垂直線">│</button><button type="button" data-draw="rectangle" aria-label="矩形：拖曳範圍" title="矩形">▭</button><button type="button" data-draw="fib" aria-label="斐波那契回撤：拖曳高低點" title="斐波那契回撤">Φ</button><button type="button" data-draw="undo" aria-label="復原上一條畫線" title="復原上一條">↶</button>';
  box.append(toolbar);
  const layer = document.createElement('canvas');
  layer.className = 'chart-drawing-layer';
  layer.setAttribute('aria-label', '圖表畫線區');
  chartEl.append(layer);
  let tool = null;
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
    if (!expanded()) tool = null;
    toolbar.querySelectorAll('[data-draw]:not([data-draw="undo"])').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.draw === tool)));
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
    for (const item of current()) drawLine(ctx, item);
    if (preview) { ctx.globalAlpha = .7; drawLine(ctx, preview); ctx.globalAlpha = 1; }
  }
  toolbar.addEventListener('click', event => {
    const button = event.target.closest('[data-draw]');
    if (!button || !expanded()) return;
    const action = button.dataset.draw;
    if (action === 'undo') { current().pop(); save(); preview = null; }
    else tool = tool === action ? null : action;
    sync();
  });
  layer.addEventListener('pointerdown', event => {
    if (!tool || !expanded() || pointer != null || event.button > 0) return;
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
