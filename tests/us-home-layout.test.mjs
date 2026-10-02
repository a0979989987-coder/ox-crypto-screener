import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../src/markets/us/workspace.js', import.meta.url), 'utf8');
const renderHome = source.slice(source.indexOf('  renderHome(main) {'), source.indexOf('  updateHome() {'));
const template = renderHome.match(/main\.innerHTML = (\x60[\s\S]*\x60);\n/)[1];
const html = new Function('e', 'EOD_INTERVALS', 'return ' + template).call(
  {state:{homeSymbol:'SPY', homeInterval:'1D'}}, value => value, ['1D','1W','1M'],
);

test('US home summary headings do not inherit the global shell header treatment', () => {
  assert.equal((html.match(/<div class="ox-home-t1-head">/g) || []).length, 2);
  assert.doesNotMatch(html, /<header\b/);
  assert.match(html, /<span>自選摘要<\/span>/);
  assert.match(html, /<span>類股 ETF<\/span>/);
  assert.match(html, /data-home-watch aria-label="查看自選雷達"/);
});

test('US home event heading retains its semantic heading and event shortcut', () => {
  assert.match(html, /<div class="ox-analysis-heading"><h2>重要事件<\/h2>/);
  assert.match(html, /data-home-events aria-label="查看美股事件"/);
  assert.match(html, /<div class="us2-home-events"><\/div>/);
});

test('US event heading stays at the start of the desktop event grid row', async () => {
  const css = await readFile(new URL('../src/styles/markets/us.css', import.meta.url), 'utf8');
  assert.match(css, /\.us2-home-pane \.ox-analysis-heading\s*\{\s*align-self:\s*start\s*\}/);
});
