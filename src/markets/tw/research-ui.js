export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const number = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString('zh-TW', { maximumFractionDigits: digits }) : '—';
export const pct = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${number(value)}%` : '—';
export const money = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${number(value / 1e8)} 億` : '—';
export const direction = value => Number.isFinite(value) ? value > 0 ? 'up' : value < 0 ? 'down' : 'flat' : 'flat';
export function segments(id, items, active) {
  const index = Math.max(0, items.findIndex(i => i[0] === active));
  return `<div class="twx-segments" role="group" aria-label="${escape(id)}" style="--count:${items.length};--active:${index}"><i aria-hidden="true"></i>${items.map(([key, label]) => `<button type="button" data-${id}="${key}" aria-pressed="${key === active}">${label}</button>`).join('')}</div>`;
}
export function mountResearch(view) {
  const root = document.getElementById('market-unavailable-card');
  if (!root || document.body.dataset.market !== 'tw') return null;
  ['ox-tw-home-style', 'ox-tw-indicator-style'].forEach(id => document.getElementById(id)?.remove());
  if (!document.getElementById('ox-tw-research-css')) {
    const link = document.createElement('link'); link.id = 'ox-tw-research-css'; link.rel = 'stylesheet';
    link.href = new URL('./research-ui.css', import.meta.url).href; document.head.append(link);
  }
  root.classList.remove('tw-home-root', 'tw-indicator-root');
  root.classList.add(view === 'home' ? 'tw-home-root' : 'tw-indicator-root');
  root.hidden = false;
  return root;
}
export function info() {
  return `<details class="twx-info"><summary aria-label="資料與計算說明">ⓘ</summary><div>TWSE／TPEx 官方日資料，非即時。法人金額＝當日買賣超股數 × 當日收盤價，為估算值。產業採官方分類，漲跌為成分股等權平均。<br>當日圖：橫軸估算淨買超，縱軸漲跌幅，泡泡面積代表成交額。動能圖：橫軸近 5 日估算淨買超，縱軸 5 日均值減 20 日均值；僅顯示資料齊全產業。</div></details>`;
}
export function statusLine(data, loading, error) {
  return `<div class="twx-status"><span>${data?.date ? `${escape(data.date)} · 日資料` : loading ? '資料載入中' : '尚無資料'}${data?.stocks?.length && data.stocks.some(s => s.netTwd === null) ? ` · 法人 ${data.stocks.filter(s => Number.isFinite(s.netTwd)).length}/${data.stocks.length} 檔` : ''}${loading && data ? ' · 更新中' : ''}${error && data ? ' · 暫用上次資料' : ''}</span><button class="twx-icon" type="button" data-refresh aria-label="更新資料" ${loading ? 'disabled' : ''}>↻</button>${info()}</div>`;
}
export function stockRows(rows, watched, limit = 100) {
  return rows.slice(0, limit).map(s => `<div class="twx-stock"><button type="button" class="twx-stock-name" data-stock="${escape(s.symbol)}"><strong>${escape(s.name)}</strong><small>${escape(s.symbol)} · ${escape(s.market === 'TWSE' ? '上市' : '上櫃')}</small></button><span class="twx-value ${direction(s.changePct)}"><b>${number(s.price)}</b><small>${pct(s.changePct)}</small></span><span class="twx-value ${direction(s.netTwd)}"><b>${money(s.netTwd)}</b><small>法人估算</small></span><button type="button" class="twx-star ${watched.has(s.symbol) ? 'selected' : ''}" data-watch="${escape(s.symbol)}" aria-label="收藏 ${escape(s.name)}" aria-pressed="${watched.has(s.symbol)}">${watched.has(s.symbol) ? '★' : '☆'}</button></div>`).join('');
}
