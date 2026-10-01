import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {catalogueMode,cataloguePage,stockName} from '../src/markets/us/directory-view.js';
const directory=JSON.parse(await readFile(new URL('../data/us-directory.json',import.meta.url))).items;
test('stock names include Chinese alias and actual company name without hiding in native EOD mode',()=>{
 assert.equal(stockName(directory.find(item=>item.symbol==='NVDA')),'輝達 · NVIDIA Corporation');
 assert.equal(stockName({alias:'Apple',name:'Apple'}),'Apple');
 assert.equal(stockName({symbol:'NEW'}),'NEW');
});
test('unavailable snapshot shows only metadata; a real empty analysis never becomes a fake catalogue scan',()=>{
 assert.equal(catalogueMode(null),true);
 assert.equal(catalogueMode({quotes:[],analyses:[],error:'LICENSE_NOT_CONFIRMED'}),true);
 assert.equal(catalogueMode({asOf:1,quotes:[],analyses:[]}),false);
 assert.equal(catalogueMode({quotes:[{symbol:'SPY'}],analyses:[]}),false);
 assert.equal(catalogueMode({analyses:[{symbol:'NVDA'}]}),false);
});
test('catalogue preserves all named stocks/ADRs and ETFs with bounded pages, rather than only a 30-symbol search shortlist',()=>{
 const stock=cataloguePage(directory);assert.ok(stock.total>6000);assert.equal(stock.items.length,50);
 assert.equal(stock.items[0].symbol,'NVDA');assert.ok(stock.items.every(item=>['stock','ADR'].includes(item.type)));
 const all=cataloguePage(directory,{type:'all',symbol:'SPY'});assert.equal(all.items[0].symbol,'SPY');
 assert.equal(all.total,directory.filter(item=>item.name).length);
 const seen=new Set();
 for(let offset=0;offset<all.total;offset+=50) {
  const page=cataloguePage(directory,{type:'all',symbol:'SPY',offset});
  assert.ok(page.items.length<=50);page.items.forEach(item=>{assert.equal(seen.has(item.symbol),false);seen.add(item.symbol);});
 }
 assert.equal(seen.size,all.total);
 assert.ok(cataloguePage(directory,{type:'ETF'}).items.every(item=>item.type==='ETF'));
});
test('watchlist metadata requires no quotes and has no fabricated scan tiers or prices',()=>{
 const page=cataloguePage(directory,{watchOnly:true,watch:new Set(['NVDA','AAPL'])});
 assert.deepEqual(page.items.map(item=>item.symbol),['NVDA','AAPL']);
 assert.ok(page.items.every(item=>item.price===undefined && item.tier===undefined));
 assert.equal(cataloguePage(directory,{watchOnly:true}).items.length,0);
});
