/* Existing GitHub Pages entry has no Account/API backend. Navigate, never proxy. */
(() => {
  if(location.hostname!=='a0979989987-coder.github.io')return;
  if(!['/','/index.html','/ox-crypto-screener','/ox-crypto-screener/'].includes(location.pathname)&&!location.pathname.startsWith('/ox-crypto-screener/'))return;
  const source=new URL(location.href),target=new URL('https://ox-crypto-screener.vercel.app/');
  const ids=new Set(['crypto.home','crypto.radar','crypto.patterns','crypto.bubbles','crypto.strength','crypto.heatmap','crypto.rotation','crypto.flow','tw.home','tw.radar','tw.patterns','tw.bubbles','tw.rotation','tw.etf','tw.savings','news.feed','news.calendar','media']);
  const feature=source.searchParams.get('ox_feature');if(ids.has(feature))target.searchParams.set('ox_feature',feature);
  const [route,parameters='']=source.hash.slice(1).split('?');
  const market=['crypto','tw'].includes(route)?route:null;
  const routeFeature=market?market+'.radar':route?.replace('/','.');
  if(ids.has(routeFeature)){target.hash=route;if(!target.searchParams.has('ox_feature'))target.searchParams.set('ox_feature',routeFeature);}
  else if(/^news(?:\/(?:crypto|tw))?$/.test(route||'')){
    const safe=new URLSearchParams(),params=new URLSearchParams(parameters);
    const day=params.get('day'),event=params.get('event');
    if(/^\d{4}-\d{2}-\d{2}$/.test(day||''))safe.set('day',day);
    if(/^[a-zA-Z0-9_-]{1,128}$/.test(event||''))safe.set('event',event);
    target.hash=route+(safe.size?'?'+safe.toString():'');
  }
  window.OXCanonicalRedirecting=true;
  location.replace(target.href);
  document.addEventListener('DOMContentLoaded',()=>{
    const link=document.createElement('a');link.href=target.href;link.textContent='前往 OX 正式入口';
    const message=document.createElement('p');message.textContent='正在前往支援帳號與功能設定的 OX 正式入口。';
    document.body.replaceChildren(message,link);
  },{once:true});
})();
