import test from 'node:test';
import assert from 'node:assert/strict';
import { loopbackRequest, privateUSPreview } from '../server/markets/us/private-preview.js';
import { nativeAllowed } from '../src/markets/us/view-utils.js';
import { resetCache, cachedRequest } from '../server/markets/us/cache.js';
import { resetBudget } from '../server/markets/us/budget.js';
import { nyEpoch } from '../src/markets/us/calendar.js';
test('private API requires loopback socket, Host and browser Origin', () => {
  const request = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:4173' } };
  assert.equal(loopbackRequest(request), true);
  for (const headers of [{ host: 'attacker.test' }, { host: '127.0.0.1', origin: 'https://attacker.test' },
    { host: '127.0.0.1', 'sec-fetch-site': 'cross-site' }])
    assert.equal(loopbackRequest({ ...request, headers }), false);
  assert.equal(loopbackRequest({ ...request, socket: { remoteAddress: '192.168.1.2' } }), false);
});
test('private closing capability does not grant public rights or call intraday providers', async () => {
  const api=privateUSPreview({financeUpstream:()=>{throw Error('forbidden');}});
  const cap=await api('capabilities',{});
  assert.equal(cap.privateValidation,true);assert.equal(cap.externalDisplayConfirmed,false);
  assert.equal(cap.source,'finance-query-eod-private');assert.equal(cap.pollMs,0);
  assert.deepEqual(cap.intervals,['1D','1W','1M']);
  await assert.rejects(api('chart-v2',{symbol:'SPY',interval:'1m'}));
});
test('private flag cannot enable native data on public browser origins', () => {
  const old = globalThis.location;
  try {
    for (const hostname of ['example.com', 'ox-crypto-screener.vercel.app']) {
      globalThis.location = { hostname };
      assert.equal(nativeAllowed({ privateValidation: true, externalDisplayConfirmed: false }), false);
    }
    globalThis.location = { hostname: '127.0.0.1' };
    assert.equal(nativeAllowed({ privateValidation: true, externalDisplayConfirmed: false }), true);
    assert.equal(nativeAllowed({ externalDisplayConfirmed: false }), false);
  } finally { if (old === undefined) delete globalThis.location; else globalThis.location = old; }
});
test('a longer provider Retry-After is preserved instead of retrying at sixty seconds', async t => {
  resetCache(); let now = 1000000, calls = 0;
  t.mock.method(Date, 'now', () => now);
  await assert.rejects(cachedRequest('limited', () => {
    calls++; throw Object.assign(Error('quota'), { status: 429, retryAfter: 180 });
  }));
  now += 61000;
  await assert.rejects(cachedRequest('another', () => { calls++; return {}; }),
    error => error.code === 429 && error.retryAfter === 119);
  assert.equal(calls, 1); resetCache();
});
