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
  return `<details class="twx-info"><summary aria-label="資料與計算說明">ⓘ</summary><div>TWSE／TPEx 官方盤後日資料，非即時。產業採官方分類，並非 Tide 的自訂題材板塊。<br>OX 法人估算＝各日三大法人淨買賣股數 × 各日收盤價（含自營避險）。<br>5／20 日資金圖：橫軸＝5 日累計；縱軸＝5 日日均 − 20 日日均；圈大小依 20 日淨額絕對值分級，僅納入 20 日資料齊全的產業。<br>當日價量圖：橫軸＝當日淨額；縱軸＝成分股等權漲跌幅；圈大小依當日成交額分級。<br>雙軸使用可逆的對稱壓縮刻度，保留正負與次序。細點是實際座標，連線泡泡在同一象限內避讓，未改動數據；圈有文字所需最小尺寸。泡泡內數字是當日估算金額。<br>金額前 10：按目前橫軸金額的絕對值排序。自選：以雷達收藏股票篩出所屬產業，保留完整產業成分。<br>漲潮／輪動／觀望／退潮僅用於 5／20 日資金模式；OX 的分類與計價口徑未宣稱重現 Tide 數字。</div></details>`;
}
export function statusLine(data, loading, error) {
  return `<div class="twx-status"><button class="twx-icon" type="button" data-refresh aria-label="更新資料" ${loading ? 'disabled' : ''}>↻</button>${info()}</div>`;
}
export function stockRows(rows, watched, limit = 100) {
  return rows.slice(0, limit).map(s => `<div class="twx-stock"><button type="button" class="twx-stock-name" data-stock="${escape(s.symbol)}"><strong>${escape(s.name)}</strong><small>${escape(s.symbol)} · ${escape(s.market === 'TWSE' ? '上市' : '上櫃')}</small></button><span class="twx-value ${direction(s.changePct)}"><b>${number(s.price)}</b><small>${pct(s.changePct)}</small></span><span class="twx-value ${direction(s.netTwd)}"><b>${money(s.netTwd)}</b><small>法人估算</small></span><button type="button" class="twx-star ${watched.has(s.symbol) ? 'selected' : ''}" data-watch="${escape(s.symbol)}" aria-label="收藏 ${escape(s.name)}" aria-pressed="${watched.has(s.symbol)}">${watched.has(s.symbol) ? '★' : '☆'}</button></div>`).join('');
}
