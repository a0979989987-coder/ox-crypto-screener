import test from 'node:test';
import assert from 'node:assert/strict';
import { attachCryptoRadarStyles, radarId } from '../src/components/radar/market-workspace.js';
test('market presentation is namespaced, read-only and cannot style unrelated views',()=>{
 const original=globalThis.document;
 const rule={selectorText:'body[data-market="crypto"] #view-radar .workspace, #view-home .workspace',style:{cssText:'gap: 7px;'}};
 const summary={selectorText:'#view-radar .market-line-card',style:{cssText:'grid-template-columns: minmax(0, 1.28fr) minmax(0, .76fr) minmax(0, .82fr) 1fr 1fr !important;'}};
 const media={conditionText:'(max-width:720px)',cssText:'@media(max-width:720px){x}',cssRules:[{selectorText:'body.ox-terminal #view-radar #chart',style:{cssText:'height: 524px;'}}]};
 let style;
 globalThis.document={querySelectorAll:()=>[{id:'chart'}],createElement:()=>({dataset:{},remove(){this.removed=true;}}),styleSheets:[{ownerNode:{dataset:{}},cssRules:[rule,summary,media,{selectorText:'body .app-dock',style:{cssText:'display: none;'}}]}]};
 try {
  const release=attachCryptoRadarStyles({prepend(node){style=node;}},{summaryColumns:3});
  assert(style.textContent.includes('body[data-market="tw"] #market-unavailable-card.tw-radar-root .tw-chart-radar .workspace'));
  assert(style.textContent.includes('@media(max-width:720px)'));
  assert(style.textContent.includes('#tw-radar-chart'));
  assert(!style.textContent.includes('#view-home'));
  assert(!style.textContent.includes('.app-dock'));
  assert(style.textContent.includes('minmax(0, 1.28fr) minmax(0, .76fr) minmax(0, .82fr) !important'));
  assert(summary.style.cssText.includes('1fr 1fr !important'),'source tracks remain untouched');
  assert.equal(rule.selectorText,'body[data-market="crypto"] #view-radar .workspace, #view-home .workspace');
  assert.equal(radarId('chart'),'tw-radar-chart');
  release();assert(style.removed);
 } finally {globalThis.document=original;}
});
