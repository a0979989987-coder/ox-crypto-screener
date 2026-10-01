import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

// Isolated UI fixtures. No real provider, email, account, or signed-in browser.
const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const markup = html.slice(html.indexOf('<div class="ox-account-overlay"'), html.indexOf('<main class="wrap"'));
const style = readFileSync(resolve(root, 'src/styles/account/account.css'), 'utf8');
const foundation = readFileSync(resolve(root, 'src/styles/core/foundation.css'), 'utf8');
const executablePath = process.env.OX_TEST_BROWSER || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const page = await browser.newPage();
  const calls = [], errors = [];
  let configured = true, user = null;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://ox.test/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="UTF-8"><style>${foundation}\n${style}</style></head><body><button data-ox-account-open>登入 / 註冊</button>${markup}<script src="/auth.js"></script><script src="/session.js"></script><script src="/account.js"></script></body></html>` });
    if (['/auth.js', '/session.js', '/account.js'].includes(path)) return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(root, 'src/components/account', path.slice(1)), 'utf8') });
    const endpoint = path.split('/').at(-1);
    calls.push({ endpoint, method: request.method(), body: request.postDataJSON() });
    const result = endpoint === 'config' ? { configured } : endpoint === 'session' ? { ok: true, user } : endpoint === 'email' ? { ok: true, message: '登入連結已寄出' } : endpoint === 'logout' ? { ok: true } : { ok: false, message: '服務暫時無法使用' };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
  });
  await page.goto('https://ox.test/');
  await page.locator('#ox-account-auth-status').filter({ hasText: '登入連結' }).waitFor({ state: 'attached' });
  await page.locator('[data-ox-account-open]').click();
  await page.locator('#ox-account-tab-register').click();
  assert.equal(await page.locator('.ox-account-password-wrap').isVisible(), false);
  await page.locator('#ox-account-email').fill('fixture@example.com');
  await page.locator('#ox-account-email-submit').click();
  await page.locator('#ox-account-auth-status').filter({ hasText: '已寄出' }).waitFor();
  assert.equal(calls.find(call => call.endpoint === 'email').body.register, true);
  assert.equal(calls.find(call => call.endpoint === 'email').body.email, 'fixture@example.com');
  await page.locator('#ox-account-google').click();
  await page.locator('#ox-account-auth-status').filter({ hasText: '暫時無法使用' }).waitFor();
  assert.equal(await page.locator('#ox-account-google').isEnabled(), true);
  user = { id: 'fixture-member', email: 'fixture@example.com', displayName: '<img src=x onerror=alert(1)>', createdAt: '2026-09-30T00:00:00Z', methods: ['google'], accountStorage: 'stored' };
  await page.reload();
  await page.waitForFunction(() => window.OXAuth?.user?.id === 'fixture-member');
  await page.locator('[data-ox-account-open]').click();
  await page.locator('#ox-account-center').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#ox-account-center').isVisible(), true);
  assert.equal(await page.locator('#ox-account-profile img').count(), 0);
  assert.match(await page.locator('#ox-account-profile').innerText(), /會員資料已儲存/);
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await page.locator('.ox-account-shell').boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391, 'Mobile account shell must fit viewport');
  assert.equal(await page.locator('#ox-account-profile').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
  await page.locator('#ox-account-signout').click();
  await page.waitForFunction(() => window.OXAuth.user === null);
  user = null;
  await page.goto('https://ox.test/?ox_auth=error&ox_auth_reason=exchange_failed');
  await page.locator('#ox-account-overlay').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !location.search.includes('ox_auth'));
  assert.match(await page.locator('#ox-account-auth-status').innerText(), /exchange_failed/);
  assert.doesNotMatch(await page.locator('#ox-account-auth-status').innerText(), /同一個瀏覽器/);
  await page.locator('#ox-account-google').click();
  assert.equal(calls.filter(call => call.endpoint === 'google').at(-1).body.returnTo.includes('ox_auth'), false);
  user = { id: 'fixture-member', email: 'fixture@example.com', displayName: 'Fixture', createdAt: '2026-09-30T00:00:00Z', methods: ['google'], accountStorage: 'stored' };
  await page.goto('https://ox.test/?ox_auth=error&ox_auth_reason=flow_missing');
  await page.waitForFunction(() => window.OXAuth?.user?.id === 'fixture-member' && !location.search.includes('ox_auth'));
  assert.equal(await page.locator('#ox-account-overlay').isVisible(), false);
  user = null;
  configured = false; calls.length = 0;
  await page.reload();
  await page.locator('#ox-account-auth-status').filter({ hasText: '尚未設定' }).waitFor({ state: 'attached' });
  assert.equal(calls.some(call => call.endpoint === 'session'), false);
  assert.deepEqual(errors, []);
  console.log('Account UI passed: Magic Link registration, Google failure recovery, member profile escaping/storage status, mobile viewport, logout, unconfigured guest mode. Synthetic fixtures only.');
} finally { await browser.close(); }
