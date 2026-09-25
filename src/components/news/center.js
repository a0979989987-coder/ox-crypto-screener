(() => {
  'use strict';
  const MARKET_NAMES = { crypto: '加密', us: '美股', tw: '台股', forex: '外匯' };
  const SOURCE_NAMES = { fed: '美國聯準會', 'bls-cpi': '美國勞工統計局・物價', 'bls-jobs': '美國勞工統計局・就業', 'bls-calendar': '美國勞工統計局・行事曆', ecb: '歐洲央行', sec: '美國證券交易委員會', ethereum: '以太坊基金會', cftc: '美國商品期貨交易委員會', 'bitcoin-core': '比特幣核心開發團隊', kraken: 'Kraken 交易所', aptos: 'Aptos 基金會' };
  const sourceName = item => SOURCE_NAMES[item.sourceId || item.id] || '官方來源';
  const titleName = item => item.titleZh || '官方消息（繁體中文翻譯待補）';
  const TABS = { overview: '總覽', latest: '快訊', calendar: '行事曆', moves: '異動', following: '追蹤' };
  const SAVED_KEY = 'ox-news-preferences-v1';
  const state = { snapshot: null, lastError: null, pending: null, tab: 'overview', previous: null, request: 0, optionsOpen: false, marketFilter: '', sourceFilter: '', unreadOnly: false, category: 'news', limit: 12, calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1), calendarDate: null };
  const store = () => { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '{}'); } catch { return {}; } };
  const save = patch => localStorage.setItem(SAVED_KEY, JSON.stringify({ ...store(), ...patch }));
  const fmt = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '時間待確認';
  const el = (tag, className, content) => { const node = document.createElement(tag); if (className) node.className = className; if (content != null) node.textContent = content; return node; };
  const currentMarket = () => MARKET_NAMES[document.body.dataset.market] ? document.body.dataset.market : 'crypto';
  const normalized = data => data && data.schemaVersion === 1 && Array.isArray(data.news) && Array.isArray(data.events);
  const dayKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const eventDay = item => item.status === 'date-only' && item.date ? item.date : item.occursAt ? dayKey(new Date(item.occursAt)) : null;
  function unlockCountdown(item, now = new Date()) {
    if (item.status === 'date-only' && /^\d{4}-\d{2}-\d{2}$/.test(item.date || '')) {
      const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      const days = Math.round((Date.parse(`${item.date}T00:00:00Z`) - today) / 86400000);
      return Number.isFinite(days) && days >= 0 ? `距官方預估日期 ${days} 天・時間待公布` : '預估日期已過，待官方更新';
    }
    if (item.status !== 'confirmed' || !item.occursAt || !Number.isFinite(Date.parse(item.occursAt))) return '解鎖時間待官方確認';
    const seconds = Math.max(0, Math.floor((Date.parse(item.occursAt) - now.getTime()) / 1000));
    if (!seconds) return '預定時間已到，待官方確認實際解鎖';
    return `倒數 ${Math.floor(seconds / 86400)} 天 ${String(Math.floor(seconds / 3600) % 24).padStart(2,'0')}:${String(Math.floor(seconds / 60) % 60).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
  }
  let countdownTimer = null;
  function syncCountdownTimer() {
    clearInterval(countdownTimer); countdownTimer = null;
    if (document.querySelector('.app-view.active .ox-unlock-countdown[data-exact="1"]')) {
      countdownTimer = setInterval(() => document.querySelectorAll('.app-view.active .ox-unlock-countdown[data-exact="1"]').forEach(node => {
        const item = state.snapshot?.events.find(event => event.id === node.dataset.eventId);
        if (item) node.textContent = unlockCountdown(item);
      }), 1000);
    }
  }

  function refresh(force = false) {
    if (state.pending) return state.pending;
    if (state.snapshot && !force) return Promise.resolve(state.snapshot);
    const request = ++state.request;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    state.pending = fetch(`data/news.json${force ? `?t=${Date.now()}` : ''}`, { signal: controller.signal, cache: force ? 'reload' : 'default' })
      .then(async response => { if (!response.ok) throw Error(`HTTP ${response.status}`); const data = await response.json(); if (!normalized(data)) throw Error('新聞資料格式不正確'); return data; })
      .then(data => { if (request === state.request) { state.snapshot = data; state.lastError = null; render(); } return data; })
      .catch(error => { if (request === state.request) { state.lastError = error; render(); } return state.snapshot; })
      .finally(() => { clearTimeout(timeout); state.pending = null; });
    return state.pending;
  }

  function score(item) {
    const value = item?.impact?.stars;
    return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
  }
  function filtered(kind, market, onlyFollowing = false) {
    const prefs = store();
    const hidden = new Set(prefs.hidden || []);
    const read = new Set(prefs.read || []);
    const sources = new Set(prefs.mutedSources || []);
    let items = (kind === 'event' ? state.snapshot?.events : state.snapshot?.news) || [];
    const selectedMarket = market || (document.body.dataset.newsMode === '1' ? state.marketFilter : '');
    items = items.filter(item => (!selectedMarket || item.markets?.includes(selectedMarket)) && (!state.sourceFilter || item.sourceId === state.sourceFilter) && !hidden.has(item.id) && !sources.has(item.sourceId) && (!state.unreadOnly || !read.has(item.id)));
    if (onlyFollowing) items = items.filter(item => (prefs.followedSources || []).includes(item.sourceId));
    if (kind === 'news' && prefs.majorOnly === true) items = items.filter(item => (score(item) ?? 0) >= 3);
    if (prefs.minimumStars) items = items.filter(item => (score(item) ?? 0) >= Number(prefs.minimumStars));
    if (kind === 'event') { const now = new Date(); const localDay = dayKey(now); items = [...items].filter(item => item.status === 'date-only' && item.date ? item.date >= localDay : Date.parse(item.occursAt) >= now.getTime()).sort((a,b) => (a.occursAt || a.date).localeCompare(b.occursAt || b.date)); }
    else if (prefs.sort === 'impact' && kind === 'news') items = [...items].sort((a,b) => (score(b) ?? 0) - (score(a) ?? 0) || b.publishedAt.localeCompare(a.publishedAt));
    else items = [...items].sort((a,b) => (b.occursAt || b.publishedAt || '').localeCompare(a.occursAt || a.publishedAt || ''));
    return items;
  }

  function card(item) {
    const article = el('article', 'ox-news-card');
    const symbol = { fed: '央', 'bls-cpi': '物', 'bls-jobs': '職', 'bls-calendar': '曆', ecb: '歐', sec: '證', ethereum: '鏈', cftc: '監', 'bitcoin-core': '₿', kraken: 'K', aptos: 'A' }[item.sourceId] || '訊';
    const visual = el('span', `ox-news-visual ox-news-visual-${item.sourceId}`, symbol);
    visual.setAttribute('aria-hidden', 'true');
    article.append(visual);
    const prefs = store();
    const meta = el('div', 'ox-news-meta');
    meta.append(el('span', 'ox-news-source', sourceName(item)), el('time', '', item.status === 'date-only' && item.date ? `${item.date}・時間待公布` : fmt(item.occursAt || item.publishedAt)));
    const stars = score(item);
    if (stars >= 4) meta.append(el('span', 'ox-news-major', item.sourceId === 'fed' ? '重大政策' : '重大數據'));
    meta.append(el('span', stars ? 'ox-news-impact' : 'ox-news-unrated', stars ? `${'★'.repeat(stars)}${'☆'.repeat(5-stars)}` : '待評估'));
    article.append(meta, el('h3', '', titleName(item)));
    const detail = el('p', 'ox-news-detail', `${(item.markets || []).map(m => MARKET_NAMES[m]).filter(Boolean).join(' · ')} · ${item.kind === 'token-unlock' ? '官方預估排程，實際日期可能調整' : item.kind === 'event' ? '官方預定時間' : '官方標題繁體中文翻譯'}`);
    article.append(detail);
    if (item.kind === 'token-unlock') {
      const countdown = el('p', 'ox-unlock-countdown', unlockCountdown(item));
      countdown.dataset.eventId = item.id;
      if (item.status === 'confirmed' && item.occursAt) countdown.dataset.exact = '1';
      article.append(countdown);
    }
    if (state.snapshot?.sources?.some(source => source.id === item.sourceId && source.status === 'error') || (item.sourceId === 'bls-calendar' && state.snapshot?.sources?.some(source => source.id === 'bls-calendar' && source.status === 'error')))
      article.append(el('p', 'ox-news-status', '來源更新失敗 · 保留前次快照'));
    const reason = el('p', 'ox-news-reason', item.impact?.reason || '影響力尚待評估');
    article.append(reason);
    const actions = el('div', 'ox-news-actions');
    const link = el('a', '', '查看來源 ↗'); link.href = item.link; link.target = '_blank'; link.rel = 'noopener noreferrer'; actions.append(link);
    const hide = el('button', '', '隱藏'); hide.type = 'button'; hide.setAttribute('aria-label', `隱藏：${titleName(item)}`);
    hide.addEventListener('click', () => { save({ hidden: [...new Set([...(store().hidden || []), item.id])] }); render(); });
    actions.append(hide);
    const read = el('button', '', (prefs.read || []).includes(item.id) ? '標為未讀' : '標為已讀'); read.type = 'button';
    read.addEventListener('click', () => { const set = new Set(store().read || []); set.has(item.id) ? set.delete(item.id) : set.add(item.id); save({ read: [...set] }); render(); });
    actions.append(read);
    const follow = el('button', '', (prefs.followedSources || []).includes(item.sourceId) ? '已追蹤來源' : '追蹤來源'); follow.type = 'button';
    follow.addEventListener('click', () => { const set = new Set(store().followedSources || []); set.has(item.sourceId) ? set.delete(item.sourceId) : set.add(item.sourceId); save({ followedSources: [...set] }); render(); });
    actions.append(follow);
    article.append(actions);
    if ((prefs.read || []).includes(item.id)) article.classList.add('is-read');
    return article;
  }

  function controls(surface, isAll) {
    const wrap = el('div', 'ox-news-controls');
    if (!isAll) {
      const tabs = el('div', 'ox-news-tabs');
      for (const [id, name] of Object.entries(TABS)) {
        const button = el('button', state.tab === id ? 'active' : '', name); button.type = 'button'; button.setAttribute('aria-pressed', String(state.tab === id));
        button.addEventListener('click', () => { state.tab = id; state.limit = 12; render(); }); tabs.append(button);
      }
      wrap.append(tabs);
    }
    const row = el('div', 'ox-news-control-row');
    const prefs = store();
    const major = el('button', 'ox-news-filter', prefs.majorOnly === true ? '僅重大' : '全部新聞'); major.type = 'button'; major.setAttribute('aria-pressed', String(prefs.majorOnly === true));
    major.addEventListener('click', () => { save({ majorOnly: prefs.majorOnly !== true }); render(); }); row.append(major);
    const options = el('button', 'ox-news-filter', '排序與篩選'); options.type = 'button'; options.setAttribute('aria-expanded', 'false'); row.append(options);
    const reload = el('button', 'ox-news-filter', '更新'); reload.type = 'button'; reload.setAttribute('aria-label', '重新讀取新聞快照'); reload.addEventListener('click', () => refresh(true)); row.append(reload);
    if (!isAll && currentMarket() === 'crypto') {
      const unlock = el('button', 'ox-news-filter', state.category === 'unlocks' ? '解鎖 ✓' : '幣種解鎖'); unlock.type = 'button'; unlock.setAttribute('aria-pressed', String(state.category === 'unlocks'));
      unlock.addEventListener('click', () => { state.category = state.category === 'unlocks' ? 'news' : 'unlocks'; render(); }); row.append(unlock);
    }
    wrap.append(row);
    const panel = el('div', 'ox-news-options'); panel.hidden = !state.optionsOpen;
    options.setAttribute('aria-expanded', String(state.optionsOpen));
    options.addEventListener('click', () => { state.optionsOpen = !state.optionsOpen; panel.hidden = !state.optionsOpen; options.setAttribute('aria-expanded', String(state.optionsOpen)); });
    if (isAll) {
      const market = el('select'); market.setAttribute('aria-label', '篩選市場');
      for (const [value, label] of [['', '全部市場'], ...Object.entries(MARKET_NAMES)]) { const o = el('option', '', label); o.value = value; market.append(o); }
      market.value = state.marketFilter; market.addEventListener('change', () => { state.marketFilter = market.value; render(); }); panel.append(market);
    }
    const source = el('select'); source.setAttribute('aria-label', '篩選來源');
    for (const [value, label] of [['', '全部來源'], ...[...new Map([...(state.snapshot?.news || []), ...(state.snapshot?.events || [])].map(item => [item.sourceId, [item.sourceId, sourceName(item)]])).values()]]) { const o = el('option', '', label); o.value = value; source.append(o); }
    source.value = state.sourceFilter; source.addEventListener('change', () => { state.sourceFilter = source.value; render(); }); panel.append(source);
    const unread = el('button', '', state.unreadOnly ? '僅未讀 ✓' : '全部閱讀狀態'); unread.type = 'button'; unread.setAttribute('aria-pressed', String(state.unreadOnly));
    unread.addEventListener('click', () => { state.unreadOnly = !state.unreadOnly; render(); }); panel.append(unread);
    const sort = el('select'); sort.setAttribute('aria-label', '新聞排序');
    for (const [value, label] of [['latest','最新'],['impact','重要性']]) { const o = el('option', '', label); o.value = value; sort.append(o); } sort.value = prefs.sort || 'latest'; sort.addEventListener('change', () => { save({ sort: sort.value }); render(); });
    const min = el('select'); min.setAttribute('aria-label', '最低影響星級');
    for (const [value, label] of [['','不限制星級'],['3','至少三星'],['4','至少四星'],['5','五星']]) { const o = el('option', '', label); o.value = value; min.append(o); } min.value = prefs.minimumStars || ''; min.addEventListener('change', () => { save({ minimumStars: min.value }); render(); });
    const restore = el('button', '', '恢復隱藏新聞'); restore.type = 'button'; restore.addEventListener('click', () => { save({ hidden: [], mutedSources: [] }); render(); });
    panel.append(sort, min, restore); wrap.append(panel);
    surface.append(wrap);
  }

  function miniCalendar(events) {
    const month = state.calendarMonth;
    const year = month.getFullYear(), index = month.getMonth();
    const counts = new Map();
    events.forEach(item => { const day = eventDay(item); if (day) counts.set(day, (counts.get(day) || 0) + 1); });
    const box = el('section', 'ox-mini-calendar'); box.setAttribute('aria-label', '事件月份日曆');
    const toolbar = el('div', 'ox-mini-calendar-toolbar');
    const prev = el('button', '', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', '上個月');
    const next = el('button', '', '›'); next.type = 'button'; next.setAttribute('aria-label', '下個月');
    const title = el('strong', '', `${year} 年 ${index+1} 月`);
    prev.addEventListener('click', () => { state.calendarMonth = new Date(year, index-1, 1); state.calendarDate = null; render(); });
    next.addEventListener('click', () => { state.calendarMonth = new Date(year, index+1, 1); state.calendarDate = null; render(); });
    toolbar.append(prev, title, next); box.append(toolbar);
    const grid = el('div', 'ox-mini-calendar-grid');
    ['一','二','三','四','五','六','日'].forEach(label => grid.append(el('span', 'ox-mini-weekday', label)));
    const offset = (new Date(year, index, 1).getDay() + 6) % 7;
    for (let i=0; i<offset; i++) grid.append(el('span', 'ox-mini-spacer'));
    const today = dayKey(new Date());
    for (let day=1, last=new Date(year,index+1,0).getDate(); day<=last; day++) {
      const key = dayKey(new Date(year,index,day));
      const button = el('button', 'ox-mini-day', String(day)); button.type = 'button';
      if (counts.has(key)) button.classList.add('has-event');
      if (key === today) button.classList.add('is-today');
      if (key === state.calendarDate) button.classList.add('is-selected');
      button.setAttribute('aria-label', `${year} 年 ${index+1} 月 ${day} 日，${counts.get(key) || 0} 個事件`);
      button.setAttribute('aria-pressed', String(key === state.calendarDate));
      button.addEventListener('click', () => { state.calendarDate = state.calendarDate === key ? null : key; render(); });
      grid.append(button);
    }
    box.append(grid);
    if (state.calendarDate) { const clear = el('button', 'ox-mini-calendar-clear', '顯示全部日期'); clear.type = 'button'; clear.addEventListener('click', () => { state.calendarDate = null; render(); }); box.append(clear); }
    return box;
  }

  function renderSurface(surface, market) {
    const isAll = !market;
    surface.replaceChildren();
    controls(surface, isAll);
    const snapshot = state.snapshot;
    const status = el('p', 'ox-news-status');
    if (state.pending && !snapshot) status.textContent = '讀取官方新聞快照中…';
    else if (state.lastError) status.textContent = snapshot ? '資料更新失敗，保留前次資料' : '新聞目前無法讀取，請稍後重試';
    else if (snapshot) status.textContent = `資料快照：${fmt(snapshot.generatedAt)} · 定時收集的官方來源，非即時新聞`;
    else status.textContent = '等待新聞資料';
    surface.append(status);
    if (!snapshot) return;
    if (!isAll && market === 'crypto' && state.category === 'unlocks') {
      const unlocks = snapshot.events.filter(item => item.kind === 'token-unlock' && item.sourceUrl && (item.date || item.occursAt));
      surface.append(el('h2', 'ox-news-section-title', '幣種解鎖倒數'));
      if (!unlocks.length) surface.append(el('p', 'ox-news-empty', '目前尚無可核實的官方解鎖日期。'));
      else { const list = el('div','ox-news-list'); unlocks.forEach(item => list.append(card(item))); surface.append(list); }
      syncCountdownTimer();
      return;
    }
    const tab = state.tab;
    if (tab === 'moves') {
      surface.append(el('div', 'ox-news-empty', '目前尚無可核實的跨市場異動與原因對照資料。行情異動不會被當成已確認的新聞原因。'));
      return;
    }
    const add = (title, items, limit) => {
      surface.append(el('h2', 'ox-news-section-title', title));
      if (!items.length) { surface.append(el('p', 'ox-news-empty', store().majorOnly === true ? '目前沒有已核實影響星級的消息；可切回全部新聞查看官方標題。' : '目前沒有符合條件的官方來源資料。')); return; }
      const section = el('div', 'ox-news-list'); items.slice(0, limit).forEach(item => section.append(card(item))); surface.append(section);
      if (items.length > limit) {
        const more = el('button', 'ox-news-more', `載入更多（尚有 ${items.length - limit} 則）`); more.type = 'button';
        more.addEventListener('click', () => { state.limit += 12; render(); }); surface.append(more);
      }
    };
    if (tab === 'overview') {
      add('近期官方消息', filtered('news', market), state.limit);
      add('即將公布', filtered('event', market), 8);
    } else if (tab === 'calendar') {
      const events = filtered('event', market);
      surface.append(miniCalendar(events));
      add(state.calendarDate ? `${state.calendarDate} · 官方事件` : '即將公布的官方事件', state.calendarDate ? events.filter(item => eventDay(item) === state.calendarDate) : events, state.limit);
    }
    else if (tab === 'following') add('追蹤來源', filtered('news', market, true), state.limit);
    else add('最新快訊', filtered('news', market), state.limit);
    if (snapshot.sources?.some(source => source.status === 'error')) surface.append(el('p', 'ox-news-status', `部分來源暫不可用：${snapshot.sources.filter(source => source.status === 'error').map(source => sourceName(source)).join('、')}`));
    syncCountdownTimer();
  }

  function render() {
    const market = currentMarket();
    const heading = document.getElementById('ox-data-heading'); if (heading) heading.textContent = `${MARKET_NAMES[market]} · 新聞與事件`;
    const visible = document.querySelector(`[data-news-surface="${document.body.dataset.newsMode === '1' ? 'all' : 'market'}"]`);
    if (visible && (document.querySelector('.app-view.active')?.dataset.appView === 'data' || document.body.dataset.newsMode === '1')) renderSurface(visible, document.body.dataset.newsMode === '1' ? null : market);
    document.querySelectorAll('[data-news-tab]').forEach(button => { const active = button.dataset.newsTab === state.tab; button.classList.toggle('active', active); button.setAttribute('aria-current', active ? 'page' : 'false'); });
  }

  function open({ historyEntry = true, previous = null } = {}) {
    if (document.body.dataset.newsMode !== '1') state.previous = previous || { view: document.querySelector('.app-view.active')?.dataset.appView || 'home', market: currentMarket(), scroll: window.scrollY };
    document.body.dataset.newsMode = '1'; state.tab = 'overview';
    window.switchAppView?.('news');
    if (historyEntry) history.pushState({ oxNews: true, oxPrevious: state.previous }, '', '#news');
    refresh();
    render();
  }
  function close({ useHistory = false } = {}) {
    document.body.dataset.newsMode = '0';
    const previous = state.previous;
    window.switchAppView?.(previous?.view === 'news' ? 'home' : previous?.view || 'home');
    if (previous?.market && previous.market !== currentMarket()) window.OXMarketController?.setMarket?.(previous.market);
    if (previous) requestAnimationFrame(() => window.scrollTo(0, previous.scroll || 0));
    if (useHistory && history.state?.oxNews) history.back();
  }

  document.addEventListener('click', event => {
    if (event.target.closest('[data-open-cross-news], #ox-open-news')) { event.preventDefault(); open(); document.getElementById('ox-control-close')?.click(); }
    if (event.target.closest('#ox-news-return')) { event.preventDefault(); close({ useHistory: true }); }
    const tab = event.target.closest('[data-news-tab]'); if (tab) { state.tab = tab.dataset.newsTab; state.limit = 12; render(); window.scrollTo(0,0); }
  });
  document.addEventListener('ox:marketchange', () => { if (document.body.dataset.newsMode !== '1') render(); });
  document.addEventListener('ox:viewchange', event => {
    const view = event.detail?.to;
    if (view && view !== 'news' && document.body.dataset.newsMode === '1') {
      document.body.dataset.newsMode = '0';
      history.pushState({ oxView: view }, '', location.pathname + location.search);
    }
    if (view === 'data' || view === 'news') { refresh(); render(); }
  });
  window.addEventListener('popstate', event => {
    if (event.state?.oxNews) open({ historyEntry: false, previous: event.state.oxPrevious });
    else {
      if (document.body.dataset.newsMode === '1') close();
      if (event.state?.oxView) window.switchAppView?.(event.state.oxView);
    }
  });
  window.OXNews = Object.freeze({ open, close, refresh, render, unlockCountdown });
  if (location.hash === '#news') document.addEventListener('DOMContentLoaded', () => open({ historyEntry: false, previous: history.state?.oxPrevious }), { once: true });
  else render();
})();
