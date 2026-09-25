import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

// Public, first-party feeds only. Feed headlines and source links are republished;
// article bodies and third-party summaries are never copied into the site.
export const FEEDS = [
  { id: 'twse', name: '臺灣證券交易所', url: 'https://www.twse.com.tw/rwd/zh/news/feed?type=rss', markets: ['tw'] },
  { id: 'fed', name: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_monetary.xml', markets: ['us','forex'] },
  { id: 'bls-cpi', name: 'U.S. BLS · CPI', url: 'https://www.bls.gov/feed/cpi.rss', markets: ['us','forex'] },
  { id: 'bls-jobs', name: 'U.S. BLS · Employment', url: 'https://www.bls.gov/feed/empsit.rss', markets: ['us','forex'] },
  { id: 'ecb', name: 'European Central Bank', url: 'https://www.ecb.europa.eu/rss/press.html', markets: ['forex'] },
  { id: 'sec', name: 'U.S. SEC', url: 'https://www.sec.gov/news/pressreleases.rss', markets: ['us','crypto'] },
  { id: 'ethereum', name: 'Ethereum Foundation', url: 'https://blog.ethereum.org/feed.xml', markets: ['crypto'] },
  { id: 'kraken', name: 'Kraken', url: 'https://blog.kraken.com/feed', markets: ['crypto'] },
  { id: 'cftc', name: 'U.S. CFTC', url: 'https://www.cftc.gov/RSS/RSSGP/rssgp.xml', markets: ['us','crypto'] },
  { id: 'bitcoin-core', name: 'Bitcoin Core', url: 'https://github.com/bitcoin/bitcoin/releases.atom', markets: ['crypto'] }
];
const OFFICIAL_HOSTS = new Set(['www.twse.com.tw', 'www.federalreserve.gov', 'www.bls.gov', 'www.ecb.europa.eu', 'www.sec.gov', 'blog.ethereum.org', 'blog.kraken.com', 'www.cftc.gov']);

const parser = new XMLParser({ ignoreAttributes: false, processEntities: true, trimValues: true });
const array = value => value == null ? [] : Array.isArray(value) ? value : [value];
const plain = value => String(typeof value === 'object' ? value?.['#text'] ?? '' : value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 20);
const iso = value => { const ms = Date.parse(String(value ?? '')); return Number.isFinite(ms) ? new Date(ms).toISOString() : null; };
const safeUrl = value => { try { const u = new URL(plain(value)); return u.protocol === 'https:' && (OFFICIAL_HOSTS.has(u.hostname) || (u.hostname === 'github.com' && /^\/bitcoin\/bitcoin\/releases(?:\/tag\/[^/]+)?\/?$/.test(u.pathname))) ? u.href : null; } catch { return null; } };
const verifiedForFeed = (url, feed) => { try {
  const parsed = new URL(url);
  return feed.id === 'bitcoin-core' ? parsed.hostname === 'github.com' && /^\/bitcoin\/bitcoin\/releases\/tag\/[^/]+\/?$/.test(parsed.pathname)
    : parsed.hostname === new URL(feed.url).hostname;
} catch { return false; } };

export function impact(title, sourceId, sourceUrl = null) {
  // Stars rank a verified *release category*, not price direction or its actual value.
  const official = sourceUrl && safeUrl(sourceUrl);
  const sourceHost = { 'bls-cpi': 'www.bls.gov', 'bls-jobs': 'www.bls.gov', 'bls-calendar': 'www.bls.gov', fed: 'www.federalreserve.gov' }[sourceId];
  const evidence = official && sourceHost && new URL(official).hostname === sourceHost ? official : null;
  const patterns = {
    'bls-cpi': [/^CPI for all items\b/i, 5, '美國官方消費者物價指數發布'],
    'bls-jobs': [/^(?:Both )?payroll employment\b/i, 5, '美國官方就業報告發布'],
    'fed': [/^Federal Reserve issues FOMC statement$/i, 5, '美國聯準會政策決議聲明'],
    'bls-calendar': [/^(?:Consumer Price Index|Employment Situation|Producer Price Index|Job Openings and Labor Turnover Survey) for /i, null, '美國官方經濟數據預定公布']
  };
  const rule = patterns[sourceId];
  const type = sourceId === 'bls-calendar' ? (/^Consumer Price Index|^Employment Situation/.test(title) ? 5 : /^Producer Price Index/.test(title) ? 4 : 3) : rule?.[1];
  const stars = evidence && rule?.[0].test(title) ? type : null;
  return { stars, impactImportance: stars, reason: stars ? `${rule[2]}；星級只表示事件類別的重要性，不表示多空或結果` : '尚未評估；標題不足以判定影響力', ruleVersion: stars ? 'official-release-category-v1' : 'unassessed-v1', evidence: stars ? evidence : null, sourceConfidence: official ? 'official-source' : null, analysisConfidence: null, direction: null, sourceId };
}

export function normalizeFeed(xml, feed) {
  const parsed = parser.parse(xml);
  const raw = array(parsed?.rss?.channel?.item ?? parsed?.feed?.entry);
  return raw.map(entry => {
    const title = plain(entry.title);
    const links = array(entry.link);
    const preferred = links.find(value => typeof value === 'object' && (!value['@_rel'] || value['@_rel'] === 'alternate')) ?? links[0];
    const rawLink = plain(typeof preferred === 'object' ? preferred?.['@_href'] ?? preferred?.['#text'] : preferred);
    const link = safeUrl(feed.id === 'twse' && /^\/rwd\/zh\/news\/newsDetail\//.test(rawLink) ? `https://www.twse.com.tw${rawLink}` : rawLink);
    const publishedAt = iso(entry.pubDate ?? entry.published ?? entry.updated);
    if (!title || !link || !verifiedForFeed(link, feed) || !publishedAt) return null;
    if (feed.id === 'kraken' && /VIP château|APY on AUSD|Pre-IPO Challenge/i.test(title)) return null;
    const relevantMarkets = ['sec','cftc'].includes(feed.id) && !/bitcoin|crypto|digital asset|spot etf|exchange.traded fund/i.test(title) ? ['us'] : feed.markets;
    return { id: hash(link), title, link, publishedAt, source: feed.name, sourceId: feed.id,
      markets: relevantMarkets, kind: 'news', verified: 'official-source', impact: impact(title, feed.id, link) };
  }).filter(Boolean).slice(0, 35);
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OXNews/1.0)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/html' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error('Feed exceeds size limit');
  return text;
}

export function parseBlsCalendar(html, now = Date.now()) {
  const events = [];
  const pattern = /<tr\b[^>]*>[\s\S]*?<td class="date-cell"><p>([^<]+)<\/p><\/td>[\s\S]*?<td class="time-cell"><p>([^<]*)<\/p><\/td>[\s\S]*?<td class="desc-cell"><p>([\s\S]*?)<\/p><\/td>[\s\S]*?<\/tr>/gi;
  for (const match of html.matchAll(pattern)) {
    const date = plain(match[1]);
    const time = plain(match[2]);
    const title = plain(match[3]);
    if (!/Consumer Price Index|Employment Situation|Producer Price Index|Job Openings and Labor Turnover/i.test(title) || !/^\d{1,2}:\d{2} [AP]M$/.test(time)) continue;
    const midday = Date.parse(`${date} 12:00 UTC`);
    if (!Number.isFinite(midday)) continue;
    const eastern = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).formatToParts(midday).find(part => part.type === 'timeZoneName')?.value;
    const occursAt = iso(`${date} ${time} ${eastern === 'EDT' ? 'EDT' : 'EST'}`);
    if (!occursAt || Date.parse(occursAt) < now) continue;
    events.push({ id: hash(`bls:${date}:${title}`), title, link: 'https://www.bls.gov/schedule/news_release/current_year.asp', sourceUrl: 'https://www.bls.gov/schedule/news_release/current_year.asp', occursAt,
      source: 'U.S. BLS', sourceId: 'bls-calendar', markets: ['us','forex','crypto','tw'], symbols: [], kind: 'event', status: 'confirmed', originalTimezone: 'America/New_York', previous: null, consensus: null, actual: null, revised: null, updatedAt: null, impact: impact(title, 'bls-calendar', 'https://www.bls.gov/schedule/news_release/current_year.asp') });
  }
  return events.sort((a,b) => a.occursAt.localeCompare(b.occursAt));
}

