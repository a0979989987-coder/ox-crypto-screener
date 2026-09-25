import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('Safari toolbar resizes do not repeatedly redraw an unchanged chart', () => {
  const source = readFileSync(new URL('../src/app/view-home-theme.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('function resizeChartToContainer()'), source.indexOf('\nfunction setChartFocus('));
  const sizes = [];
  const container = { clientWidth: 320, clientHeight: 440 };
  const state = { chart: { applyOptions: size => sizes.push(size) } };
  const resize = runInNewContext(`${fn}\nresizeChartToContainer`, {
    state,
    document: { getElementById: () => container },
    applyChartFutureSpace() {},
    requestAnimationFrame() {},
    updateKeyLevelVisualLabels() {}
  });
  resize();
  resize();
  assert.equal(sizes.length, 1);
  assert.equal(sizes[0].width, 320);
  assert.equal(sizes[0].height, 440);
  container.clientHeight = 460;
  resize();
  assert.equal(sizes.at(-1).width, 320);
  assert.equal(sizes.at(-1).height, 460);
  assert.equal(sizes.length, 2);
});
