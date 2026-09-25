import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

// Public, first-party feeds only. Feed headlines and source links are republished;
// article bodies and third-party summaries are never copied into the site.
export const FEEDS = [
  { id: 'fed', name: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_monetary.xml', markets: ['us','forex','crypto','tw'] },
  { id: 'bls-cpi', name: 'U.S. BLS · CPI', url: 'https://www.bls.gov/feed/cpi.rss', markets: ['us','forex','crypto','tw'] },
  { id: 'bls-jobs', name: 'U.S. BLS · Employment', url: 'https://www.bls.gov/feed/empsit.rss', markets: ['us','forex','crypto','tw'] },
  { id: 'ecb', name: 'European Central Bank', url: 'https://www.ecb.europa.eu/rss/press.html', markets: ['forex','us'] },
  { id: 'sec', name: 'U.S. SEC', url: 'https://www.sec.gov/news/pressreleases.rss', markets: ['us','crypto'] },
  { id: 'ethereum', name: 'Ethereum Foundation', url: 'https://blog.ethereum.org/feed.xml', markets: ['crypto'] },
  { id: 'kraken', name: 'Kraken', url: 'https://blog.kraken.com/feed', markets: ['crypto'] },
  { id: 'cftc', name: 'U.S. CFTC', url: 'https://www.cftc.gov/RSS/RSSGP/rssgp.xml', markets: ['us','crypto'] },
  { id: 'bitcoin-core', name: 'Bitcoin Core', url: 'https://github.com/bitcoin/bitcoin/releases.atom', markets: ['crypto'] }
];
const OFFICIAL_HOSTS = new Set(['www.federalreserve.gov', 'www.bls.gov', 'www.ecb.europa.eu', 'www.sec.gov', 'blog.ethereum.org', 'blog.kraken.com', 'www.cftc.gov']);

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
    const link = safeUrl(typeof preferred === 'object' ? preferred?.['@_href'] ?? preferred?.['#text'] : preferred);
    const publishedAt = iso(entry.pubDate ?? entry.published ?? entry.updated);
    if (!title || !link || !verifiedForFeed(link, feed) || !publishedAt) return null;
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
  let titleZh = old?.titleZh || null;
  if (item.kind === 'event') {
    const match = item.title.match(/^(Consumer Price Index|Employment Situation|Producer Price Index|Job Openings and Labor Turnover Survey) for (\w+) (\d{4})$/);
    const names = { 'Consumer Price Index': '消費者物價指數', 'Employment Situation': '就業情勢報告', 'Producer Price Index': '生產者物價指數', 'Job Openings and Labor Turnover Survey': '職缺與勞動流動調查' };
    const months = 'January February March April May June July August September October November December'.split(' ');
    const month = match ? months.indexOf(match[2]) + 1 : 0;
    if (match && month) titleZh = `美國 ${match[3]} 年 ${month} 月${names[match[1]]}`;
  }
  return { ...item, titleZh, translationStatus: titleZh ? 'translated' : 'pending' };
}

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
  const comparable = { schemaVersion: 1, news: news.map(item => localize({ ...item, impact: impact(item.title, item.sourceId, item.link) }, old?.news)), events: [...events.map(item => localize(item, old?.events)), ...priorUnlocks] };
  const oldComparable = old && { schemaVersion: old.schemaVersion, news: old.news, events: old.events };
  if (JSON.stringify(comparable) === JSON.stringify(oldComparable)) return { changed: false, sources };
  const snapshot = { ...comparable, generatedAt: new Date().toISOString(), sources };
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(new URL('../data/news.json', import.meta.url), JSON.stringify(snapshot, null, 2) + '\n');
  return { changed: true, news: news.length, events: events.length, sources };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  collect().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error); process.exitCode = 1; });
}
