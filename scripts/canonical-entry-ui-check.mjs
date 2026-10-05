import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {resolve,extname} from 'node:path';import {chromium} from 'playwright';
const root=resolve(import.meta.dirname,'..'),legacy='https://a0979989987-coder.github.io',canonical='https://ox-crypto-screener.vercel.app';
const browser=await chromium.launch({headless:true,executablePath:process.env.OX_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage(),apiRequests=[];
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.pathname.includes('/api/'))apiRequests.push(u.origin+u.pathname);
   if(u.origin===canonical)return route.fulfill({contentType:'text/html',body:'<!doctype html><body>Canonical destination fixture</body>'});
   if(u.origin!==legacy)return route.fulfill({contentType:'text/javascript',body:''});
   const rel=u.pathname.replace(/^\/ox-crypto-screener\//,'');const file=resolve(root,rel||'index.html');
   assert.ok(file.startsWith(root));return route.fulfill({contentType:extname(file)==='.html'?'text/html':extname(file)==='.js'?'text/javascript':'text/css',body:readFileSync(file)});
  });
  try{await page.goto(legacy+'/ox-crypto-screener/?ox_feature=news.calendar&code=synthetic-private&state=synthetic-state#news/tw');}catch(e){if(!/ERR_ABORTED/.test(e.message))throw e;}
  await page.waitForURL(canonical+'/#news/tw');assert.equal(apiRequests.length,0,'Legacy Pages must navigate before requesting backend APIs');
  assert.equal(new URL(page.url()).search,'');assert.equal(new URL(page.url()).searchParams.has('code'),false);assert.equal(new URL(page.url()).searchParams.has('state'),false);await context.close();
 }
 console.log('GitHub Pages actual-index mobile/desktop redirect passed: canonical market hash retained, callback query discarded, zero backend requests. Isolated navigation destinations only.');
}finally{await browser.close();}
