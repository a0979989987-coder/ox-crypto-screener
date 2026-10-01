import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/components/loading-state.js',import.meta.url),'utf8');
function fixture(){
  const events=new Map(),timers=new Map(),nodes=[];
  const document={head:{append(){}},body:{dataset:{market:'crypto',view:'radar'},append:n=>nodes.push(n)},createElement:()=>({hidden:false}),addEventListener:(type,fn)=>events.set(type,fn)};
  const window={};let id=0;
  vm.runInNewContext(source,{window,document,Symbol,Date,setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:key=>timers.delete(key)});
  const flush=()=>{const work=[...timers.values()];timers.clear();work.forEach(f=>f());};
  return {api:window.OXLoading,document,events,flush,nodes};
}
test('loading uses actual item counts, survives overlapping completion and hides another market',()=>{
  const f=fixture(),first=f.api.begin('crypto','行情'),second=f.api.begin('crypto','標的',{done:0,total:12});f.flush();
  assert.match(f.nodes[0].innerHTML,/0\/12/);
  second.update(4,12);first.finish();f.flush();assert.match(f.nodes[0].innerHTML,/4\/12/);assert.equal(f.nodes[0].hidden,false);
  f.document.body.dataset.market='tw';f.events.get('ox:marketchange')();assert.equal(f.nodes[0].hidden,true);
  f.document.body.dataset.market='crypto';f.events.get('ox:marketchange')();assert.equal(f.nodes[0].hidden,false);
  second.finish();f.flush();assert.equal(f.nodes[0].hidden,true);
});
test('aborted or departed views cannot leave a stale loading indicator',()=>{
  const f=fixture(),life=new AbortController();
  f.api.begin('crypto','掃描',{signal:life.signal,views:['strength']});f.flush();assert.equal(f.nodes[0].hidden,true);
  f.document.body.dataset.view='strength';f.events.get('ox:viewchange')();assert.equal(f.nodes[0].hidden,false);
  life.abort();f.flush();assert.equal(f.nodes[0].hidden,true);
  f.api.begin('crypto','已取消',{signal:life.signal});f.flush();assert.equal(f.nodes[0].hidden,true);
  assert(!f.api.markup('行情').includes('ox-loading-count'));
});
test('OX LIVE starts off, restores an explicit preference and stays off when storage is unavailable',()=>{
  const code=readFileSync(new URL('../src/app/live-visibility.js',import.meta.url),'utf8');
  for(const [value,expected] of [[null,true],['0',true],['1',false],['unrecognized',true]]){
    let disabled;vm.runInNewContext(code,{localStorage:{getItem:()=>value},document:{documentElement:{classList:{toggle:(_,v)=>disabled=v}}}});assert.equal(disabled,expected);
  }
  let hidden=false;vm.runInNewContext(code,{localStorage:{getItem(){throw Error('blocked');}},document:{documentElement:{classList:{add:()=>hidden=true}}}});assert(hidden);
});
