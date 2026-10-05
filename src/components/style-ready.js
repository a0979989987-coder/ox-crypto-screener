// Keep real layout dimensions while loading CSS: canvas tools measure their
// container during mount. Only styled, fully prepared controls become visible.
export function guardStyledContent(container, main, links, signal, selector = 'main', minHeight = 220) {
  if (!main || signal?.aborted) return;
  const host = container.host || container;
  const cloak = document.createElement('style');
  cloak.textContent = `${selector},${selector} *{visibility:hidden!important;pointer-events:none!important}.ox-style-loading{box-sizing:border-box;position:absolute;inset:0;z-index:2;min-height:${minHeight}px;display:grid;place-content:center;gap:12px;padding:14px;border:1px solid #8883;border-radius:12px;color:var(--ox-light-muted,#969ba3);background:var(--ox-light-panel,#101216);font:13px/1.6 system-ui}.ox-style-loading button{font:inherit;min-height:36px;padding:6px 14px;color:inherit;background:transparent;border:1px solid currentColor;border-radius:9px;cursor:pointer}`;
  const position = host.style?.position;
  if (host.style) host.style.position = 'relative';
  main.inert = true; main.setAttribute?.('aria-busy', 'true');
  const shell = document.createElement('div'); shell.className = 'ox-style-loading'; shell.setAttribute('role','status');
  const syncShell=()=>{shell.style.background=document.body.classList.contains('theme-light')?'#ffffff':'#101216';shell.style.color=document.body.classList.contains('theme-light')?'#697384':'#969ba3';};
  syncShell();document.addEventListener('ox:themechange',syncShell,{signal});
  const message = document.createElement('span'); message.textContent = '介面載入中…'; shell.append(message);
  const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重試'; retry.hidden = true; shell.append(retry);
  container.prepend(cloak); container.append(shell);
  let timer, poll, finished = false, attempt = 0;
  const readyLinks = new Set();
  // A sheet may expose rules before it has finished loading (including imports).
  // Only a completed load event is allowed to release the loading screen.
  const readable = link => readyLinks.has(link);
  function stop() { clearTimeout(timer); clearInterval(poll); }
  function check() {
    if (finished || signal?.aborted) return;
    if (!links.every(link => readable(link))) return;
    finished = true; stop(); cloak.remove(); shell.remove(); main.inert = false; main.removeAttribute?.('aria-busy');
    if (main.dataset.stylePending === 'true') { main.style.removeProperty('visibility'); delete main.dataset.stylePending; }
    if (host.style) host.style.position = position || '';
    // Observers see the final CSS geometry before charts redraw.
    requestAnimationFrame(() => { if (!signal?.aborted) window.dispatchEvent(new Event('resize')); });
  }
  function reload() {
    if (finished || signal?.aborted) return;
    stop(); attempt++; retry.hidden = true; message.textContent = '介面載入中…';
    for (const link of links.filter(link => !readable(link))) {
      const url = new URL(link.href, document.baseURI); url.searchParams.set('oxStyleRetry', `${attempt}-${Date.now()}`); link.href = url.href;
    }
    watch();
  }
  function failed() {
    if (finished || signal?.aborted) return;
    if (attempt < 2) { reload(); return; }
    stop(); message.textContent = '介面暫時無法載入'; retry.hidden = false;
  }
  function watch() { poll = setInterval(check, 100); timer = setTimeout(failed, 6000); check(); }
  for (const link of links) {
    link.addEventListener('load', () => { readyLinks.add(link); check(); }, {signal});
    link.addEventListener('error', failed, {signal});
  }
  retry.addEventListener('click', () => { attempt = 0; reload(); }, {signal});
  signal?.addEventListener('abort', () => { finished = true; stop(); shell.remove(); }, {once:true});
  watch();
  return { retry: reload };
}
export function revealStyledShadow(shadow, signal, selector = 'main', minHeight = 220) {
  const mobileStyle = document.createElement('style');
  mobileStyle.textContent='@media(max-width:700px),(pointer:coarse){:host,*{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;scrollbar-width:none}*::-webkit-scrollbar{display:none;width:0;height:0}button,[role=tab],a{touch-action:manipulation}input,textarea,[contenteditable=true]{-webkit-user-select:text;user-select:text;-webkit-touch-callout:default;font-size:max(16px,1em)}}';
  mobileStyle.textContent += globalThis.OXLoading?.css || '';
  shadow.append(mobileStyle);
  const sheet = shadow.querySelector('link[rel="stylesheet"]'), main = shadow.querySelector(selector);
  if (!sheet || !main) return;
  const syncTheme = () => { shadow.host.dataset.oxTheme = document.body.classList.contains('theme-light') ? 'light' : 'dark'; };
  syncTheme(); document.addEventListener('ox:themechange', syncTheme, {signal});
  const lightSheet = document.createElement('link'); lightSheet.rel = 'stylesheet';
  lightSheet.href = sheet.href.replace(/\.css(?:\?.*)?$/, '-light.css?v=20261005-tools12'); shadow.append(lightSheet);
  const rolesSheet = document.createElement('link'); rolesSheet.rel = 'stylesheet';
  rolesSheet.href = new URL('../styles/themes/light-tool-roles.css?v=20261005-graytop5', import.meta.url).href; shadow.append(rolesSheet);
  return guardStyledContent(shadow, main, [sheet, lightSheet, rolesSheet], signal, selector, minHeight);
}
