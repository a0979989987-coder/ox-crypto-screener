// Shadow CSS is not render blocking. Mount both palettes before revealing a
// tool, and keep theme changes local to the host so data and gestures survive.
export function revealStyledShadow(shadow, signal, selector = 'main', minHeight = 220) {
  const sheet = shadow.querySelector('link[rel="stylesheet"]');
  const main = shadow.querySelector(selector);
  if (!sheet || !main) return;
  const syncTheme = () => { shadow.host.dataset.oxTheme = document.body.classList.contains('theme-light') ? 'light' : 'dark'; };
  syncTheme();
  document.addEventListener('ox:themechange', syncTheme, { signal });
  const lightSheet = document.createElement('link');
  lightSheet.rel = 'stylesheet';
  lightSheet.href = sheet.href.replace(/\.css(?:\?.*)?$/, '-light.css?v=20261005-risknav4');
  shadow.append(lightSheet);
  const rolesSheet = document.createElement('link');
  rolesSheet.rel = 'stylesheet';
  rolesSheet.href = new URL('../styles/themes/light-tool-roles.css?v=20261005-risknav4', import.meta.url).href;
  shadow.append(rolesSheet);
  const cloak = document.createElement('style');
  cloak.textContent = `${selector}{display:none!important}.ox-style-loading{box-sizing:border-box;min-height:${minHeight}px;display:grid;place-items:center;padding:10px;border:1px solid #8883;border-radius:12px;color:var(--ox-light-muted,#969ba3);background:var(--ox-light-panel,#101216);font:13px/1.6 system-ui}`;
  const shell = document.createElement('div');
  shell.className = 'ox-style-loading';shell.setAttribute('role','status');
  if (globalThis.OXLoading) shell.innerHTML = OXLoading.markup('介面載入中'); else shell.textContent = '介面載入中…';
  if (globalThis.OXLoading) { const style=document.createElement('style');style.textContent=OXLoading.css;shadow.append(style); }
  shadow.prepend(cloak);shadow.append(shell);
  const pending = new Set([sheet, lightSheet, rolesSheet].filter(link => !link.sheet));
  const reveal = () => {if (!pending.size) {cloak.remove();shell.remove();}};
  for (const link of pending) {
    link.addEventListener('load', () => {pending.delete(link);reveal();}, {once:true,signal});
    link.addEventListener('error', () => {shell.textContent='介面樣式未能載入，請重新整理。';}, {once:true,signal});
  }
  reveal();
}
