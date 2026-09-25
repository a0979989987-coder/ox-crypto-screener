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
  { id: 'ethereum', name: 'Ethereum Foundation', url: 'https://blog.ethereum.org/feed.xml', markets: ['crypto'] }
];
const OFFICIAL_HOSTS = new Set(['www.federalreserve.gov', 'www.bls.gov', 'www.ecb.europa.eu', 'www.sec.gov', 'blog.ethereum.org']);

const parser = new XMLParser({ ignoreAttributes: false, processEntities: true, trimValues: true });
const array = value => value == null ? [] : Array.isArray(value) ? value : [value];
const plain = value => String(typeof value === 'object' ? value?.['#text'] ?? '' : value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 20);
const iso = value => { const ms = Date.parse(String(value ?? '')); return Number.isFinite(ms) ? new Date(ms).toISOString() : null; };
const safeUrl = value => { try { const u = new URL(plain(value)); return u.protocol === 'https:' && OFFICIAL_HOSTS.has(u.hostname) ? u.href : null; } catch { return null; } };

export function impact(title, sourceId) {
  // A headline alone cannot establish importance or direction. Keep the rating unassessed.
  return { stars: null, reason: '尚未評估；標題不足以判定影響力', ruleVersion: 'unassessed-v1', evidence: null, sourceConfidence: 'official-source', analysisConfidence: null, direction: null, sourceId };
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
    events.push({ id: hash(`bls:${date}:${title}`), title, link: 'https://www.bls.gov/schedule/news_release/current_year.asp', sourceUrl: 'https://www.bls.gov/schedule/news_release/current_year.asp', occursAt,
      source: 'U.S. BLS', sourceId: 'bls-calendar', markets: ['us','forex','crypto','tw'], symbols: [], kind: 'event', status: 'confirmed', originalTimezone: 'America/New_York', previous: null, consensus: null, actual: null, revised: null, updatedAt: null, impact: impact(title, 'bls-calendar') });
  }
  return events.sort((a,b) => a.occursAt.localeCompare(b.occursAt));
}

const retainEvent = item => ({ ...item, sourceUrl: item.sourceUrl ?? item.link ?? null,
  originalTimezone: item.originalTimezone ?? item.originalZone ?? null,
  symbols: item.symbols ?? [], previous: item.previous ?? null, consensus: item.consensus ?? null,
  actual: item.actual ?? null, revised: item.revised ?? null, updatedAt: item.updatedAt ?? null,
  impact: impact(item.title, item.sourceId) });

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
  const comparable = { schemaVersion: 1, news, events };
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
