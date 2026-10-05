const {createServer}=require('node:http');
const {readFileSync,existsSync,mkdirSync,writeFileSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const root=resolve(__dirname,'..'),port=Number(process.env.OX_TW_QA_PORT||4197),base=`http://127.0.0.1:${port}`;
const out=resolve(process.env.OX_TW_QA_OUT||'/tmp/ox-tw-third-qa');mkdirSync(out,{recursive:true});
const home=JSON.parse(readFileSync(resolve(root,'data/tw-home.json'),'utf8'));
const research=JSON.parse(readFileSync(resolve(root,'data/tw-research.json'),'utf8'));
const news=JSON.parse(readFileSync(resolve(root,'data/news.json'),'utf8'));
const chartStub=readFileSync(resolve(root,'scripts/e2e-check.cjs'),'utf8').match(/const chartStub = `([\s\S]*?)`;\n/)[1];
const server=createServer((req,res)=>{
 const file=resolve(root,'.'+(new URL(req.url,base).pathname==='/'?'/index.html':new URL(req.url,base).pathname));
 if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end('Not found');return;}
 try{res.setHeader('Content-Type',({'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json;charset=utf-8','.svg':'image/svg+xml','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404);res.end('Not found');}
});
const report={engine:process.env.OX_TW_QA_ENGINE||'chromium',viewports:[],interactions:[],screenshots:[],errors:[],passed:false};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function setup(browser,size,options={}){
 const context=await browser.newContext({viewport:size,isMobile:size.width<600,hasTouch:size.width<600,...options});
 await context.addInitScript(()=>{window.OX_TW_DATA_API_BASE=location.origin+'/api';class WS extends EventTarget{constructor(){super();this.readyState=1;}send(){}close(){this.readyState=3;}}window.WebSocket=WS;});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('https://unpkg.com/**',r=>r.fulfill({contentType:'text/javascript',body:chartStub}));
 await page.route('**/api/v1/account/config',r=>r.fulfill({json:{configured:false,providerConnectionVerified:false,databaseConnected:false}}));
 await page.route('**/api/v1/tw/**',r=>{const url=new URL(r.request().url()),section=url.searchParams.get('section');let data={};if(url.pathname.endsWith('/home'))data={section,data:home[section],checkedAt:new Date().toISOString(),status:'ok',refreshed:url.searchParams.has('refresh')};else if(url.pathname.endsWith('/research'))data=research;else if(url.pathname.endsWith('/quotes'))data={quotes:[]};r.fulfill({json:{ok:true,data}});});
 await page.route('**/api.bitget.com/**',r=>r.fulfill({json:{code:'00000',data:[]}}));
 await page.route('**/api.coingecko.com/**',r=>r.fulfill({json:[]}));
 await page.route('**/bubbles/field.js*',r=>r.fulfill({contentType:'text/javascript',body:readFileSync(resolve(root,'src/markets/crypto/bubbles/field.js'),'utf8').replace('this.canvas=canvas;','(window.__fields??=[]).push(this);this.canvas=canvas;')}));
 return {context,page};
}
async function shot(page,name){await pause(180);await page.screenshot({path:resolve(out,name)});report.screenshots.push(name);}
async function noOverflow(page,label){assert(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1,label+' horizontal overflow');}
async function phase(page,session){
 const button=page.locator('button[data-home-highlights]');await button.waitFor();
 if(await button.innerText()!==session+'重點')await page.locator('[data-home-session]').click();
 assert.equal(await button.innerText(),session+'重點');await button.click();
 const dialog=page.getByRole('dialog',{name:session+'重點'});await dialog.waitFor();
 const summary=dialog.locator('.twx-highlight-summary');await summary.waitFor();
 assert.equal(await summary.locator('h3').innerText(),session==='盤前'?'【08:30 盤前快訊】':'【AI 盤後總結】');
 if(session==='盤前'){const length=[...await summary.locator('p').innerText()].length;assert(length>=50&&length<=100,'morning briefing must stay within 50–100 characters');}
 assert.match(await dialog.innerText(),session==='盤前'?/台指期夜盤[\s\S]*美股收盤/:/台股收盤[\s\S]*權值股貢獻/);
 assert((await dialog.innerText()).includes(session==='盤前'?home.night.close.toLocaleString('zh-TW'):home.core.index.close.toLocaleString('zh-TW')));
 return dialog;
}
async function dragPressure(page,market){
 await page.evaluate(()=>{window.field=__fields.at(-1);field.paused=true;field.nodes=field.nodes.slice(0,2);field.nodes.forEach((n,i)=>Object.assign(n,{x:field.width*.35+i*(n.r*2+30),y:field.height*.4,vx:0,vy:0,strainX:0,strainY:0,strainVX:0,strainVY:0}));field.paint();field.run();});
 const canvas=page.locator('canvas').first(),box=await canvas.boundingBox();
 const scene=await page.evaluate(()=>field.nodes.map(n=>({x:n.x,y:n.y,r:n.r})));
 await page.mouse.move(box.x+scene[0].x,box.y+scene[0].y);await page.mouse.down();
 await page.mouse.move(box.x+scene[1].x-scene[0].r*.5,box.y+scene[1].y,{steps:5});
 await pause(120); // Smooth pressure follows contact over frames, not a snap.
 const strain=await page.evaluate(()=>field.nodes.map(n=>Math.hypot(n.strainX||0,n.strainY||0)));
 assert(strain.every(v=>v>.01),market+' bubble contact must deform both bubbles');
 await shot(page,market+'-contact.png');await page.mouse.up();await pause(900);
 assert(await page.evaluate(()=>field.nodes.every(n=>Math.hypot(n.strainX||0,n.strainY||0)<.01)),market+' release recovery');
 const first=await page.evaluate(()=>({x:field.nodes[0].x,y:field.nodes[0].y}));
 await page.mouse.move(box.x+first.x,box.y+first.y);await page.mouse.down();await page.mouse.move(box.x+2,box.y+first.y,{steps:6});await pause(180);
 assert(await page.evaluate(()=>field.nodes[0].strainX<-.035),market+' wall squeezes normal axis');
 await shot(page,market+'-wall.png');await page.mouse.up();await pause(900);
 assert(await page.evaluate(()=>field.nodes.every(n=>Math.hypot(n.strainX||0,n.strainY||0)<.01)),market+' wall release recovery');
 // Synthetic pointer cancellation exercises teardown without opening a stock dialog.
 await page.evaluate(()=>{const c=field.canvas,r=c.getBoundingClientRect(),n=field.nodes[0];const emit=(type,id,x,y)=>c.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',clientX:r.x+x,clientY:r.y+y,bubbles:true}));const capture=c.setPointerCapture;c.setPointerCapture=()=>{};emit('pointerdown',21,n.x,n.y);emit('pointerdown',22,n.x+80,n.y);emit('pointermove',22,n.x+160,n.y);emit('pointercancel',21,n.x,n.y);emit('pointercancel',22,n.x+160,n.y);c.setPointerCapture=capture;});
 assert(await page.evaluate(()=>field.zoom>1),market+' pinch zoom');assert.equal(await page.locator('dialog[open]').count(),0,market+' pinch does not select');
 report.interactions.push(market+' contact, wall pressure, spring recovery, pinch/cancel');
}
(async()=>{
 await new Promise(r=>server.listen(port,'127.0.0.1',r));const engine=report.engine==='webkit'?webkit:chromium;
 const browser=await engine.launch({headless:true,...(process.env.OX_BROWSER_PATH?{executablePath:process.env.OX_BROWSER_PATH}:{})});
 try{
  for(const width of (process.env.OX_TW_ONLY_BUBBLES?[]:process.env.OX_TW_QA_WIDTHS?process.env.OX_TW_QA_WIDTHS.split(',').map(Number):[375,390,430,1440])){
   console.log('Checking viewport',width);
   const {context,page}=await setup(browser,{width,height:width>600?900:844});
   await page.goto(base+'/#news/tw',{waitUntil:'domcontentloaded'});await page.locator('.oxn-calendar-grid').waitFor();
   await page.evaluate(()=>window.switchAppView('home'));await page.locator('button[data-home-highlights]').waitFor();
   const after=await phase(page,'盤後');await noOverflow(page,width+' after');if(width===390)await shot(page,'home-after-highlights.png');await after.getByRole('button',{name:'關閉',exact:true}).click();await after.waitFor({state:'hidden'});
   const before=await phase(page,'盤前');await noOverflow(page,width+' before');if(width===390)await shot(page,'home-before-highlights.png');await before.getByRole('button',{name:'關閉',exact:true}).click();await before.waitFor({state:'hidden'});
   let acquisitions=[];page.on('request',r=>{if(r.url().includes('/v1/tw/home?')&&r.url().includes('refresh=1'))acquisitions.push(new URL(r.url()).searchParams.get('section'));});
   await page.getByRole('button',{name:'更新資料',exact:true}).click();await page.getByRole('button',{name:'更新資料',exact:true}).waitFor();assert.deepEqual(acquisitions.sort(),['briefing','core','night']);
   assert.equal((await page.locator('.app-dock [data-view-target="data"]').innerText()).trim(),'資訊');
   if(width<600)await page.locator('.app-dock [data-view-target="data"]').tap();else await page.locator('.ox-desktop-nav [data-view-target="data"]').click();
   assert.equal(await page.locator('#ox-news-entry-menu').count(),0,'Information goes directly to this market without a menu');
   await page.locator('.oxn-calendar-grid').waitFor();
   const toggle=page.getByRole('button',{name:'切換為行程列表',exact:true});assert.equal(await toggle.innerText(),'切換');await toggle.click();await page.locator('.oxn-agenda').waitFor();await noOverflow(page,width+' agenda');
   const rendered=await page.locator('.oxn-agenda-day').evaluateAll(es=>es.map(e=>e.dataset.date));assert.deepEqual(rendered,[...rendered].sort());
   const from=await page.evaluate(()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).slice(0,7)+'-01');
   const expected=new Set(news.events.filter(e=>e.markets?.includes('tw')&&(e.date||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(e.occursAt)))>=from).map(e=>e.id));
   assert.equal(await page.locator('.oxn-agenda-event').count(),expected.size,'all recorded upcoming Taiwan events');
   if(width===390||width===1440)await shot(page,`agenda-${width}.png`);
   const firstEvent=page.locator('.oxn-agenda-event').first();if(await firstEvent.count()){await firstEvent.click();await page.locator('.oxn-modal').waitFor();await page.getByRole('button',{name:'返回上一層',exact:true}).click();await page.locator('.oxn-modal').waitFor({state:'hidden'});await page.locator('.oxn-agenda').waitFor();}
   await page.getByRole('button',{name:'切換為月份格',exact:true}).click();await page.locator('.oxn-calendar-grid').waitFor();
   for(const market of ['crypto','tw']){await page.evaluate(m=>window.OXMarketController.setMarket(m),market);await pause(200);assert.equal((await page.locator('.app-dock [data-view-target="data"]').innerText()).trim(),'資訊');}
   report.viewports.push(width);await context.close();
  }
  for(const market of ['crypto','tw']){
   console.log('Checking bubbles',market);
   const {context,page}=await setup(browser,{width:390,height:844});
   await page.route(base+'/__bubble-fixture',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:12px;background:#101216;color:#eee;font-family:system-ui}canvas{width:100%;height:500px;display:block}</style><body data-market="${market}" data-view="strength"><div id="bubble"></div></body>`}));
   await page.goto(base+'/__bubble-fixture');
   await page.evaluate(async market=>{
    const host=document.getElementById('bubble');
    if(market==='tw'){const {mountTWBubbles}=await import('/src/markets/tw/bubbles/view.js');window.mounted=mountTWBubbles(host);const {preloadBundle}=await import('/src/markets/tw/patterns/bundle.js?v=20261002-rank8');await preloadBundle();}
    else{const {mountCryptoBubbles}=await import('/src/markets/crypto/bubbles/view.js');window.mounted=mountCryptoBubbles(host,{quotes:['BTC','ETH','SOL','XRP','ADA','LINK'].map((s,i)=>({symbol:s+'USDT',baseCoin:s,lastPr:100+i,change24h:i%2?.06:-.04,usdtVolume:1e8-i*1e6,ts:Date.now()})),caps:[]});}
   },market);
   await page.waitForFunction(()=>window.__fields?.at(-1)?.nodes.length>=2);await page.locator('canvas').first().waitFor({state:'visible'});await pause(180);
   await dragPressure(page,market);await page.evaluate(()=>mounted.destroy());assert(await page.evaluate(()=>field.life.signal.aborted&&field.frame===0));await context.close();
  }
  assert.deepEqual(report.errors,[],'runtime errors');report.passed=true;console.log(JSON.stringify(report,null,2));
 }finally{writeFileSync(resolve(out,'qa.json'),JSON.stringify(report,null,2)+'\n');await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
