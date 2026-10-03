import test from 'node:test';
import assert from 'node:assert/strict';
import { USWorkspace, usHomeMarketMetrics } from '../src/markets/us/workspace.js';
import { USAdapter } from '../src/markets/us/provider.js?v=20261002-rank8';

test('US home breadth describes the actual daily stock pool and valid MA coverage', () => {
  const common = { interval: '1D', type: 'stock', price: 100, ma20: 90 };
  const result = usHomeMarketMetrics([
    { ...common, symbol: 'A', changePct: 2 },
    { ...common, symbol: 'B', changePct: -1, price: 80 },
    { ...common, symbol: 'C', changePct: 0, ma20: null },
    { ...common, symbol: 'D', changePct: 1, type: 'ADR' },
    { ...common, symbol: 'A', interval: '1W', changePct: -5 },
    { ...common, symbol: 'SPY', type: 'ETF', changePct: 5 },
    { ...common, symbol: 'LEV', complex: true, changePct: 9 },
    { ...common, symbol: 'MISSING', changePct: null },
  ]);
  assert.equal(result.total, 4);
  assert.equal(result.advancing, 2);
  assert.equal(result.declining, 1);
  assert.equal(result.unchanged, 1);
  assert.equal(result.advanceRatio, 50);
  assert.equal(result.maTotal, 3);
  assert.equal(result.aboveMA, 2);
  assert.equal(result.aboveMARatio, 2 / 3 * 100);
});

test('missing US data has unknown ratios rather than zero market strength', () => {
  const result = usHomeMarketMetrics([]);
  assert.equal(result.total, 0);
  assert.equal(result.advanceRatio, null);
  assert.equal(result.aboveMARatio, null);
});

test('US stock pool does not count duplicate snapshots twice', () => {
  const row = { interval: '1D', type: 'stock', symbol: 'A', changePct: 1, price: 100, ma20: 90 };
  assert.equal(usHomeMarketMetrics([row, { ...row }]).total, 1);
});

test('radar reopening restores visible and accessible scanner controls', () => {
  const mainClasses = new Map(), layoutClasses = new Map(), buttonAttrs = new Map(), scannerAttrs = new Map();
  const scanner = { inert: false, setAttribute: (key, value) => scannerAttrs.set(key, value) };
  const button = { setAttribute: (key, value) => buttonAttrs.set(key, value), getAttribute: key => buttonAttrs.get(key) };
  const layout = { classList: { toggle: (key, value) => layoutClasses.set(key, value) } };
  const main = { classList: { toggle: (key, value) => mainClasses.set(key, value) },
    querySelector: selector => ({ '.us2-scanner': scanner, '[data-collapse]': button, '.us2-radar-layout': layout })[selector] };
  const workspace = { state: {}, root: { querySelector: () => main }, persist() {} };
  USWorkspace.prototype.setScannerCollapsed.call(workspace, true);
  assert.equal(scanner.inert, true);
  assert.equal(scannerAttrs.get('aria-hidden'), 'true');
  assert.equal(buttonAttrs.get('aria-expanded'), 'false');
  USWorkspace.prototype.setScannerCollapsed.call(workspace, false);
  assert.equal(scanner.inert, false);
  assert.equal(scannerAttrs.get('aria-hidden'), 'false');
  assert.equal(mainClasses.get('ox-scanner-collapsed'), false);
  assert.equal(layoutClasses.get('is-collapsed'), false);
  assert.equal(buttonAttrs.get('aria-expanded'), 'true');
  assert.equal(buttonAttrs.get('aria-label'), '收起雷達清單');
});

test('replacing a public widget with a native chart retains the collapsed scanner state', async () => {
  const originalDocument = globalThis.document;
  const originals = Object.fromEntries(['deviceReady','capabilities','snapshot'].map(key => [key, USAdapter[key]]));
  let destroyed = false, button;
  const classList = { add() {}, remove() {}, toggle() {} };
  const scanner = { inert:false, setAttribute() {} };
  const main = { classList, querySelector: selector => selector === '.us2-scanner' ? scanner : selector === '[data-collapse]' ? button : {classList} };
  const root = { classList, querySelectorAll: () => [], querySelector: () => main };
  globalThis.document = { getElementById: () => root, body: { dataset: {} } };
  const workspace = new USWorkspace();
  workspace.state.collapsed = true;
  workspace.cap = { chartMode:'widget' };
  workspace.chart = { root:{}, symbol:'SPY', interval:'1D', destroy() { destroyed = true; } };
  workspace.chartIn = () => {
    const attributes = new Map();
    button = { setAttribute:(key,value) => attributes.set(key,value), getAttribute:key => attributes.get(key) };
    workspace.chart = { setCapabilities() {} };
  };
  for (const method of ['show','updateIdentity','updateCounts','paintList','updateSections','updateLive','lookupQuote','persist']) workspace[method] = () => {};
  workspace.loadDirectory = async () => {};
  USAdapter.deviceReady = async () => null;
  USAdapter.capabilities = async () => ({chartMode:'native',externalDisplayConfirmed:true,mode:'eod'});
  USAdapter.snapshot = async () => ({quotes:[],sessionDate:'2026-09-30'});
  try {
    await workspace.activate('radar');
    assert.equal(destroyed, true);
    assert.equal(scanner.inert, true);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(button.getAttribute('aria-label'), '展開雷達清單');
  } finally {
    Object.assign(USAdapter, originals);
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
