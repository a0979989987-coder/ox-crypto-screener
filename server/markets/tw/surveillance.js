// Official TWSE / TPEx announcements. Price movement is never used to invent
// disposition membership. Dates and counts retain their source provenance.
const TWSE = 'https://openapi.twse.com.tw/v1';
const TPEX = 'https://www.tpex.org.tw/openapi/v1';
const SOURCES = {
  twseDisposal: `${TWSE}/announcement/punish`,
  tpexDisposal: `${TPEX}/tpex_disposal_information`,
  twseRisk: `${TWSE}/announcement/notetrans`,
  tpexRisk: `${TPEX}/tpex_trading_warning_note`,
  twseAttention: `${TWSE}/announcement/notice`,
  tpexAttention: `${TPEX}/tpex_trading_warning_information`,
  calendar: `${TWSE}/holidaySchedule/holidaySchedule`,
  twseMargin: `${TWSE}/exchangeReport/MI_MARGN`,
  tpexMargin: `${TPEX}/tpex_mainboard_margin_balance`,
  twseDay: `${TWSE}/exchangeReport/TWTB4U`,
  tpexDay: `${TPEX}/tpex_securities`,
  tpexTurnover: `${TPEX}/tpex_daily_turnover`,
  twseShares: `${TWSE}/opendata/t187ap03_L`,
  futures: 'https://openapi.taifex.com.tw/v1/SSFLists'
};
const cache = new Map();
const pending = new Map();
const clean = value => String(value ?? '').replace(/<[^>]*>/g, ' ').trim();
const number = value => clean(value) !== '' && Number.isFinite(Number(clean(value).replace(/,/g, ''))) ? Number(clean(value).replace(/,/g, '')) : null;
const stockCode = value => /^\d{4}$/.test(clean(value)) ? clean(value) : '';

