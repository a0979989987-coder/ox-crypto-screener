import { createToolsRail } from '../strength/tools-rail.js';
import { MARKET_NAMES, CATEGORY_NAMES, MARKET_CATEGORIES, TIME_CHOICES, sourceName } from './config.js?v=20261004-markets2';
import { defaultState, taipeiDay, monthGrid, shiftMonth, eventDay, eventCategory, importance, newsBase, filterNews, hotWords, ranking, sourcesFor, coverage, safeLink, plain, agendaDays } from './model.js?v=20261003-sources1';
import { node, button, anchoredPanel, modal } from './layers.js';
const fmt = value => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', dateStyle: 'short', timeStyle: 'short', hour12: false }).format(new Date(value)) : '時間待確認';
const label = item => item.titleZh || item.title || '標題資料未提供';
const statusLabel = item => item.announcementStatus === 'cancelled' ? '已取消' : item.announcementStatus === 'estimated' || item.kind === 'token-unlock' && item.date ? '預估排程' : item.announcementStatus === 'preview' ? '預告' : item.status === 'confirmed' || item.announcementStatus === 'confirmed' ? '已公告' : '狀態待確認';
const sourceState = source => source.access === 'authorization-required' ? '需取得授權' : source.status === 'not-connected' ? '尚未接入' : source.status === 'error' ? '更新失敗' : source.lastSuccessAt && Date.now() - Date.parse(source.lastSuccessAt) > 18 * 3600000 ? '資料過期' : source.status === 'ready' && source.count === 0 ? '成功・零篇' : source.status === 'ready' ? source.access==='public-aggregated-rss'?'聚合接入':'已接入' : '尚未載入';
function link(text, url) { const safe = safeLink(url); if (!safe) return null; const a = node('a', '', text); a.href = safe; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
function fieldList(fields) { const list = node('dl', 'oxn-fields'); for (const [name, value] of fields) { list.append(node('dt', '', name), node('dd', '', value === null || value === undefined || value === '' ? '資料未提供' : plain(value))); } return list; }
export function mountNewsWorkspace(host, api) {
  const key = `ox-news-v2-${api.scope}`;
  let saved; try { saved = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch {}
  const state = { ...defaultState(), ...saved }, life = new AbortController();
  if (!Object.hasOwn(MARKET_NAMES, state.market)) state.market = 'all';
  let data = {}, panel = null, detail = null, detailKey = '', countdown = null, restorePosition = true;
  const root = node('section', 'oxn-root'); root.dataset.scope = api.scope;
  const header = node('div', 'oxn-header'), exit = button('‹', '返回先前頁面', api.exit, 'oxn-close');
  header.append(exit, node('span', 'oxn-title', api.scope === 'all' ? '新聞總頁' : `${MARKET_NAMES[api.scope]}新聞`));
  const marketChoice = button('全部市場', '篩選新聞總頁市場', () => showPanel(marketChoice, '市場', body => {
    const tags = node('div', 'oxn-tags'); for (const id of ['all', 'crypto', 'tw']) { const tag = button(id === 'all' ? '全部市場' : MARKET_NAMES[id], '', () => { state.market = id; state.sources = null; state.categories = null; persist(); renderContent(); panel.destroy(); }); tag.setAttribute('aria-pressed', String(state.market === id)); tags.append(tag); } body.append(tags);
  }), 'oxn-pill'); if (api.scope === 'all') header.append(marketChoice);
  const more = button('⋯', '閱讀偏好與快照更新', () => showPanel(more, '閱讀偏好', body => {
    const tags = node('div', 'oxn-tags'); for (const [id, text] of [['all', '全部閱讀狀態'], ['unread', '僅未讀'], ['following', '追蹤來源']]) { const b = button(text, '', () => { state.reader = id; persist(); renderContent(); [...tags.children].forEach(n => n.setAttribute('aria-pressed', String(n === b))); }); b.setAttribute('aria-pressed', String((state.reader || 'all') === id)); tags.append(b); }
    body.append(tags, button('恢復隱藏新聞／來源', '', () => { api.save({ hidden: [], mutedSources: [] }); renderContent(); }, 'oxn-action'), button('更新來源快照', '', api.refresh, 'oxn-action'), node('p', 'oxn-caption', '資料依來源快照更新，並非即時串流；重新讀取會保留最後成功資料。'));
  }), 'oxn-close oxn-more'); header.append(more);
  const rail = createToolsRail({ tabs: [['calendar', '行事曆'], ['key', '關鍵新聞']], selected: state.tab, label: '新聞內容', attribute: 'data-news-tab', equal: true,
    onSelect(tab) { state.tab = tab; persist(); panel?.destroy({ focus: false }); renderControls(); renderContent(); } }); rail.element.classList.add('oxn-tabs');
  const controls = node('div', 'oxn-controls'), notification = node('div', 'oxn-notification'), content = node('div', 'oxn-content');
  root.append(header, rail.element, controls, notification, content); host.replaceChildren(root);
  const scope = () => api.scope === 'all' ? state.market : api.scope;
  function persist() { try { sessionStorage.setItem(key, JSON.stringify(state)); } catch {} }
  function closePanel() { panel?.destroy({ focus: false }); panel = null; }
  function showPanel(anchor, title, build) { if (panel?.element.isConnected && anchor.getAttribute('aria-expanded') === 'true') { closePanel(); return; } closePanel(); panel = anchoredPanel(anchor, title, build); }
  function multi(anchor, title, property, choices, defaults = null, footer = null) {
    showPanel(anchor, title, body => {
      const tools = node('div', 'oxn-panel-actions'), tags = node('div', 'oxn-tags');
      function sync() { all.setAttribute('aria-pressed', String(state[property] === null || property === 'times' && choices.every(c => state[property]?.includes(c.id)))); [...tags.children].forEach(b => b.setAttribute('aria-pressed', String(!b.disabled && state[property]?.includes(b.dataset.value)))); anchor.classList.toggle('is-filtered', JSON.stringify(state[property]) !== JSON.stringify(defaults)); }
      const all = button('全部', '', () => { state[property] = choices.filter(c => !c.disabled).map(c => c.id); if (property !== 'times') state[property] = null; persist(); sync(); renderContent(); }, 'oxn-action');
      const none = button('清除選取', '', () => { state[property] = []; persist(); sync(); renderContent(); }, 'oxn-action');
      const reset = button('恢復預設', '', () => { state[property] = defaults; persist(); sync(); renderContent(); }, 'oxn-action'); tools.append(all, none, reset); body.append(tools);
      for (const choice of choices) { const tag = button(choice.label, '', () => { const selected = new Set(state[property] || []); selected.has(choice.id) ? selected.delete(choice.id) : selected.add(choice.id); state[property] = [...selected]; persist(); sync(); renderContent(); }, 'oxn-tag'); tag.dataset.value = choice.id; tag.disabled = Boolean(choice.disabled); if (choice.hint) { tag.append(node('small', '', choice.hint)); tag.title = choice.description || choice.hint; } tags.append(tag); }
      body.append(tags); if (footer) body.append(node('p', 'oxn-caption', footer)); sync();
    });
  }
  function renderControls() {
    controls.replaceChildren(); header.querySelector('.oxn-calendar-switch')?.remove(); controls.dataset.tab = state.tab;
    if (state.tab === 'calendar') {
      const prev = button('‹', '上個月', () => changeMonth(-1), 'oxn-close oxn-month-arrow'), next = button('›', '下個月', () => changeMonth(1), 'oxn-close oxn-month-arrow');
      const month = button(state.month.replace('-', '／'), '選擇年份月份', () => showPanel(month, '選擇年月', body => {
        const row = node('div', 'oxn-year-row'), year = node('input'); year.type = 'number'; year.inputMode = 'numeric'; year.min = '1900'; year.max = '2200'; year.value = state.month.slice(0, 4); year.setAttribute('aria-label', '年份');
        row.append(button('‹', '前一年', () => { year.value = Math.max(1900, Number(year.value) - 1); }), year, button('›', '後一年', () => { year.value = Math.min(2200, Number(year.value) + 1); })); body.append(row);
        const months = node('div', 'oxn-month-picker'); for (let m = 1; m <= 12; m++) months.append(button(`${m} 月`, '', () => { const y = Number(year.value); if (y < 1900 || y > 2200 || !Number.isInteger(y)) return; state.month = `${y}-${String(m).padStart(2, '0')}`; persist(); closePanel(); renderControls(); renderContent(); })); body.append(months);
      }), 'oxn-pill oxn-month-title');
      const viewSwitch = button('切換', state.calendarView==='agenda'?'切換為月份格':'切換為行程列表', () => { state.calendarView=state.calendarView==='agenda'?'month':'agenda'; persist(); renderControls(); renderContent(); }, 'oxn-pill');
      viewSwitch.dataset.calendarSwitch='';viewSwitch.setAttribute('aria-pressed',String(state.calendarView==='agenda'));viewSwitch.title=state.calendarView==='agenda'?'目前：行程列表':'目前：月份格';
      const events = button('事件', '多選事件類別', () => {
        const c = coverage(data.snapshot, scope(), state.month).categories;
        multi(events, '事件類別', 'categories', MARKET_CATEGORIES[scope()].map(id => ({ id, label: CATEGORY_NAMES[id], hint: c.find(i => i.category === id)?.spans.length ? '有資料・覆蓋依月份' : c.find(i => i.category === id)?.known ? '部分排程' : c.find(i => i.category === id)?.connected.length ? '已接入・依來源排程' : '尚未接入' })), null, '沒有覆蓋的類別不會填入示範事件。');
      }, 'oxn-pill'); const level = button('重要性', '多選重要性', () => multi(level, '重要性', 'importance', [{ id: '1', label: '★ 低' }, { id: '2', label: '★★ 中' }, { id: '3', label: '★★★ 高' }, { id: 'unrated', label: '未分級' }], null, '舊制 1–2 星→低、3 星→中、4–5 星→高。保留原始值與來源，星級不代表漲跌。'), 'oxn-pill');
      events.classList.toggle('is-filtered', state.categories !== null); level.classList.toggle('is-filtered', state.importance !== null);
      const monthNav = node('div', 'oxn-month-nav'); monthNav.append(prev, month, next);
      viewSwitch.classList.add('oxn-calendar-switch');
      controls.append(monthNav, viewSwitch, events, level);
    } else {
      const time = button('時間', '多選新聞時間', () => multi(time, '時間', 'times', TIME_CHOICES.map(([id, text]) => ({ id, label: text })), ['24'], '時間採聯集並去重，依發布時間篩選。'), 'oxn-pill');
      const source = button('來源', '多選新聞來源', () => {
        const available = sourcesFor(data.snapshot, scope()).filter(s => !s.id.includes('calendar') && !['aptos', 'twse-dividends', 'twse-holidays', 'mops-payments', 'mops-conferences', 'tpex-dividends', 'tpex-dividends-daily', 'twse-conferences', 'aave-governance'].includes(s.id));
        multi(source, '來源', 'sources', available.map(s => ({ id: s.id, label: s.name, disabled: s.status === 'not-connected', hint: `${sourceState(s)}${s.scopeLabel?'・'+s.scopeLabel:s.aggregator ? '・聚合入口' : ''}`, description:s.message })), null, '公開標題與原文連結，非全文轉載；聚合接入不代表官方 API。中央通訊社 RSS 限個人／非營利的非商業用途；來源失敗保留最後成功資料。');
      }, 'oxn-pill');
      const words = button('關鍵字', '搜尋與熱門關鍵字', () => showPanel(words, '關鍵字', (body, layer) => {
        const input = node('input', 'oxn-search'); input.type = 'search'; input.placeholder = '關鍵字、名稱、代號'; input.value = state.query; input.setAttribute('aria-label', '搜尋新聞');
        let timer; layer.signal.addEventListener('abort', () => clearTimeout(timer), { once: true }); input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.query = input.value; persist(); renderContent(); }, 120); }, { signal: life.signal });
        const tags = node('div', 'oxn-tags'); const stats = baseItems(); const hotCache = hotWords(stats); const order = [...new Map([...state.words.map(w => [w, 0]), ...hotCache]).entries()];
        for (const [word, count] of order) { const b = button(word, '', () => { const selected = new Set(state.words); selected.has(word) ? selected.delete(word) : selected.add(word); state.words = [...selected]; persist(); b.setAttribute('aria-pressed', String(selected.has(word))); renderContent(); }, 'oxn-tag'); b.setAttribute('aria-pressed', String(state.words.includes(word))); if (count) b.append(node('small', '', String(count))); tags.append(b); }
        body.append(input, node('p', 'oxn-caption', statsText(stats)), tags, button('清除搜尋與熱詞', '', () => { clearTimeout(timer); input.value = ''; state.query = ''; state.words = []; persist(); [...tags.children].forEach(b => b.setAttribute('aria-pressed', 'false')); renderContent(); }, 'oxn-action'));
      }), 'oxn-pill');
      const rank = button('排行榜', '新聞資產提及排行', () => showPanel(rank, '新聞提及排行', body => {
        const items = baseItems(), assets = ranking(items); body.append(node('p', 'oxn-caption', statsText(items)));
        if (!assets.length) body.append(node('p', 'oxn-empty', '本範圍沒有可核實的資產提及。'));
        const table = node('div', 'oxn-ranking'); for (const [i, asset] of assets.slice(0, 30).entries()) { const b = button('', `${asset.name}，${asset.count} 篇新聞`, () => { state.asset = state.asset === asset.id ? null : asset.id; persist(); b.setAttribute('aria-pressed', String(state.asset === asset.id)); renderContent(); }); b.setAttribute('aria-pressed', String(state.asset === asset.id)); b.append(node('span', 'oxn-rank-number', String(i + 1).padStart(2, '0')), node('span', '', `${asset.symbol} ${asset.name}`), node('small', '', MARKET_NAMES[asset.market]), node('b', '', `${asset.count} 篇`)); table.append(b); }
        body.append(table, button('清除資產篩選', '', () => { state.asset = null; persist(); [...table.children].forEach(b => b.setAttribute('aria-pressed', 'false')); renderContent(); }, 'oxn-action'));
      }), 'oxn-pill');
      time.classList.toggle('is-filtered', JSON.stringify(state.times) !== '["24"]'); source.classList.toggle('is-filtered', state.sources !== null); words.classList.toggle('is-filtered', Boolean(state.query || state.words.length)); rank.classList.toggle('is-filtered', Boolean(state.asset));
      controls.append(time, source, words, rank);
    }
  }
  function changeMonth(delta) { state.month = shiftMonth(state.month, delta); persist(); renderControls(); renderContent(); }
  function baseItems() { return newsBase(data.snapshot, scope(), state, api.preferences()); }
  function statsText(items) { const hours = Math.max(0, ...(state.times || []).map(Number)); return `近${hours < 24 ? `${hours}小時` : `${Math.round(hours / 24)}日`}・${scope() === 'all' ? '全部市場' : MARKET_NAMES[scope()]}・目前快照去重 ${items.length} 篇，標題提及・非全網統計`; }
  function status() {
    notification.replaceChildren(); if (data.candidate) notification.append(button('有新消息・點此更新', '', api.applyUpdate, 'oxn-update'));
    if (data.error) notification.append(node('p', 'oxn-caption', data.snapshot ? '更新失敗，保留最後成功資料' : '來源快照讀取失敗'), button('重試', '', api.refresh, 'oxn-action'));
    else if (!data.snapshot) notification.append(node('p', 'oxn-caption', data.pending ? '正在讀取來源快照…' : '尚未載入'));
  }
  function renderContent() {
    content.replaceChildren(); marketChoice.textContent = state.market === 'all' ? '全部市場' : MARKET_NAMES[state.market]; status();
    if (!data.snapshot) { content.append(node('div', 'oxn-empty', data.error ? '暫時無法讀取資料，請重試。' : '載入新聞與事件…')); return; }
    if (state.tab === 'calendar') {if(state.calendarView==='agenda')renderAgenda();else renderCalendar();} else renderNews();
    positionCalendar();
  }
  function renderCalendar() {
    const mobile = innerWidth <= 600;
    const gridInfo = monthGrid(state.month);
    if (mobile) {
      const [year, month] = state.month.split('-').map(Number);
      const offset = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
      gridInfo.weeks = 6;
      gridInfo.cells = Array.from({ length: 42 }, (_, i) => {
        const date = new Date(Date.UTC(year, month - 1, 1 - offset + i)).toISOString().slice(0, 10);
        return { date, day: Number(date.slice(8)), outside: date.slice(0, 7) !== state.month };
      });
    }
    const events = (data.snapshot.events || []).filter(i => eventDay(i)?.slice(0, 7) === state.month && (scope() === 'all' || i.markets?.includes(scope())) && (state.categories === null || state.categories.includes(eventCategory(i))) && (state.importance === null || state.importance.includes(String(importance(i).value || 'unrated'))));
    const map = new Map(); for (const e of events) { const key = eventDay(e); if (!map.has(key)) map.set(key, []); map.get(key).push(e); }
    const calendar = node('section', 'oxn-calendar'); calendar.setAttribute('aria-label', `${state.month} 完整月份行事曆`); calendar.dataset.weeks = String(gridInfo.weeks);
    const weekdays = node('div', 'oxn-weekdays'); (mobile ? '日一二三四五六' : '一二三四五六日').split('').forEach(d => weekdays.append(node('span', '', d)));
    const grid = node('div', 'oxn-calendar-grid'); grid.style.setProperty('--weeks', gridInfo.weeks); grid.setAttribute('role', 'grid');
    for (const cell of gridInfo.cells) {
      const entries = map.get(cell.date) || []; const b = node('div', 'oxn-day'); b.dataset.date = cell.date; b.setAttribute('role', 'gridcell');
      const selectDay = () => { state.selectedDay=cell.date; persist(); renderContent(); };
      b.addEventListener('click', selectDay);
      if (cell.outside) b.classList.add('is-outside'); if (cell.date === taipeiDay()) { b.classList.add('is-today'); b.setAttribute('aria-current', 'date'); }
      b.append(button(String(cell.day), `${cell.date}，${entries.length} 個已收錄事件`, e => { e.stopPropagation(); selectDay(); api.navigate({day:cell.date}); }, 'oxn-day-number'));
      if(entries.length)b.append(button(`${entries.length} 件`,`${cell.date}，查看下方 ${entries.length} 個事件`,e=>{e.stopPropagation();selectDay();requestAnimationFrame(()=>content.querySelector('.oxn-day-events')?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'}));},'oxn-day-count'));
      for (const item of entries.slice(0, 2)) { const short = button(item.shortTitle || label(item).replace(/美國 \d{4} 年 \d+ 月/, ''), `${CATEGORY_NAMES[eventCategory(item)] || '事件'}：${label(item)}`, e => { e.stopPropagation(); api.navigate({ day: cell.date, event: item.id }); }, 'oxn-calendar-event'); short.title = label(item); short.dataset.category = eventCategory(item) || ''; b.append(short); }
      if (entries.length>2) b.append(node('span', 'oxn-day-more', `＋${entries.length-2}`)); grid.append(b);
    }
    const cover = coverage(data.snapshot, scope(), state.month);
    const caption = node('div', 'oxn-calendar-caption'); caption.append(node('span', '', '台北時間 UTC+8'), button(cover.complete ? '資料範圍' : '部分資料・範圍', '', () => showPanel(caption.querySelector('button'), '事件資料範圍', body => {
      for (const category of cover.categories) { const entry = node('div', 'oxn-coverage-row'); entry.append(node('b', '', CATEGORY_NAMES[category.category]), node('span', '', category.covered ? '本月完整來源範圍' : category.known ? `本月已收錄 ${category.known} 件・非完整月資料` : '本月未覆蓋，不能判定沒有事件')); for (const span of category.spans) entry.append(node('small', '', `${span.from}～${span.to}・${sourceName({ sourceId: span.sourceId })}`)); body.append(entry); }
    }), 'oxn-text-button'));
    calendar.append(weekdays, grid, caption); content.append(calendar);
    const selected=state.selectedDay?.slice(0,7)===state.month?state.selectedDay:taipeiDay().slice(0,7)===state.month?taipeiDay():[...map.keys()].sort()[0]||`${state.month}-01`;
    grid.querySelector(`[data-date="${selected}"]`)?.classList.add('is-selected');
    const section=node('section','oxn-day-events');section.setAttribute('aria-label','所選日期完整事件');
    const heading=node('div','oxn-day-events-heading');heading.append(node('h2','',`${selected.replaceAll('-','／')} 事件`),button('完整列表','查看所選日期完整列表',()=>api.navigate({day:selected}),'oxn-text-button'));section.append(heading);
    const entries=[...(map.get(selected)||[])].sort((a,b)=>(a.occursAt||'').localeCompare(b.occursAt||'')||label(a).localeCompare(label(b)));
    const cards=node('div','oxn-event-carousel');cards.tabIndex=0;cards.setAttribute('aria-label',mobile?'所選日期事件列表':'事件卡片，左右滑動瀏覽');
    for(const item of entries){const card=eventRow(item,()=>api.navigate({day:selected,event:item.id}));card.classList.add('oxn-event-card');card.append(node('small','oxn-card-source',`${sourceName(item)} · ${statusLabel(item)}`));cards.append(card);}
    if(!entries.length)cards.append(node('p','oxn-caption','這一天目前沒有符合篩選條件的已收錄事件；不代表沒有事件。'));
    section.append(cards);content.append(section);
  }
  function eventRow(item, action) {
    const b = button('', label(item), action, 'oxn-event-row');
    b.append(node('span', 'oxn-event-type', CATEGORY_NAMES[eventCategory(item)] || '事件'), node('strong', '', label(item)), node('small', '', item.date ? '全天／時間待公布' : fmt(item.occursAt).split(' ')[1]), node('span', 'oxn-stars', importance(item).value ? '★'.repeat(importance(item).value) : '未分級')); return b;
  }
  function renderAgenda(){
    const days=agendaDays(data.snapshot,scope(),state);
    const agenda=node('section','oxn-agenda');agenda.setAttribute('aria-label','行程列表');
    for(const day of days){
      const section=node('section','oxn-agenda-day');section.dataset.date=day.date;
      const heading=node('div','oxn-agenda-day-heading'),date=node('time');date.dateTime=day.date;
      date.append(node('strong','',String(Number(day.date.slice(8)))),node('span','',`${Number(day.date.slice(5,7))} 月 · ${new Intl.DateTimeFormat('zh-TW',{timeZone:'UTC',weekday:'short'}).format(new Date(day.date+'T12:00:00Z'))}`));heading.append(date);section.append(heading);
      if(day.date===taipeiDay()){section.classList.add('is-today');date.setAttribute('aria-current','date');}
      const events=node('div','oxn-agenda-events');
      for(const item of day.events){
        const row=eventRow(item,()=>api.navigate({day:day.date,event:item.id}));row.dataset.eventId=item.id;row.dataset.category=eventCategory(item)||'';row.classList.add('oxn-agenda-event');
        row.append(node('small','oxn-agenda-source',`${sourceName(item)} · ${statusLabel(item)}`));events.append(row);
      }
      section.append(events);agenda.append(section);
    }
    if(!days.length)agenda.append(node('p','oxn-empty','已收錄資料中沒有本月起符合條件的行程。可切換月份或調整篩選。'));
    agenda.append(node('p','oxn-caption','依已接入來源的排程列出有事件的日期；未提供的日期與事件不補入示範資料。'));content.append(agenda);
  }
  function renderNews() {
    const base = baseItems(), prefs = api.preferences(); let items = filterNews(base, state);
    if (state.reader === 'unread') items = items.filter(i => !(prefs.read || []).includes(i.id)); if (state.reader === 'following') items = items.filter(i => (prefs.followedSources || []).includes(i.sourceId));
    const range = node('div', 'oxn-news-range'); range.append(node('span', '', `${items.length} 篇・台北時間`), node('span', '', data.snapshot.generatedAt ? `快照 ${fmt(data.snapshot.generatedAt)}` : '快照時間未提供')); content.append(range);
    if (state.asset || state.query || state.words.length) { const selected = node('div', 'oxn-active-filters'); selected.append(node('span', '', [state.asset ? ranking(base).find(a => a.id === state.asset)?.name || '資產篩選' : '', state.query, ...state.words].filter(Boolean).join(' · ')), button('清除', '', () => { state.asset = null; state.query = ''; state.words = []; persist(); renderControls(); renderContent(); })); content.append(selected); }
    const list = node('div', 'oxn-news-list'); for (const item of items.slice(0, state.limit)) list.append(newsRow(item));
    if (!items.length) list.append(node('p', 'oxn-empty', !state.times.length || state.sources?.length === 0 ? '沒有選取時間或來源。可在藥丸中選擇「全部」或恢復預設。' : '已收錄資料中沒有符合條件的新聞。'));
    content.append(list); if (items.length > state.limit) content.append(button(`載入更多（尚有 ${items.length - state.limit} 篇）`, '', () => { state.limit += 40; persist(); renderContent(); }, 'oxn-load-more'));
    const published = [...(data.snapshot.news || []), ...(data.snapshot.pendingNews || [])].filter(i => scope() === 'all' || i.markets?.includes(scope())).map(i => i.publishedAt).sort();
    content.append(node('p', 'oxn-caption', `${statsText(base)}。${published.length ? `現有文章發布範圍：${fmt(published[0])}～${fmt(published.at(-1))}；來源 RSS 篇數有限，未完整覆蓋所選區間。` : '目前没有本市場來源資料。'}`));
  }
  function newsRow(item) {
    const row = node('details', 'oxn-news-row'); row.dataset.newsId = item.id;
    const summary = node('summary'), meta = node('div', 'oxn-news-meta');
    meta.append(node('span', 'oxn-source', sourceName(item)), node('time', '', fmt(item.publishedAt))); if (api.scope === 'all') meta.append(node('span', '', item.markets?.map(m => MARKET_NAMES[m]).filter(Boolean).join('／')));
    summary.append(meta, node('h3', '', label(item)), node('span', 'oxn-expand', '＋'));
    const tags = node('div', 'oxn-article-tags'); for (const asset of (item.assets || []).slice(0, 4)) tags.append(node('span', '', `${asset.symbol} ${asset.name}`)); if (item.translationStatus !== 'translated') tags.append(node('span', '', '翻譯待補')); if (tags.children.length) summary.append(tags);
    const body = node('div', 'oxn-article-body');
    if (item.summaryZh) { body.append(node('small', 'oxn-caption', item.summaryType === 'system' ? '系統整理' : '來源摘要'), node('p', '', plain(item.summaryZh))); } else body.append(node('p', 'oxn-caption', item.translationStatus === 'translated' ? '來源未提供已核對的繁中摘要，完整內容請見原文。' : '繁體中文翻譯待補，保留原文供查核。'));
    if (item.title !== item.titleZh) body.append(node('p', 'oxn-original', item.title));
    if(item.aggregation)body.append(node('p','oxn-caption',`公開標題由 ${item.aggregation} 聚合 · ${item.publisher?`原始發布者：${item.publisher}`:`入口來源：${sourceName(item)}`}；非官方 API，不轉載全文。`));
    const actions = node('div', 'oxn-article-actions'), original = link(item.aggregation?'前往聚合連結／原文':'閱讀原文', item.link); if (original) actions.append(original);
    const read = button((api.preferences().read || []).includes(item.id) ? '標為未讀' : '標為已讀', '', () => { const set = new Set(api.preferences().read || []); set.has(item.id) ? set.delete(item.id) : set.add(item.id); api.save({ read: [...set] }); read.textContent = set.has(item.id) ? '標為未讀' : '標為已讀'; row.classList.toggle('is-read', set.has(item.id)); });
    const follow = button((api.preferences().followedSources || []).includes(item.sourceId) ? '取消追蹤' : '追蹤來源', '', () => { const set = new Set(api.preferences().followedSources || []); set.has(item.sourceId) ? set.delete(item.sourceId) : set.add(item.sourceId); api.save({ followedSources: [...set] }); follow.textContent = set.has(item.sourceId) ? '取消追蹤' : '追蹤來源'; });
    actions.append(read, follow, button('隱藏', '', () => { api.save({ hidden: [...new Set([...(api.preferences().hidden || []), item.id])] }); row.remove(); })); body.append(actions);
    for (const asset of item.assets || []) {
      const assetActions = node('div', 'oxn-asset-actions'); assetActions.append(button(`${asset.name}相關新聞`, '', () => { state.asset = asset.id; persist(); renderControls(); renderContent(); }));
      if (asset.market === 'tw' && /^\d{4}$/.test(asset.symbol)) assetActions.append(button('前往個股雷達', '', () => { window.OXMarketController?.setMarket('tw'); window.switchAppView('radar'); document.dispatchEvent(new CustomEvent('ox:tw-chart-symbol', { detail: { symbol: asset.symbol } })); }));
      if (asset.market === 'crypto' && asset.venueSymbol && typeof window.switchSymbol === 'function') assetActions.append(button('前往幣種雷達', '', () => { window.OXMarketController?.setMarket('crypto'); window.switchSymbol(asset.venueSymbol); })); body.append(assetActions);
    }
    if (item.reports?.length > 1) { const related = node('div', 'oxn-related'); related.append(node('small', '', '同篇轉載／連結（不算獨立查證）')); for (const report of item.reports.slice(1)) { const a = link(sourceName(report), report.link); if (a) related.append(a); } body.append(related); }
    const health = data.snapshot.sources?.find(s => s.id === item.sourceId); if (health?.status === 'error') body.append(node('p', 'oxn-caption', '來源更新失敗・保留前次快照'));
    row.append(summary, body); if ((api.preferences().read || []).includes(item.id)) row.classList.add('is-read'); return row;
  }
  function renderRoute(route) {
    const next = JSON.stringify(route || {}); if (detailKey === next && detail) return; detail?.destroy(); detail = null; clearInterval(countdown); countdown = null; detailKey = next;
    if (!route?.day && !route?.event) return;
    closePanel(); const item = (data.snapshot?.events || []).find(e => e.id === route.event && (scope() === 'all' || e.markets?.includes(scope())));
    if (route.event) {
      detail = modal('事件詳情', api.back);
      if (!item) { detail.body.append(node('p', 'oxn-empty', data.snapshot ? '事件未收錄於目前來源快照。' : '正在讀取事件…')); return; }
      const category = eventCategory(item); detail.body.append(node('span', 'oxn-detail-type', `${CATEGORY_NAMES[category] || '事件'}・${statusLabel(item)}`), node('h2', '', label(item)));
      const fields = [['適用市場', item.markets?.map(m => MARKET_NAMES[m]).join('／')], ['日期／台北時間', item.date ? `${item.date}・${item.allDay ? '全天' : '時間待公布'}` : fmt(item.occursAt)]];
      if (['dividend', 'payment', 'dividend-preview', 'earnings'].includes(category)) fields.push(['公司／代號', `${item.company || '資料未提供'} ${item.symbol || ''}`]);
      if (category === 'dividend' || category === 'dividend-preview') fields.push(['除權息日', item.exDividendDate || item.date], ['現金股利（元／股）', item.cashDividend], ['股票股利（元／股）', item.stockDividend], ['合計配發（元／股）', item.totalDividend], ['現金發放日', item.paymentDate]);
      if (category === 'payment') fields.push(['發放日期', item.paymentDate || item.date], ['對應除息日', item.exDividendDate], ['配發金額（元／股）', item.cashDividend]);
      if (category === 'dividend-preview') fields.push(['預告日期', item.announcedDate], ['預計配發', item.expectedDividend], ['公告狀態', statusLabel(item)]);
      if (category === 'earnings') fields.push(['形式／地點', item.location || item.format], ['結束／台北時間', item.endsAt ? fmt(item.endsAt) : null], ['報到／場次說明', item.registrationNote]);
      if (category === 'macro') fields.push(['國家', item.country || (item.sourceId === 'bls-calendar' ? '美國' : null)], ['重要性', importance(item).value ? `${'★'.repeat(importance(item).value)}（原始 ${importance(item).raw}／5）` : '未分級'], ['前值', item.previous], ['預期值', item.consensus], ['實際值', item.actual == null ? '未公布／來源未提供' : item.actual]);
      if (['holiday', 'exchange'].includes(category)) fields.push(['時段', item.session], ['調整內容', item.description]);
      if (category !== 'macro' && (api.scope === 'crypto' || item.markets?.includes('crypto'))) fields.push(['幣種／專案', (item.assets || []).map(a => `${a.name} ${a.symbol}`).join('／') || item.symbols?.join('／')], ['鏈／專案識別', item.chain || item.projectId], ['相關數量', item.quantity]);
      detail.body.append(fieldList(fields));
      if (category === 'governance') detail.body.append(fieldList([['議案原文（翻譯待補）', item.proposalTitle], ['投票開始／台北時間', fmt(item.startsAt)], ['投票截止／台北時間', fmt(item.occursAt)]]));
      if (item.eventTimeType) detail.body.append(node('p', 'oxn-caption', item.eventTimeType === 'software-release-publication' ? '此時間為官方軟體版本發布時間，不是主網硬分叉生效時間。' : item.eventTimeType));
      if (category === 'unlock') { const counter = node('p', 'oxn-countdown', api.unlockCountdown(item)); detail.body.append(counter); if (item.status === 'confirmed' && item.occursAt && !item.date) countdown = setInterval(() => { counter.textContent = api.unlockCountdown(item); }, 1000); }
      if (item.scheduleBasis) detail.body.append(node('p', 'oxn-caption', item.scheduleBasis));
      const original = link('官方公告／原始資料', item.sourceUrl || item.link); if (original) detail.body.append(original);
      for (const [name, url] of [['簡報', item.presentationUrl], ['直播', item.liveUrl || item.livestreamUrl], ['官方月表', item.documentUrl]]) { const a = link(name, url); if (a) detail.body.append(a); }
      if (item.impact?.evidence) detail.body.append(node('p', 'oxn-caption', item.impact.reason));
      detail.body.append(node('p', 'oxn-caption', `${sourceName(item)}・資料更新 ${item.updatedAt ? fmt(item.updatedAt) : '時間未提供'}・${statusLabel(item)}`));
      if (item.title !== item.titleZh) detail.body.append(node('p', 'oxn-original', item.title));
    } else {
      detail = modal(`${route.day}・當日事件`, api.back); const events = (data.snapshot?.events || []).filter(e => eventDay(e) === route.day && (scope() === 'all' || e.markets?.includes(scope())) && (state.categories === null || state.categories.includes(eventCategory(e))) && (state.importance === null || state.importance.includes(String(importance(e).value || 'unrated'))));
      detail.body.append(node('p', 'oxn-caption', `台北時間・符合目前篩選 ${events.length} 件`));
      for (const event of events) detail.body.append(eventRow(event, () => api.navigate({ day: route.day, event: event.id })));
      if (!events.length) detail.body.append(node('p', 'oxn-empty', '已收錄資料中沒有符合條件的事件；未覆蓋資料不能判定為沒有事件。'));
    }
  }
  let width = innerWidth, height = innerHeight;
  function positionCalendar() {
    requestAnimationFrame(() => { const grid = content.querySelector('.oxn-calendar-grid'); if (!grid) return;
      const viewport = window.visualViewport;
      const visibleHeight = viewport?.height || innerHeight;
      const dock = document.querySelector('.app-dock')?.getBoundingClientRect();
      const top = grid.getBoundingClientRect().top + scrollY;
      const bottom = Math.min(visibleHeight, dock?.top || visibleHeight - 80);
      const captionHeight = content.querySelector('.oxn-calendar-caption')?.getBoundingClientRect().height || 30;
      const rows = Number(content.querySelector('.oxn-calendar').dataset.weeks);
      const room = Math.floor(bottom - top - captionHeight - 12);
      const mobile = innerWidth <= 600 && visibleHeight > innerWidth;
      const available = room - Math.min(64, Math.max(0, room - rows * 66));
      const fit = mobile && available >= rows * 54;
      grid.style.setProperty('--month-height', fit ? `${available}px` : 'auto');
      root.dataset.fit = fit ? '1' : '0';
      root.dataset.compact = fit && available < rows * 66 ? '1' : '0';
    });
  }
  window.addEventListener('resize', () => { if (innerWidth !== width || Math.abs(innerHeight - height) > 90) { const crossed=(width<=600)!==(innerWidth<=600);width = innerWidth; height = innerHeight; if(crossed&&state.tab==='calendar'){renderControls();renderContent();}else positionCalendar(); } }, { signal: life.signal });
  window.visualViewport?.addEventListener('resize', positionCalendar, { signal: life.signal });
  let scrollTimer; window.addEventListener('scroll', () => { if (!root.closest('.app-view.active')) return; clearTimeout(scrollTimer); scrollTimer = setTimeout(() => { state.scroll = scrollY; persist(); }, 180); }, { signal: life.signal, passive: true });
  renderControls();
  return { host, update(next) { const changed = next.snapshot !== data.snapshot || !content.firstChild; data = next; if (changed) { detailKey = ''; renderContent(); } else status(); renderRoute(data.route); rail.position(); if (restorePosition) { restorePosition = false; requestAnimationFrame(() => window.scrollTo(0, state.scroll || 0)); } }, suspend() { closePanel(); detail?.destroy(); detail = null; detailKey = ''; clearInterval(countdown); countdown = null; }, destroy() { state.scroll = root.closest('.app-view.active') ? scrollY : state.scroll; persist(); closePanel(); detail?.destroy(); clearInterval(countdown); clearTimeout(scrollTimer); life.abort(); rail.destroy(); root.remove(); } };
}



