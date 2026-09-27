// Deliberately independent from the classic radar and every non-Crypto module.
// Only this small launcher is loaded at boot; chart/data modules are loaded on demand.
const section = document.querySelector('#view-strength .strength-page');
if (section) {
  const launcher = document.createElement('div'); launcher.id = 'ox-crypto-flow-launcher'; launcher.hidden = true;
  const shadow = launcher.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>:host{display:block;margin:20px 0}:host([hidden]){display:none}button{font:inherit;color:#eee;background:linear-gradient(120deg,#273238,#151b20);border:1px solid #4b595e;border-radius:14px;padding:18px 22px;display:flex;align-items:center;gap:20px;width:100%;text-align:left;cursor:pointer}button:focus-visible{outline:2px solid #fff;outline-offset:4px}small{display:block;font-size:10px;color:#b4c0c5;letter-spacing:1.5px;margin-bottom:5px}strong{font-weight:500;font-size:17px}span{margin-left:auto;font-size:12px;color:#d1dadb}@media(max-width:600px){button{padding:16px}strong{font-size:15px}span{font-size:10px}}</style><button type="button" aria-label="開啟 Crypto 工具預覽"><div><small>OX CRYPTO TOOLS · PREVIEW</small><strong>加密市場工具</strong></div><span>板塊輪動・熱力圖・訂單流 →</span></button>`;
  section.querySelector('.page-hero')?.after(launcher);
  let dialog = null, instance = null, opening = 0, previousOverflow = '';
  const isCrypto = () => (document.body.dataset.market || 'crypto') === 'crypto';
  function close() {
    ++opening; instance?.destroy(); instance = null;
    if (dialog) { dialog.close(); dialog.remove(); dialog = null; document.body.style.overflow = previousOverflow; }
    if (!launcher.hidden) shadow.querySelector('button').focus();
  }
  function sync() { launcher.hidden = !isCrypto(); if (!isCrypto()) close(); }
  shadow.querySelector('button').addEventListener('click', async () => {
    if (!isCrypto() || dialog) return;
    const token = ++opening; const button = shadow.querySelector('button'); button.disabled = true;
    try {
      const { mountCryptoFlow } = await import('./flow-view.js');
      if (token !== opening || !isCrypto()) return;
      dialog = document.createElement('dialog'); dialog.setAttribute('aria-label', 'OX Crypto 工具預覽');
      dialog.style.cssText = 'inset:0;width:100vw;max-width:none;height:100dvh;max-height:none;margin:0;padding:0;border:0;background:#0d1012;overflow:auto;color:#f0eee8;';
      const host = document.createElement('div'); dialog.append(host); document.body.append(dialog);
      previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
      dialog.addEventListener('cancel', e => { e.preventDefault(); if (!instance?.closeInner()) close(); });
      dialog.showModal(); instance = mountCryptoFlow(host, { onExit: close });
    } finally { button.disabled = false; }
  });
  document.addEventListener('ox:marketchange', sync);
  document.addEventListener('ox:viewchange', e => { if (e.detail?.to !== 'strength') close(); sync(); });
  sync();
}
