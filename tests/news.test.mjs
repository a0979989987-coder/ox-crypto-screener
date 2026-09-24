import test from 'node:test';
import assert from 'node:assert/strict';
import { impact, normalizeFeed, parseBlsCalendar, mergeNews, FEEDS } from '../scripts/collect-news.mjs';

test('news normalization retains only dated HTTPS source headlines', () => {
  const feed = { id: 'bls-cpi', name: 'BLS', markets: ['us','forex'] };
  const xml = '<feed><entry><title>Consumer Price Index released</title><link href="https://www.bls.gov/one"/><published>2026-09-24T12:30:00Z</published></entry><entry><title>Undated</title><link href="https://www.bls.gov/two"/></entry></feed>';
  const items = normalizeFeed(xml, feed);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].markets, ['us','forex']);
  assert.equal(items[0].impact.stars, 5);
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

test('failed source retains only recent prior headlines while successful feeds replace their own', () => {
  const now = Date.parse('2026-09-24T12:00:00Z');
  const old = { news: [
    { id: 'old-fed', sourceId: FEEDS[0].id, publishedAt: '2026-09-23T12:00:00Z' },
    { id: 'stale-fed', sourceId: FEEDS[0].id, publishedAt: '2026-08-01T12:00:00Z' },
    { id: 'old-bls', sourceId: FEEDS[1].id, publishedAt: '2026-09-23T12:00:00Z' }
  ] };
  const results = FEEDS.map((feed, index) => index === 0
    ? { status: 'rejected', reason: Error('network') }
    : { status: 'fulfilled', value: { items: index === 1 ? [{ id: 'new-bls', sourceId: feed.id, publishedAt: '2026-09-24T11:00:00Z' }] : [] } });
  assert.deepEqual(mergeNews(results, old, now).map(item => item.id), ['new-bls', 'old-fed']);
});