const retainEvent = item => ({ ...item, sourceUrl: item.sourceUrl ?? item.link ?? null,
  originalTimezone: item.originalTimezone ?? item.originalZone ?? null,
  symbols: item.symbols ?? [], previous: item.previous ?? null, consensus: item.consensus ?? null,
  actual: item.actual ?? null, revised: item.revised ?? null, updatedAt: item.updatedAt ?? null,
  impact: impact(item.title, item.sourceId, item.sourceUrl ?? item.link) });

// Preserve translations only while both the source identity and original title match.
export function localize(item, previous = []) {
  const old = previous.find(entry => entry.id === item.id && entry.title === item.title);
  let titleZh = old?.titleZh || (item.sourceId === 'twse' && /[\u4e00-\u9fff]/.test(item.title) ? item.title : null) || VERIFIED_TRANSLATIONS[item.title] || null;
  if (item.kind === 'event') {
    const match = item.title.match(/^(Consumer Price Index|Employment Situation|Producer Price Index|Job Openings and Labor Turnover Survey) for (\w+) (\d{4})$/);
    const names = { 'Consumer Price Index': '消費者物價指數', 'Employment Situation': '就業情勢報告', 'Producer Price Index': '生產者物價指數', 'Job Openings and Labor Turnover Survey': '職缺與勞動流動調查' };
    const months = 'January February March April May June July August September October November December'.split(' ');
    const month = match ? months.indexOf(match[2]) + 1 : 0;
    if (match && month) titleZh = `美國 ${match[3]} 年 ${month} 月${names[match[1]]}`;
  }
  return { ...item, titleZh, translationStatus: titleZh ? 'translated' : 'pending' };
}