export function officialDate(value) {
  const s = clean(value);
  const m = s.match(/^(\d{3,4})[年/\-](\d{1,2})[月/\-](\d{1,2})日?$/) || s.match(/^(\d{3,4})(\d{2})(\d{2})$/);
  if (!m) return '';
  const year = Number(m[1]) + (m[1].length === 3 ? 1911 : 0);
  const iso = `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : '';
}
const addDay = date => new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
export function tradingCalendar(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const closed = new Set();
  const open = new Set();
  const years = new Set();
  for (const row of rows) {
    const date = officialDate(row.Date);
    if (!date) continue;
    years.add(date.slice(0, 4));
    const label = clean(row.Name) + clean(row.Description);
    if (/開始交易|最後交易/.test(label) && !/無交易/.test(label)) open.add(date);
    else closed.add(date);
  }
  return { years, isOpen(date) {
    if (!years.has(date.slice(0, 4))) return null;
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    return open.has(date) || (day !== 0 && day !== 6 && !closed.has(date));
  } };
}
export function tradingDaysBetween(start, end, calendar) {
  if (!start || !end || end < start || !calendar) return null;
  let count = 0;
  for (let date = addDay(start), guard = 0; date <= end; date = addDay(date)) {
    if (++guard > 370 || calendar.isOpen(date) === null) return null;
    if (calendar.isOpen(date)) count++;
  }
  return count;
}
function period(value) {
  const dates = clean(value).split(/[~～至]/).map(officialDate);
  return dates.length === 2 && dates.every(Boolean) && dates[0] <= dates[1] ? dates : ['', ''];
}
const chineseNumbers = { 一:1, 二:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9, 十:10, 十一:11, 十二:12, 二十:20, 三十:30, 四十五:45, 六十:60 };
function count(value) { return /^\d+$/.test(value) ? Number(value) : chineseNumbers[value] ?? null; }
export function attentionProgress(value) {
  const s = clean(value);
  let match = s.match(/連續([\d一二三四五六七八九十]+)次/);
  if (match) {
    const current = count(match[1]);
    const target = current === 2 ? 3 : current === 4 ? 5 : null;
    if (target) return { current, target, label: `連續注意 ${current}/${target} 次` };
  }
  match = s.match(/已有([\d一二三四五六七八九十]+)次/);
  if (match) {
    const current = count(match[1]);
    const target = current === 5 ? 6 : current === 11 ? 12 : null;
    if (target) return { current, target, label: `區間注意 ${current}/${target} 次` };
  }
  return null;
}
export function batchMinutes(value) {
  const m = clean(value).normalize('NFKC').match(/每\s*([\d一二三四五六七八九十]+)\s*分鐘/);
  return m ? count(m[1]) : null;
}
async function load(name) {
  const hit = cache.get(name);
  if (hit && hit.expires > Date.now()) return hit.rows;
  if (pending.has(name)) return pending.get(name);
  const request = (async () => {
    const response = await fetch(SOURCES[name], { signal: AbortSignal.timeout(name.startsWith('tpex') ? 18000 : 12000), headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 OX-Market-Command-Center' } });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error(`${name}: invalid official response`);
    cache.set(name, { rows, expires: Date.now() + (name === 'calendar' ? 3600000 : 300000) });
    return rows;
  })().finally(() => pending.delete(name));
  pending.set(name, request);
  return request;
}
export async function loadTWSurveillance() {
  const entries = await Promise.all(Object.keys(SOURCES).map(async name => {
    try { return [name, { rows: await load(name), ok: true }]; }
    catch { return [name, { rows: [], ok: false }]; }
  }));
  return Object.fromEntries(entries);
}

export function buildTWSurveillance(feeds, quotes = [], { now = new Date(), dataDate = '' } = {}) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const calendar = tradingCalendar(feeds.calendar?.ok ? feeds.calendar.rows : null);
  const quoteMap = new Map(quotes.map(row => [row.symbol, row]));
  const byCode = (name, key) => new Map((feeds[name]?.rows || []).map(row => [clean(row[key]), row]));
  const margins = { TWSE: byCode('twseMargin', '股票代號'), TPEX: byCode('tpexMargin', 'SecuritiesCompanyCode') };
  const dayTrade = { TWSE: byCode('twseDay', 'Code'), TPEX: byCode('tpexDay', '證券代號') };
  const turnover = byCode('tpexTurnover', 'SecuritiesCompanyCode');
  const shares = byCode('twseShares', '公司代號');
  const futures = byCode('futures', 'StockCode');
  const modes = { risk: [], disposal: [], release: [] };
  const active = new Map();
  const future = new Map();
  const rowFor = (symbol, name, market, disposition) => {
    const quote = quoteMap.get(symbol) || {};
    const prefix = market === 'TWSE' ? 'twse' : 'tpex';
    const margin = margins[market].get(symbol);
    const note = clean(margin?.['註記'] ?? margin?.Note).toUpperCase();
    const day = dayTrade[market].get(symbol);
    const ratio = turnover.get(symbol);
    const capital = number(shares.get(symbol)?.['已發行普通股數或TDR原股發行股數']);
    const rate = market === 'TPEX' && officialDate(ratio?.Date) === (quote.dataDate || dataDate) ? number(ratio.TurnoverRatio)
      : market === 'TWSE' && capital > 0 && number(quote.volume) !== null ? number(quote.volume) / capital * 100 : null;
    return { ...quote, symbol, name: quote.name || name, market, turnoverRate: rate ?? quote.turnoverRate ?? null,
      turnoverBasis: market === 'TWSE' && rate !== null ? '當日成交股數 ÷ 最新官方已發行普通股數' : '官方當日週轉率',
      disposition: { ...disposition,
        margin: feeds[`${prefix}Margin`]?.ok ? !!margin && !/[O!]/.test(note) : null,
        short: feeds[`${prefix}Margin`]?.ok ? !!margin && !/[X!]/.test(note) : null,
        dayTrade: feeds[`${prefix}Day`]?.ok ? !!day && !clean(day.Suspension ?? day['暫停現股賣出後現款買進當沖註記']) : null,
        futures: feeds.futures?.ok ? futures.has(symbol) : null, exemption: null, noRepeatRisk: null,
        asOf: dataDate, checkedAt: now.toISOString()
      }
    };
  };
  for (const [source, market] of [['twseDisposal', 'TWSE'], ['tpexDisposal', 'TPEX']]) {
    for (const item of feeds[source]?.rows || []) {
      const symbol = stockCode(item.Code || item.SecuritiesCompanyCode);
      const [startDate, endDate] = period(item.DispositionPeriod);
      if (!symbol || !startDate || endDate < today) continue;
      const detail = clean(item.Detail || item.DisposalCondition);
      const row = rowFor(symbol, clean(item.Name || item.CompanyName), market, {
        status: startDate > today ? 'risk' : 'active', startDate, endDate,
        scheduled: startDate > today,
        announcementDate: officialDate(item.Date),
        batchMinutes: batchMinutes(detail),
        releaseDays: tradingDaysBetween(today, endDate, calendar),
        condition: clean(item.ReasonsOfDisposition || item.DispositionReasons),
        detail, sourceUrl: market === 'TWSE' ? 'https://www.twse.com.tw/zh/announcement/punish.html' : 'https://www.tpex.org.tw/zh-tw/announce/market/disposal.html'
      });
      const target = startDate > today ? future : active;
      const previous = target.get(symbol);
      if (!previous || previous.disposition.announcementDate <= row.disposition.announcementDate) target.set(symbol, row);
    }
  }
  for (const [source, market] of [['twseRisk', 'TWSE'], ['tpexRisk', 'TPEX']]) {
    for (const item of feeds[source]?.rows || []) {
      const symbol = stockCode(item.Code || item.SecuritiesCompanyCode);
      if (!symbol || future.has(symbol)) continue;
      const condition = clean(item.RecentlyMetAttentionSecuritiesCriteria || item.AccumulationSituation);
      const mentionedDates = condition.match(/\d{3}年\d{1,2}月\d{1,2}日/g) || [];
      const noticeDate = officialDate(item.Date) || mentionedDates.map(officialDate).filter(Boolean).sort().at(-1) || '';
      // An old warning must not remain a current risk after newer sessions.
      if (!noticeDate || (dataDate && noticeDate < dataDate)) continue;
      const progress = attentionProgress(condition);
      const current = active.get(symbol);
      const risk = {
        ...(current?.disposition || {}), status: current ? 'active' : 'risk',
        riskLabel: '最快 1 個交易日後可能' + (current ? '再次處置' : '進入處置'),
        riskProgress: progress ? progress.current / progress.target * 100 : null,
        riskLevel: progress?.label || '官方注意累計預警',
        riskBasis: condition, noticeDate,
        riskSourceUrl: market === 'TWSE' ? 'https://www.twse.com.tw/zh/announcement/notetrans.html' : 'https://www.tpex.org.tw/zh-tw/announce/market/warning.html'
      };
      const row = rowFor(symbol, clean(item.Name || item.CompanyName), market, risk);
      if (current) active.set(symbol, row);
      modes.risk.push(row);
    }
  }
  modes.risk.push(...future.values());
  // Daily attention announcements widen the scan. They are separate from the
  // official accumulated-count warning and never receive an invented meter.
  // Keep confirmed near-threshold and scheduled rows in their existing order.
  const riskSymbols = new Set(modes.risk.map(row => row.symbol));
  for (const [source, market] of [['twseAttention', 'TWSE'], ['tpexAttention', 'TPEX']]) {
    const latest = new Map();
    for (const item of feeds[source]?.rows || []) {
      const symbol = stockCode(item.Code || item.SecuritiesCompanyCode || item.SecuritiesCode || item['證券代號']);
      if (!symbol || riskSymbols.has(symbol) || active.has(symbol)) continue;
      const noticeDate = officialDate(item.Date || item.AnnouncementDate || item.TradeDate || item['公告日期']);
      // These OpenAPI feeds publish the latest daily list. When their rows omit
      // a date, use only a confirmed quote from the current official session.
      const quote = quoteMap.get(symbol);
      if (noticeDate ? (dataDate && noticeDate !== dataDate) : (!quote || quote.dataDate !== dataDate)) continue;
      const basis = clean(item.AttentionTradingInformation || item.TradingInformation || item.Reason || item['注意交易資訊']);
      latest.set(symbol, rowFor(symbol, clean(item.Name || item.CompanyName || item.SecuritiesName || item['證券名稱']), market, {
        status: 'risk', riskLabel: '官方公布注意 · 持續觀察',
        riskLevel: '官方注意股票（未列入累計預警）',
        riskBasis: basis, noticeDate: noticeDate || dataDate,
        riskProgress: null,
        riskSourceUrl: market === 'TWSE' ? 'https://www.twse.com.tw/zh/announcement/notice.html'
          : 'https://www.tpex.org.tw/zh-tw/announce/market/attention.html'
      }));
    }
    for (const row of latest.values()) {
      riskSymbols.add(row.symbol);
      modes.risk.push(row);
    }
  }
  modes.disposal = [...active.values()].sort((a,b) => a.disposition.endDate.localeCompare(b.disposition.endDate));
  modes.release = modes.disposal.filter(row => row.disposition.releaseDays !== null && row.disposition.releaseDays <= 3)
    .map(row => ({ ...row, disposition: { ...row.disposition, status: 'release' } }));
  const status = names => names.every(name => feeds[name]?.ok) ? 'ready' : names.some(name => feeds[name]?.ok) ? 'partial' : 'error';
  return { modes, modesMeta: {
    checkedAt: now.toISOString(), asOf: dataDate, calendarReady: !!calendar,
    risk: { status: status(['twseRisk', 'tpexRisk', 'twseDisposal', 'tpexDisposal', 'twseAttention', 'tpexAttention']) },
    disposal: { status: status(['twseDisposal', 'tpexDisposal']) },
    release: { status: calendar ? status(['twseDisposal', 'tpexDisposal']) : 'error' },
    sources: Object.fromEntries(Object.entries(feeds).map(([key,value]) => [key, { ok: value.ok, url: SOURCES[key] }]))
  } };
}
