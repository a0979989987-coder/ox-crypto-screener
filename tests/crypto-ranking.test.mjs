import { rankingSignal } from './classic-fixtures.mjs';
import { OXClassicForTests } from './classic-test-runtime.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const scanner = readFileSync(new URL("../src/markets/crypto/scanner.js", import.meta.url), "utf8");

function rank(rows) {
  const state = {
    analyzedCache: new Map(rows.map(row => [row.symbol, {...row,classic:{long:rankingSignal(row.tier.toUpperCase())},classicSignal:rankingSignal(row.tier.toUpperCase())}])),
    tickers: [], directionFilter: "long"
  };
  const context = {
    OXClassic:OXClassicForTests, state, benchmarkSymbols: new Set(["BTCUSDT", "ETHUSDT"]), num: Number,
    syncDirectionalBadges() {}, syncWatchBadge() {}, renderMarketStrength() {},
    renderHomeOverview() {}, renderOxLive() {}
  };
  runInNewContext(`${scanner}\nrebuildTierLists();`, context);
  return state.tierMapBySide.long;
}

test("Crypto radar keeps up to 10 qualified symbols per tier, 30 total, without repeats", () => {
  const rows = ["t1", "t2", "t3"].flatMap((tier, tierIndex) =>
    Array.from({ length: 35 }, (_, index) => ({
      symbol: `COIN${tierIndex}${String(index).padStart(2, "0")}USDT`,
      side: "LONG", tier, oxScore: 100 - index,
      t1Fit: tier === "t1" ? 100 - index : 0,
      t2Fit: tier === "t2" ? 100 - index : 0,
      t3Fit: tier === "t3" ? 100 - index : 0
    }))
  );
  const result = rank(rows);
  for (const tier of ["t1", "t2", "t3"]) {
    assert.equal(result[tier].length, 10);
    assert.ok(result[tier].every(row => row.tier === tier));
  }
  const symbols = ["t1", "t2", "t3"].flatMap(tier => result[tier].map(row => row.symbol));
  assert.equal(new Set(symbols).size, 30);
  assert.ok(result.t1[0].t1Fit > result.t1.at(-1).t1Fit);
});

test("Crypto radar shows only available symbols when fewer than 10 exist", () => {
  const result = rank([{ symbol: "SOLUSDT", side: "LONG", tier: "t1", oxScore: 80, t1Fit: 80 }]);
  assert.equal(result.t1.length, 1);
  assert.equal(result.t2.length, 0);
  assert.equal(result.t3.length, 0);
});

 test("unqualified candidates never fill T1 even with a high T1 fit",()=>{
 const result=rank([{symbol:"EARLYUSDT",side:"LONG",tier:"t3",oxScore:95,t1Fit:100,t2Fit:80,t3Fit:80}]);
 assert.equal(result.t1.length,0);
 assert.equal(result.t2.length+result.t3.length,1);
 });

test('radar does not publish a partial first scan', () => {
  const state = {isQueueRunning:true,radarSnapshotReady:false,analyzedCache:new Map(),tierMap:{t1:['existing']}};
  runInNewContext(`${scanner}\nrebuildTierLists();`,{state});
  assert.equal(state.tierMap.t1[0],'existing');
});

test('radar snapshot uses current tickers and excludes expired or unavailable coins', () => {
  function restore(savedAt){
    const state={tickers:[{symbol:'SOLUSDT',change24h:.02}]};
    runInNewContext(`${scanner}\nrestoreRadarSnapshot();`,{
      state:Object.assign(state,{analyzedCache:new Map()}),OXClassic:OXClassicForTests,num:Number,Date,
      isCryptoSymbolAllowed:()=>true,
      localStorage:{getItem:()=>JSON.stringify({savedAt,rows:[{symbol:'SOLUSDT',side:'LONG',tier:'t1',classic:{long:rankingSignal()},change24h:.5},{symbol:'REMOVEDUSDT'}]})}
    });
    return state;
  }
  const current=restore(Date.now());
  assert.equal(current.analyzedCache.size,1);
  assert.equal(current.analyzedCache.get('SOLUSDT').change24h,.02);
  assert.equal(current.radarSnapshotReady,true);
  assert.equal(restore(Date.now()-360000).analyzedCache.size,0);
});
