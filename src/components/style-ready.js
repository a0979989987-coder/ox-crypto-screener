// Shadow stylesheets do not block first paint. Keep their content behind a
// small stable shell until the external CSS is ready, including on cold loads.
export function revealStyledShadow(shadow, signal) {
  const sheet = shadow.querySelector('link[rel="stylesheet"]');
  const main = shadow.querySelector('main');
  if (!sheet || !main) return;
  const cloak = document.createElement('style');
  cloak.textContent = 'main{display:none!important}.ox-style-loading{box-sizing:border-box;min-height:220px;display:grid;place-items:center;padding:24px;border:1px solid #8883;border-radius:12px;color:#969ba3;background:#101216;font:13px/1.6 system-ui}';
  const shell = document.createElement('div');
  shell.className = 'ox-style-loading';shell.setAttribute('role','status');shell.textContent = '介面載入中…';
  shadow.prepend(cloak);shadow.append(shell);
  const reveal = () => {cloak.remove();shell.remove();};
  if (sheet.sheet) {reveal();return;}
  sheet.addEventListener('load',reveal,{once:true,signal});
  sheet.addEventListener('error',()=>{shell.textContent='介面樣式未能載入，請重新整理。';},{once:true,signal});
}
