import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSnapshotLoader } from '../src/markets/tw/etf/static-snapshot.js';

test('published ETF snapshots supply both Pages tools without an API endpoint', async () => {
  const base = new URL('../', import.meta.url);
  const requests = [];
  const load = createSnapshotLoader(async url => {
    requests.push(url.pathname);
    try { return { ok: true, json: () => readFile(url, 'utf8').then(JSON.parse) }; }
    catch { return { ok: false, status: 404 }; }
  }, base);
  const catalog = await load('catalog');
  assert.ok(catalog.snapshot);
  assert.ok(catalog.rows.length > 100);
  const history = await load('history', { symbols: '0050,006208' });
  assert.equal(history.rows.length, 2);
  assert.ok(history.rows.every(row => row.monthly?.length));
  const first = await load('holdings', { symbol: '0050' });
  const second = await load('holdings', { symbol: '006208' });
  assert.ok(first.holdings.length >= 20);
  assert.ok(second.holdings.length >= 20);
  assert.ok(first.date && second.date);
  const radar = await load('radar');
  assert.ok(radar.rows.length > 0);
  assert.ok(requests.every(path => path.includes('/data/tw-etf/')));
});
