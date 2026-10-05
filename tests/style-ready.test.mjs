import test from 'node:test';
import assert from 'node:assert/strict';
import {revealStyledShadow} from '../src/components/style-ready.js';
function element(tag){return Object.assign(new EventTarget(),{tag,sheet:null,children:[],style:{},setAttribute(){},removeAttribute(){},append(...nodes){this.children.push(...nodes);},remove(){this.removed=true;}});}
function fixture(){const sheet=element('link');sheet.href='https://example.test/tool.css?v=old';const nodes=[],main=element('main'),host={dataset:{},style:{}};const shadow={host,querySelector:s=>s==='main'?main:sheet,prepend:n=>nodes.unshift(n),append:n=>nodes.push(n)};return {sheet,nodes,shadow,host,main};}
const load=sheet=>{sheet.sheet={cssRules:[{}]};sheet.dispatchEvent(new Event('load'));};
test('cold tools preserve canvas geometry, wait for all CSS, recover errors and stop stale navigation',()=>{
 const original=globalThis.document,raf=globalThis.requestAnimationFrame,win=globalThis.window;
 let light=true;const doc=new EventTarget();doc.body={classList:{contains:()=>light}};doc.baseURI='https://example.test/';doc.createElement=element;globalThis.document=doc;globalThis.window=new EventTarget();globalThis.requestAnimationFrame=f=>f();
 try{
 const f=fixture(),life=new AbortController();revealStyledShadow(f.shadow,life.signal);
 const cloak=f.nodes.find(n=>n.tag==='style'&&n.textContent.includes('visibility:hidden')),shell=f.nodes.find(n=>n.tag==='div'),links=f.nodes.filter(n=>n.tag==='link');
 assert(cloak.textContent.includes('visibility:hidden!important'));assert(!cloak.textContent.includes('display:none'));assert(f.main.inert);
 load(f.sheet);load(links[0]);assert(!cloak.removed);load(links[1]);assert(cloak.removed&&shell.removed&&!f.main.inert);
 light=false;doc.dispatchEvent(new Event('ox:themechange'));assert.equal(f.host.dataset.oxTheme,'dark');life.abort();
 const failed=fixture(),failedLife=new AbortController();revealStyledShadow(failed.shadow,failedLife.signal);failed.sheet.dispatchEvent(new Event('error'));assert(failed.sheet.href.includes('oxStyleRetry=1-'),'first failure automatically retries');assert(failed.main.inert);load(failed.sheet);for(const link of failed.nodes.filter(n=>n.tag==='link'))load(link);assert(!failed.main.inert);failedLife.abort();
 const stale=fixture(),away=new AbortController();revealStyledShadow(stale.shadow,away.signal);away.abort();load(stale.sheet);for(const link of stale.nodes.filter(n=>n.tag==='link'))load(link);assert(stale.main.inert,'departed tool cannot be revealed by late CSS');
 }finally{globalThis.document=original;globalThis.requestAnimationFrame=raf;globalThis.window=win;}
});
