import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

// Public, first-party feeds only. Feed headlines and source links are republished;
// article bodies and third-party summaries are never copied into the site.
export const FEEDS = [
  { id: 'fed', name: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_monetary.xml', markets: ['us','forex','crypto','tw'] },
  { id: 'bls-cpi', name: 'U.S. BLS · CPI', url: 'https://www.bls.gov/feed/cpi.rss', markets: ['us','forex','crypto','tw'] },
  { id: 'bls-jobs', name: 'U.S. BLS · Employment', url: 'https://www.bls.gov/feed/empsit.rss', markets: ['us','forex','crypto','tw'] },
  { id: 'ecb', name: 'European Central Bank', url: 'https://www.ecb.europa.eu/rss/press.html', markets: ['forex','us'] },
  { id: 'sec', name: 'U.S. SEC', url: 'https://www.sec.gov/news/pressreleases.rss', markets: ['us','crypto'] },
  { id: 'ethereum', name: 'Ethereum Foundation', url: 'https://blog.ethereum.org/feed.xml', markets: ['crypto'] }
];

const parser = new XMLParser({ ignoreAttributes: false, processEntities: true, trimValues: true });
const array = value => value == null ? [] : Array.isArray(value) ? value : [value];
const plain = value => String(typeof value === 'object' ? value?.['#text'] ?? '' : value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 20);
const iso = value => { const ms = Date.parse(String(value ?? '')); return Number.isFinite(ms) ? new Date(ms).toISOString() : null; };
const safeUrl = value => { try { const u = new URL(plain(value)); return u.protocol === 'https:' ? u.href : null; } catch { return null; } };

export function impact(title, sourceId) {
  const text = String(title).toLowerCase();
  if (sourceId === 'sec' && /bitcoin|crypto|digital asset|spot etf|exchange.traded fund/i.test(text))
    return { stars: 4, reason: '數位資產相關官方監管公告', ruleVersion: 'headline-v1', confidence: '標題關鍵字', sourceId };
  const rules = [
    { pattern: /fomc statement|interest rate|rate decision|consumer price index|employment situation|nonfarm|cpi\b|貨幣政策|利率決議/i, stars: 5, reason: '央行決策或核心總經數據' },
    { pattern: /inflation|jobs|unemployment|monetary policy|gdp|gross domestic product|producer price|job openings|網路升級|network upgrade/i, stars: 4, reason: '總經、政策或主要網路事件' },
    { pattern: /regulation|protocol|fork|upgrade/i, stars: 3, reason: '監管或技術變動' }
  ];
  const matched = rules.find(rule => rule.pattern.test(text));
  return { stars: matched?.stars ?? null, reason: matched?.reason ?? '尚無足夠規則判定影響力', ruleVersion: 'headline-v1', confidence: matched ? '標題關鍵字' : '待評估', sourceId };
}

export function normalizeFeed(xml, feed) {
  const parsed = parser.parse(xml);
  const raw = array(parsed?.rss?.channel?.item ?? parsed?.feed?.entry);
  return raw.map(entry => {
    const title = plain(entry.title);
    const link = safeUrl(typeof entry.link === 'object' ? entry.link?.['@_href'] ?? entry.link?.['#text'] : entry.link);
    const publishedAt = iso(entry.pubDate ?? entry.published ?? entry.updated);
    if (!title || !link || !publishedAt) return null;
    const relevantMarkets = feed.id === 'sec' && !/bitcoin|crypto|digital asset|spot etf|exchange.traded fund/i.test(title) ? ['us'] : feed.markets;
    return { id: hash(link), title, link, publishedAt, source: feed.name, sourceId: feed.id,
      markets: relevantMarkets, kind: 'news', verified: 'official-source', impact: impact(title, feed.id) };
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
    events.push({ id: hash(`bls:${date}:${title}`), title, link: 'https://www.bls.gov/schedule/news_release/current_year.asp', occursAt,
      source: 'U.S. BLS', sourceId: 'bls-calendar', markets: ['us','forex','crypto','tw'], kind: 'event', status: 'confirmed', originalZone: 'America/New_York', impact: impact(title, 'bls-calendar') });
  }
  return events.sort((a,b) => a.occursAt.localeCompare(b.occursAt));
}

export async function collect() {
  const old = await readFile(new URL('../data/news.json', import.meta.url), 'utf8').then(JSON.parse).catch(() => null);
  const results = await Promise.allSettled(FEEDS.map(async feed => ({ feed, items: normalizeFeed(await fetchText(feed.url), feed) })));
  const sources = results.map((result, i) => result.status === 'fulfilled'
    ? { id: FEEDS[i].id, status: 'ready', count: result.value.items.length }
    : { id: FEEDS[i].id, status: 'error', message: String(result.reason?.message ?? result.reason).slice(0, 100) });
  const news = [...new Map(results.flatMap(result => result.status === 'fulfilled' ? result.value.items : []).map(item => [item.id, item])).values()]
    .sort((a,b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 180);
  if (!news.length && old?.news?.length) news.push(...old.news);
  let events = [];
  try { events = parseBlsCalendar(await fetchText('https://www.bls.gov/schedule/news_release/current_year.asp')); }
  catch (error) { sources.push({ id: 'bls-calendar', status: 'error', message: String(error.message).slice(0,100) }); events = old?.events ?? []; }
  if (!news.length && !events.length) throw new Error('No verified source data; snapshot not replaced');
  const comparable = { schemaVersion: 1, news, events };
  const oldComparable = old && { schemaVersion: old.schemaVersion, news: old.news, events: old.events };
  if (JSON.stringify(comparable) === JSON.stringify(oldComparable)) return { changed: false, sources };
  const snapshot = { ...comparable, generatedAt: new Date().toISOString(), sources };
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(new URL('../data/news.json', import.meta.url), JSON.stringify(snapshot, null, 2) + '\n');
  return { changed: true, news: news.length, events: events.length, sources };
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  collect().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error); process.exitCode = 1; });
}
