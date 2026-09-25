import test from 'node:test';
import assert from 'node:assert/strict';
import { FEEDS, impact, normalizeFeed, parseBlsCalendar } from '../scripts/collect-news.mjs';

test('news normalization retains only dated HTTPS source headlines', () => {
  const feed = { id: 'bls-cpi', name: 'BLS', markets: ['us','forex'] };
  const xml = '<feed><entry><title>Consumer Price Index released</title><link href="https://www.bls.gov/one"/><published>2026-09-24T12:30:00Z</published></entry><entry><title>Undated</title><link href="https://www.bls.gov/two"/></entry></feed>';
  const items = normalizeFeed(xml, feed);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].markets, ['us','forex']);
  assert.equal(items[0].impact.stars, null);
});

test('BLS calendar converts confirmed New York release time across daylight saving', () => {
  const html = '<tr><td class="date-cell"><p>Wednesday, October 14, 2026</p></td><td class="time-cell"><p>08:30 AM</p></td><td class="desc-cell"><p><strong>Consumer Price Index</strong> for September 2026</p></td></tr><tr><td class="date-cell"><p>Wednesday, December 9, 2026</p></td><td class="time-cell"><p>08:30 AM</p></td><td class="desc-cell"><p><strong>Employment Situation</strong> for November 2026</p></td></tr>';
  const events = parseBlsCalendar(html, Date.parse('2026-09-24'));
  assert.equal(events[0].occursAt, '2026-10-14T12:30:00.000Z');
  assert.equal(events[1].occursAt, '2026-12-09T13:30:00.000Z');
  assert.equal(events[0].status, 'confirmed');
});

test('unmatched headline has no invented importance score', () => {
  assert.equal(impact('Routine agency publication', 'sec').stars, null);
});

test('rejects feed entries whose source link leaves the official domains', () => {
  assert.equal(normalizeFeed('<rss><channel><item><title>Claim</title><link>https://example.com/claim</link><pubDate>Thu, 24 Sep 2026 12:30:00 GMT</pubDate></item></channel></rss>', FEEDS[0]).length, 0);
});

import { localize } from '../scripts/collect-news.mjs';
import { readFile } from 'node:fs/promises';

test('published snapshot has Chinese titles and retains official originals', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../data/news.json', import.meta.url)));
  for (const item of [...snapshot.news, ...snapshot.events]) {
    assert.match(item.titleZh, /[\u4e00-\u9fff]/);
    assert.ok(item.title && item.link.startsWith('https://'));
    assert.equal(item.translationStatus, 'translated');
  }
});

test('translation cannot survive a changed source title or identity', () => {
  const old = { id: 'one', title: 'Original', titleZh: '原始標題' };
  assert.equal(localize(old, [old]).titleZh, '原始標題');
  assert.equal(localize({ ...old, title: 'Correction' }, [old]).translationStatus, 'pending');
  assert.equal(localize({ ...old, id: 'two' }, [old]).titleZh, null);
});

test('calendar translates reporting period without changing release time', () => {
  const event = { kind: 'event', title: 'Consumer Price Index for September 2026', occursAt: '2026-10-14T12:30:00.000Z' };
  const translated = localize(event);
  assert.equal(translated.titleZh, '美國 2026 年 9 月消費者物價指數');
  assert.equal(translated.occursAt, event.occursAt);
  assert.equal(localize({ ...event, title: 'Consumer Price Index for Invalid 2026' }).titleZh, null);
});
