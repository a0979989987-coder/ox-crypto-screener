import test from 'node:test';
import assert from 'node:assert/strict';
import {revealStyledShadow} from '../src/components/style-ready.js';
function fixture(loaded=false){
 const sheet=new EventTarget();sheet.sheet=loaded?{}:null;sheet.href='https://example.test/tool.css?v=old';
 const nodes=[];const host={dataset:{}};
 const shadow={host,querySelector:s=>s==='main'?{}:sheet,prepend:n=>nodes.unshift(n),append:n=>nodes.push(n)};
 return {sheet,nodes,shadow,host};
}
test('cold shadow waits for palettes and shared roles; errors and aborted navigation never reveal unstyled controls',()=>{
 const original=globalThis.document;let light=true;
 const doc=new EventTarget();doc.body={classList:{contains:()=>light}};
 doc.createElement=tag=>Object.assign(new EventTarget(),{tag,sheet:null,setAttribute(){},remove(){this.removed=true;}});globalThis.document=doc;
 try{
  const delayed=fixture(),life=new AbortController();revealStyledShadow(delayed.shadow,life.signal);
  const cloak=delayed.nodes.find(n=>n.tag==='style'),loading=delayed.nodes.find(n=>n.tag==='div'),palette=delayed.nodes.find(n=>n.tag==='link');
  assert(cloak.textContent.includes('display:none!important'));assert.equal(loading.textContent,'介面載入中…');assert.equal(delayed.host.dataset.oxTheme,'light');
  delayed.sheet.dispatchEvent(new Event('load'));assert(!cloak.removed,'base CSS alone must not reveal the dark surface');
  palette.dispatchEvent(new Event('load'));assert(!cloak.removed,'palette alone must not reveal before the approved role sheet');
  const roles=delayed.nodes.filter(n=>n.tag==='link')[1];assert(roles.href.endsWith('light-tool-roles.css?v=20261005-champagne2'));
  roles.dispatchEvent(new Event('load'));assert(cloak.removed&&loading.removed);
  light=false;doc.dispatchEvent(new Event('ox:themechange'));assert.equal(delayed.host.dataset.oxTheme,'dark');
  life.abort();light=true;doc.dispatchEvent(new Event('ox:themechange'));assert.equal(delayed.host.dataset.oxTheme,'dark','unmounted host stops receiving theme events');
  const failed=fixture();revealStyledShadow(failed.shadow,new AbortController().signal);failed.sheet.dispatchEvent(new Event('error'));
  assert.equal(failed.nodes.find(n=>n.tag==='div').textContent,'介面樣式未能載入，請重新整理。');assert(!failed.nodes.find(n=>n.tag==='style').removed);
  const departed=fixture(),away=new AbortController();revealStyledShadow(departed.shadow,away.signal);away.abort();departed.sheet.dispatchEvent(new Event('load'));departed.nodes.find(n=>n.tag==='link').dispatchEvent(new Event('load'));assert(!departed.nodes.find(n=>n.tag==='style').removed);
 }finally{globalThis.document=original;}
});