// Reviewed headline translations are keyed by the exact original text; changed
// headlines wait for a new review instead of inheriting an inaccurate title.
const VERIFIED_TRANSLATIONS = {
  'CFTC Staff Releases Updates to FAQs Concerning Registrants and Registered Entity Activities Relating to Crypto Assets and Blockchain Technologies': '美國 CFTC 更新加密資產與區塊鏈業務常見問答，涉及註冊機構及登記實體',
  'Spend more than your cash balance: introducing Kraken Borrow for US customers': 'Kraken 推出面向美國用戶的借貸功能 Kraken Borrow',
  'Inside Kraken&#8217;s VIP château retreat: a weekend in Saint-Émilion': 'Kraken 介紹其法國聖愛美濃貴賓活動',
  'CFTC Releases Staff Advisory on Mention Markets': '美國 CFTC 發布 Mention Markets 相關工作人員指引',
  'Earn up to 6% APY on AUSD with Kraken+': 'Kraken+ 宣布 AUSD 存放獎勵方案，標示最高年化 6%',
  'CFTC Innovation Task Force to Host Frontier Forum Series on Innovative Financial Technologies': '美國 CFTC 創新工作小組將舉辦金融科技前沿論壇系列',
  'v32.0rc2: Bitcoin Core 32.0 release candidate 2': '比特幣核心 32.0 第二版候選測試版本發布',
  'The Anthropic Pre-IPO Challenge: compete for $20,000 USDG on Kraken Pro': 'Kraken Pro 宣布 Anthropic 上市前挑戰活動，獎勵標示為 20,000 USDG',
  'CFTC Staff Issues No-Action Position to Providers of Passive Software': '美國 CFTC 工作人員就被動軟體提供者發布不採取執法行動立場',
  'TREAD is available for trading!': 'Kraken 開放 TREAD 交易',
  'GNOT is available for trading!': 'Kraken 開放 GNOT 交易',
  'USDC on Arc deposits and withdrawals now available!': 'Kraken 開放 Arc 網路 USDC 充值與提領',
  'Kraken is an official X Cashtag partner, with trading just a tap away from your timeline': 'Kraken 宣布成為 X Cashtag 合作夥伴，提供交易入口',
  'USDCx on Aleo deposits and withdrawals now available!': 'Kraken 開放 Aleo 網路 USDCx 充值與提領',
  'The new Kraken Wallet: self-custody, now with DeFi Earn': 'Kraken 推出新版自託管錢包，加入 DeFi 收益功能',
  'v32.0rc1: Bitcoin Core 32.0 release candidate 1': '比特幣核心 32.0 第一版候選測試版本發布',
  'CFTC Approves Final Rule Concerning Whistleblower Awards': '美國 CFTC 通過檢舉獎勵相關最終規則',
  'Joint Readout of Principals’ Meeting of UK and U.S. Authorities Regarding Central Counterparty Resolution': '英美主管機關發布中央交易對手處置會議聯合摘要',
  'CFTC Chairman Selig and Kansas State University Announce Agenda for October 22-23 AgCon Conference in Overland Park': '美國 CFTC 主席與堪薩斯州立大學公布 10 月 22 至 23 日農業會議議程',
  'CFTC Staff Issues No-Action Position on Large Trader Reporting for Direct Participants': '美國 CFTC 工作人員就直接參與者的大額交易人申報發布不採取執法行動立場',
  'CFTC Issues Final Rule to Modify Clearing Requirement for Canadian Dollar- and Mexican Peso-Denominated Interest Rate Swaps': '美國 CFTC 修訂加元與墨西哥披索利率交換交易的清算要求',
  'CFTC Further Extends Compliance Date for Amendments to Form PF': '美國 CFTC 再延長 Form PF 修正規定的遵循期限',
  'Bitcoin Core 29.4': '比特幣核心 29.4 正式版本發布',
  'Bitcoin Core 30.3': '比特幣核心 30.3 正式版本發布',
  'Bitcoin Core 31.1': '比特幣核心 31.1 正式版本發布',
  'v29.4rc1: Bitcoin Core 29.4 release candidate 1': '比特幣核心 29.4 第一版候選測試版本發布',
  'v30.3rc1: Bitcoin Core 30.3 release candidate 1': '比特幣核心 30.3 第一版候選測試版本發布',
  'v31.1rc1: Bitcoin Core 31.1 release candidate 1': '比特幣核心 31.1 第一版候選測試版本發布',
  'v27-final: Bitcoin Core 27.x Final': '比特幣核心 27.x 最終版本發布',
  'v26-final: Bitcoin Core 25.x Final': '比特幣核心 25.x 最終版本發布'
};

