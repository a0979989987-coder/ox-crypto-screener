import test from 'node:test';
import assert from 'node:assert/strict';
const directory = { schemaVersion:2, items:[{symbol:'SPY',name:'Reference metadata',type:'ETF'}] };
test('static directory failure falls back to the named backend and caches only validated metadata', async () => {
  const previous = globalThis.fetch, calls = [];
  try {
    globalThis.fetch = async url => {
      calls.push(String(url));
      return calls.length === 1 ? new Response('Not found', {status:404}) : Response.json({ok:true,data:directory});
    };
    const {USAdapter} = await import('../src/markets/us/provider.js?directory-fallback-test');
    assert.equal((await USAdapter.directory()).items[0].symbol, 'SPY');
    assert.equal((await USAdapter.directory()).items[0].symbol, 'SPY');
    assert.equal(calls.length, 2);
    assert.match(calls[0], /data\/us-directory\.json$/);
    assert.match(calls[1], /\/api\/v1\/us\/directory$/);
  } finally { globalThis.fetch = previous; }
});
test('cancelled directory request does not start a backup request', async () => {
  const previous = globalThis.fetch, controller = new AbortController(); let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; controller.abort(); throw new DOMException('Aborted', 'AbortError'); };
    const {USAdapter} = await import('../src/markets/us/provider.js?directory-abort-test');
    await assert.rejects(USAdapter.directory({signal:controller.signal}), {name:'AbortError'});
    assert.equal(calls, 1);
  } finally { globalThis.fetch = previous; }
});
