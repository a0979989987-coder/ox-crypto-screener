import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTWOutlook, nextTWTradingDay } from '../server/markets/tw/outlook.js';
import { tradingCalendar } from '../server/markets/tw/surveillance.js';

const calendar = tradingCalendar([{ Date: '115年9月25日', Name: '中秋節' }, { Date: '115年9月28日', Name: '教師節補假' }]);
test('uses the official holiday schedule for the next trading day', () => {
  assert.equal(nextTWTradingDay(new Date('2026-09-24T15:30:00Z'), calendar), '2026-09-29');
  assert.equal(nextTWTradingDay(new Date('2026-12-31T15:30:00Z'), calendar), null);
});

function response() {
  return { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } };
}

test('shared tally deduplicates a browser and moves its vote atomically', async () => {
  const prev = { UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN, OX_POLL_SECRET: process.env.OX_POLL_SECRET };
  Object.assign(process.env, { UPSTASH_REDIS_REST_URL: 'https://test.example', UPSTASH_REDIS_REST_TOKEN: 'test', OX_POLL_SECRET: 'a'.repeat(40) });
  const votes = new Map();
  const fetcher = async (_, options) => {
    const args = JSON.parse(options.body);
    const [command, , , voteKey, , id, side] = args;
    const key = `${voteKey}:${id}`;
    if (command === 'EVAL') votes.set(key, side);
    const prefix = command === 'EVAL' ? voteKey : args[1].replace(/:counts$/, ':visitors');
    const scores = [...votes.entries()].filter(([k]) => k.startsWith(`${prefix}:`)).map(([, v]) => v);
    const tally = [scores.filter(v => v === 'up').length, scores.filter(v => v === 'down').length];
    const result = command === 'EVAL' ? tally : command === 'HMGET' ? tally : votes.get(`${args[1]}:${args[2]}`) ?? null;
    return { ok: true, async json() { return { result }; } };
  };
  const opts = { calendarLoader: async () => calendar, fetcher, now: new Date('2026-09-27T05:00:00Z') };
  const request = async (method, cookie, side) => {
    const res = response();
    await handleTWOutlook({ method, headers: { host: 'example.test', origin: 'https://example.test', cookie: cookie || '' }, body: { day: '2026-09-29', side } }, res, opts);
    return res;
  };
  try {
    const first = await request('GET');
    assert.equal(first.body.day, '2026-09-29');
    const cookieA = first.headers['Set-Cookie'].split(';')[0];
    const voted = await request('POST', cookieA, 'up');
    assert.deepEqual([voted.body.up, voted.body.down, voted.body.mine], [1, 0, 'up']);
    assert.equal((await request('POST', cookieA, 'up')).body.up, 1);
    const cookieB = (await request('GET')).headers['Set-Cookie'].split(';')[0];
    assert.deepEqual((await request('POST', cookieB, 'down')).body, { day: '2026-09-29', up: 1, down: 1, mine: 'down' });
    assert.deepEqual([(await request('POST', cookieA, 'down')).body.up, (await request('GET', cookieA)).body.down], [0, 2]);
    assert.equal((await request('POST', cookieA, 'invalid')).statusCode, 400);
    assert.equal((await request('POST', cookieA, 'up')).body.up, 1);
  } finally {
    for (const [k, v] of Object.entries(prev)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

test('returns unavailable instead of inventing totals without a shared store', async () => {
  const old = process.env.OX_POLL_SECRET;
  delete process.env.OX_POLL_SECRET;
  try {
    const res = response();
    await handleTWOutlook({ method: 'GET', headers: {} }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'POLL_NOT_CONFIGURED');
  } finally { if (old === undefined) delete process.env.OX_POLL_SECRET; else process.env.OX_POLL_SECRET = old; }
});
