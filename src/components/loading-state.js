// Track actual foreground work; item counts are supplied by the data pipeline.
(() => {
  const tasks = new Map();
  const css = `.ox-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;color:#dcded7;font:11px/1.4 Inter,system-ui,sans-serif;text-align:center}.ox-loading-ring{display:block;width:18px;height:18px;border:2px solid #ffffff24;border-top-color:#eceee8;border-radius:50%;animation:ox-loading-turn .85s linear infinite}.ox-loading-count{font-size:10px;font-variant-numeric:tabular-nums;color:#b5beb8}.ox-loading-label{max-width:190px}.ox-data-loading{position:fixed;z-index:80;top:calc(54px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);padding:9px 13px;border:1px solid #ffffff45;border-radius:12px;background:#14191bee;box-shadow:0 0 5px #fff2;pointer-events:none}.ox-data-loading[hidden],.ox-tool-loading[hidden]{display:none}.ox-tool-loading{min-height:220px;display:grid;place-items:center}@keyframes ox-loading-turn{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.ox-loading-ring{animation-duration:2s}}`;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const markup = (label = '資料載入中', done, total) => `<span class="ox-loading" role="status"><i class="ox-loading-ring" aria-hidden="true"></i>${Number.isFinite(total) && total > 0 ? `<span class="ox-loading-count">${Math.max(0, Math.min(total, done || 0))}/${total}</span>` : ''}<span class="ox-loading-label">${escape(label)}</span></span>`;
  const style = document.createElement('style'); style.textContent = css; document.head.append(style);
  let panel, timer;
  function paint() {
    if (!document.body) return;
    if (!panel) { panel = document.createElement('div'); panel.className = 'ox-data-loading'; panel.hidden = true; document.body.append(panel); }
    const market = document.body.dataset.market || 'crypto', view = document.body.dataset.view || 'radar';
    const task = [...tasks.values()].filter(t => t.market === market && (!t.views || t.views.includes(view))).sort((a,b) => Number(Boolean(b.total)) - Number(Boolean(a.total)) || b.at-a.at)[0];
    panel.hidden = !task;
    if (task) panel.innerHTML = markup(task.label, task.done, task.total);
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(paint, 100); }
  window.OXLoading = Object.freeze({ css, markup,
    begin(market, label, options = {}) {
      const token = Symbol(label), task = { market, label, at: Date.now(), ...options };
      tasks.set(token, task); schedule();
      const finish = () => { tasks.delete(token); options.signal?.removeEventListener('abort',finish);schedule(); };
      if (options.signal) { if (options.signal.aborted) finish(); else options.signal.addEventListener('abort', finish, {once:true}); }
      return { update(done,total) { if (tasks.has(token)) { task.done=done; task.total=total; schedule(); } }, finish };
    }
  });
  document.addEventListener('DOMContentLoaded', paint, {once:true});
  document.addEventListener('ox:marketchange', paint);
  document.addEventListener('ox:viewchange', paint);
})();
