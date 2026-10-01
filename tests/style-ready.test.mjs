import test from 'node:test';
import assert from 'node:assert/strict';
import {revealStyledShadow} from '../src/components/style-ready.js';
function fixture(loaded=false){
 const sheet=new EventTarget();sheet.sheet=loaded?{}:null;
 const nodes=[];
 const shadow={querySelector:s=>s==='main'?{}:sheet,prepend:n=>nodes.push(n),append:n=>nodes.push(n)};
 return {sheet,nodes,shadow};
}
test('cold shadow CSS shows a stable shell until load; a stylesheet failure never reveals unstyled controls',()=>{
 const original=globalThis.document;globalThis.document={createElement:()=>({setAttribute(){},remove(){this.removed=true;}})};
 try{
  const delayed=fixture();revealStyledShadow(delayed.shadow,new AbortController().signal);
  assert(delayed.nodes[0].textContent.includes('display:none!important'));assert.equal(delayed.nodes[1].textContent,'介面載入中…');
  delayed.sheet.dispatchEvent(new Event('load'));assert(delayed.nodes.every(n=>n.removed));
  const failed=fixture();revealStyledShadow(failed.shadow,new AbortController().signal);failed.sheet.dispatchEvent(new Event('error'));
  assert.equal(failed.nodes[1].textContent,'介面樣式未能載入，請重新整理。');assert(!failed.nodes[0].removed);
  const cached=fixture(true);revealStyledShadow(cached.shadow);assert(cached.nodes.every(n=>n.removed));
  const departed=fixture(),life=new AbortController();revealStyledShadow(departed.shadow,life.signal);life.abort();departed.sheet.dispatchEvent(new Event('load'));assert(!departed.nodes[0].removed);
 }finally{globalThis.document=original;}
});
