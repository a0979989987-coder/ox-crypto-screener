import test from 'node:test';
import assert from 'node:assert/strict';
import {futureValue,lifecycle,compareHoldings,portfolioHistory,matchesCategory,number} from '../src/markets/tw/etf/model.js';
import {normalizeCatalog,normalizeHistory,isoDate} from '../server/markets/tw/etf.js';
import {parseTableHoldings} from '../server/markets/tw/etf-fund-holdings.js';
import {parseOfferings} from '../server/markets/tw/etf-extras.js';
import {parseAnnualFees,applyFees} from '../server/markets/tw/etf-fees.js';
test('zero-rate savings and retirement cash flows conserve capital',()=>{
  assert.equal(futureValue(120000,1000,0,10),240000);
  const r=lifecycle({age:30,retire:40,lifespan:60,initial:120000,monthly:1000,annual:0});
  assert.equal(r.wealth,240000);assert.equal(r.withdrawal,1000);assert.equal(r.points.at(-1).value,0);
});
test('effective annual rate, monthly compounding and negative returns',()=>{
  assert.ok(Math.abs(futureValue(100000,0,12,1)-112000)<1e-6);
  const r=lifecycle({age:59,retire:60,lifespan:90,initial:1000000,monthly:5000,annual:-2,retirementAnnual:-1});
  assert.ok(r.withdrawal>0);assert.ok(r.points.at(-1).value<1e-5);
  assert.throws(()=>futureValue(1,1,-100,1));assert.throws(()=>futureValue(-1,1,2,1));
  assert.throws(()=>lifecycle({age:50,retire:40,lifespan:90,initial:0,monthly:1,annual:3}));
});
test('weighted overlap uses each true NAV weight and distinguishes dates / partial coverage',()=>{
  const a={date:'2026-10-01',complete:true,holdings:[{code:'2330',name:'台積電',weight:60},{code:'2454',weight:20}]};
  const b={date:'2026-10-02',complete:false,holdings:[{code:'2330',weight:40},{code:'0050',weight:20}]};
  const r=compareHoldings(a,b);assert.equal(r.overlap,40);assert.equal(r.weightA,60);assert.equal(r.weightB,40);assert.equal(r.complete,false);assert.equal(r.sameDate,false);
  assert.equal(compareHoldings(a,{holdings:[]}),null);
  assert.equal(compareHoldings(a,{holdings:[{code:'2330',weight:160}]}),null);
});
test('portfolio aligns common completed monthly returns rather than adding standalone CAGR',()=>{
  const months=Array.from({length:14},(_,i)=>({month:new Date(Date.UTC(2025,i,1)).toISOString().slice(0,7),value:100*1.01**i}));
  const r=portfolioHistory([{monthly:months},{monthly:months}], [.6,.4]);
  assert.ok(Math.abs(r.annual-(1.01**12-1)*100)<1e-8);assert.ok(r.volatility<1e-8);
  assert.equal(portfolioHistory([{monthly:months.filter((_,i)=>i!==3)},{monthly:months}], [.5,.5]),null);
});
test('official quote date beats undated catalog price and missing values remain missing',()=>{
  const r=normalizeCatalog([{stockNo:'00679B',stockName:'元大美債20年',totalAv:'1,500',close1:'999',holders:'',listingDate:'2017.01.17',issuer:'元大投信'}],'TPEX',[],[{SecuritiesCompanyCode:'00679B',Close:'25',Change:'-1',Date:'1151001',TradingShares:'1000'}],'now')[0];
  assert.equal(r.price,25);assert.equal(r.date,'2026-10-01');assert.equal(r.holders,null);assert.equal(r.changePct,-1/26*100);assert.equal(r.asset,'bond');assert.ok(r.tags.includes('treasury'));
  assert.equal(number('—'),null);assert.equal(number(''),null);assert.equal(isoDate('1151002'),'2026-10-02');
  const missing=normalizeCatalog([{stockNo:'0050',stockName:'元大台灣50',close1:'112'}],'TWSE',[],[],'now')[0];assert.equal(missing.price,null);
});
test('fund classification keeps speculative and non-investment debt distinctions',()=>{
  const r=normalizeCatalog([{stockNo:'00727B',stockName:'國泰優選非投等債',issuer:'國泰'}],'TPEX',[],[],'now')[0];
  assert.equal(matchesCategory(r,'bond','investment','2026-10-01'),false);assert.equal(matchesCategory(r,'bond','highyield','2026-10-01'),true);
});
test('history excludes the current incomplete session; no false inception return',()=>{
  const raw={chart:{result:[{timestamp:[Date.parse('2026-10-01T05:00Z')/1000,Date.parse('2026-10-02T01:00Z')/1000],indicators:{quote:[{close:[100,200]}],adjclose:[{adjclose:[100,200]}]}}]}};
  assert.throws(()=>normalizeHistory(raw,{symbol:'0050',listingDate:'2003-06-30'},new Date('2026-10-02T02:00Z')));
  const h=normalizeHistory(raw,{symbol:'0050',listingDate:'2003-06-30'},new Date('2026-10-02T08:00Z'));
  assert.equal(h.returnTotal,null);assert.equal(h.yield,null);assert.equal(h.threeYearYield,null);
});
test('issuer HTML parser preserves holdings weights, excludes futures and deduplicates',()=>{
  const html='<table><tr><th>股票代碼</th><th>股票名稱</th><th>股數</th><th>金額</th><th>權重(%)</th></tr><tr><td>2330</td><td>台積電</td><td>100</td><td>200</td><td>56.1234</td></tr></table><table><tr><th>期貨代碼</th><th>期貨名稱</th><th>權重</th></tr><tr><td>TX</td><td>台指</td><td>1</td></tr></table>';
  assert.deepEqual(parseTableHoldings(html),[{code:'2330',name:'台積電',weight:56.1234}]);
});
test('offering announcement date is never substituted for fundraising start date',()=>{
  const html='<tr>'+['1','A0001','投信','00999','ETF','測試基金','11','首次募集申報生效','2026年09月01日','1k','下載'].map(x=>`<td>${x}</td>`).join('')+'</tr>';
  const [r]=parseOfferings(html,'https://www.sitca.org.tw/');assert.equal(r.status,'申報生效');assert.equal(r.startDate,null);assert.equal(r.date,'2026-09-01');
});
test('fees reject a monthly response and ambiguous fund-name matches',()=>{
  assert.throws(()=>parseAnnualFees('<select name="ctl00$ContentPlaceHolder1$ddlQ_M"><option selected="selected" value="12">12 月</option></select>',2025));
  const rows=[{taxId:'12345678',fullName:'甲基金'},{fullName:'乙基金'},{fullName:'債券20年期(以上)基金'}];
  applyFees(rows,{year:2025,url:'https://www.sitca.org.tw/',rows:[{taxId:'12345678',name:'甲基金',expense:0.3},{name:'乙基金',expense:0.4},{name:'乙基金',expense:0.6},{name:'債券20年期(以上)基金(本基金之配息來源可能為收益平準金)',expense:0.21}]});
  assert.equal(rows[0].expense,.3);assert.equal(rows[0].expenseYear,2025);assert.equal(rows[1].expense,undefined);assert.equal(rows[2].expense,.21);
});
