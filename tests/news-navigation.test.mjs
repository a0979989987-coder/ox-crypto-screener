import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('leaving news for settings restores market navigation and supports history', async () => {
  const documentEvents = new Map(), windowEvents = new Map(), entries = [];
  let view = 'media';
  const body = { dataset: { market: 'crypto', newsMode: '0' } };
  const history = { state: null, pushState(state, _, url) { this.state = state; entries.push({ state, url }); } };
  const document = {
    body,
    addEventListener(type, callback) { documentEvents.set(type, callback); },
    getElementById() { return null; },
    querySelector(selector) { return selector === '.app-view.active' ? { dataset: { appView: view } } : null; },
    querySelectorAll() { return []; }
  };
  const window = {
    scrollY: 180,
    addEventListener(type, callback) { windowEvents.set(type, callback); },
    scrollTo() {},
    switchAppView(next) { view = next; documentEvents.get('ox:viewchange')?.({ detail: { to: next } }); }
  };
  const context = vm.createContext({ document, window, history,
    location: { hash: '', pathname: '/ox/', search: '' },
    localStorage: { getItem() { return null; } },
    requestAnimationFrame: callback => callback(), AbortController, setTimeout, clearTimeout,
    fetch: async () => ({ ok: true, json: async () => ({ schemaVersion: 1, news: [], events: [] }) })
  });
  vm.runInContext(await readFile(new URL('../src/components/news/center.js', import.meta.url), 'utf8'), context);
  assert.equal(window.OXNews.unlockCountdown({ status: 'date-only', date: '2026-10-12' }, new Date('2026-09-25T02:00:00Z')), '距官方預估日期 17 天・時間待公布');
  assert.equal(window.OXNews.unlockCountdown({ status: 'confirmed', occursAt: '2026-09-26T02:00:00Z' }, new Date('2026-09-25T02:00:00Z')), '倒數 1 天 00:00:00');
  window.OXNews.open();
  await window.OXNews.refresh();
  const newsEntry = entries.at(-1).state;
  assert.equal(body.dataset.newsMode, '1');
  window.switchAppView('settings');
  assert.equal(body.dataset.newsMode, '0');
  assert.equal(entries.at(-1).url, '/ox/');
  assert.equal(entries.at(-1).state.oxView, 'settings');
  windowEvents.get('popstate')({ state: newsEntry });
  assert.equal(view, 'news');
  assert.equal(body.dataset.newsMode, '1');
  windowEvents.get('popstate')({ state: { oxView: 'settings' } });
  assert.equal(view, 'settings');
  assert.equal(body.dataset.newsMode, '0');
  assert.equal(entries.length, 2, 'history navigation must not create extra entries');
});