export async function collect() {
  const old = await readFile(new URL('../data/news.json', import.meta.url), 'utf8').then(JSON.parse).catch(() => null);
  const results = await Promise.allSettled(FEEDS.map(async feed => ({ feed, items: normalizeFeed(await fetchText(feed.url), feed) })));
  const sources = results.map((result, i) => result.status === 'fulfilled'
    ? { id: FEEDS[i].id, status: 'ready', count: result.value.items.length }
    : { id: FEEDS[i].id, status: 'error', message: String(result.reason?.message ?? result.reason).slice(0, 100) });
  const news = [...new Map(results.flatMap((result, i) => result.status === 'fulfilled' ? result.value.items : (old?.news || []).filter(item => item.sourceId === FEEDS[i].id)).map(item => [item.id, item])).values()]
    .sort((a,b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 180);
  if (!news.length && old?.news?.length) news.push(...old.news);
  let events = [];
  try { events = parseBlsCalendar(await fetchText('https://www.bls.gov/schedule/news_release/current_year.asp')); }
  catch (error) { sources.push({ id: 'bls-calendar', status: 'error', message: String(error.message).slice(0,100) }); events = (old?.events ?? []).filter(item => safeUrl(item.link) && Date.parse(item.occursAt) >= Date.now()).map(retainEvent); }
  if (!news.length && !events.length) throw new Error('No verified source data; snapshot not replaced');
  const priorUnlocks = (old?.events || []).filter(item => item.kind === 'token-unlock' && item.sourceId === 'aptos' && item.date && item.sourceUrl && item.status === 'date-only');
  const reviewed = news.map(item => localize({ ...item, markets: ['fed','bls-cpi','bls-jobs'].includes(item.sourceId) ? ['us','forex'] : item.sourceId === 'ecb' ? ['forex'] : item.markets, impact: impact(item.title, item.sourceId, item.link) }, old?.news));
  const comparable = { schemaVersion: 1, news: reviewed.filter(item => item.translationStatus === 'translated'), events: [...events.map(item => localize(item, old?.events)), ...priorUnlocks] };
  const oldComparable = old && { schemaVersion: old.schemaVersion, news: old.news, events: old.events };
  if (JSON.stringify(comparable) === JSON.stringify(oldComparable)) return { changed: false, sources };
  const snapshot = { ...comparable, generatedAt: new Date().toISOString(), sources };
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(new URL('../data/news.json', import.meta.url), JSON.stringify(snapshot, null, 2) + '\n');
  return { changed: true, news: comparable.news.length, pendingTranslation: reviewed.length - comparable.news.length, events: comparable.events.length, sources };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  collect().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error); process.exitCode = 1; });
}
