// Verify the approved palette on actual mobile controls, not just CSS tokens.
process.env.OX_E2E_PORT ||= '4186';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {server,preparePage,testBase}=require('./e2e-check.cjs');
const {mkdirSync}=require('node:fs');
(async()=>{
 await new Promise(r=>server.listen(new URL(testBase).port,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.OX_BROWSER_PATH});
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',isMobile:true,hasTouch:true});
 const {page}=await preparePage(context,{width:390,height:844});
 const out=process.env.OX_LIGHT_QA_OUT||'/tmp/ox-champagne-palette';mkdirSync(out,{recursive:true});
 try{
  await page.goto(testBase,{waitUntil:'domcontentloaded'});await page.locator('.coin-card').first().waitFor();
  const dock=()=>page.locator('.ox-dock-indicator').evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {image:s.backgroundImage,border:s.borderColor,opacity:s.opacity,width:r.width,x:r.x};});
  await page.evaluate(()=>{applyTheme('dark');switchAppView('radar');});await page.waitForTimeout(100);
  const originalDark=await dock();
  await page.evaluate(()=>applyTheme('light'));
  const positions=[];
  for(const view of ['home','strength','radar','data','media']){
   await page.evaluate(v=>switchAppView(v),view);await page.waitForTimeout(180);
   const color=await dock();positions.push(color.x);
   assert(color.image.includes('230, 232, 235'),view+': neutral selection');assert.equal(color.border,'rgb(212, 217, 224)');assert.equal(color.opacity,'1');assert(color.width>30);
   const text=await page.locator('.dock-btn.active').evaluate(e=>getComputedStyle(e).color);assert.equal(text,'rgb(48, 52, 59)');
  }
  assert(new Set(positions).size===5,'gray selection moves to all five tabs');
  await page.evaluate(()=>switchAppView('home'));await page.waitForTimeout(100);
  const home=await page.locator('.ox-home-chart').evaluate(e=>({bg:getComputedStyle(e).backgroundColor,border:getComputedStyle(e).borderColor}));assert.equal(home.bg,'rgb(255, 255, 255)');assert.equal(home.border,'rgb(216, 188, 131)');await page.screenshot({path:out+'/approved-home.png'});
  await page.evaluate(()=>switchAppView('radar'));await page.waitForTimeout(100);
  const frame=await page.locator('#chart-timeframe-strip .btn-tf.active').evaluate(e=>({bg:getComputedStyle(e).backgroundImage,text:getComputedStyle(e).color}));assert(frame.bg.includes('233, 214, 171'));assert.equal(frame.text,'rgb(48, 52, 59)');await page.screenshot({path:out+'/approved-radar.png'});
  await page.evaluate(()=>switchAppView('strength'));await page.locator('button[data-crypto-tool="patterns"]').waitFor();await page.waitForTimeout(150);
  const rail=await page.locator('button[data-crypto-tool="patterns"]').evaluate(e=>{const s=getComputedStyle(e.getRootNode().querySelector('.twr-mode-indicator'));return s.backgroundImage;});assert(rail.includes('233, 214, 171'),'lazy shadow tool uses champagne');await page.screenshot({path:out+'/approved-indicators.png'});
  await page.evaluate(()=>{applyTheme('dark');switchAppView('radar');});await page.waitForTimeout(100);assert.deepEqual(await dock(),originalDark,'dark navigation unchanged after round trip');
  console.log('Approved palette passed: five moving gray dock states, charcoal text, white/gold home, champagne timeframe and shadow rail, dark round trip.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
