import { readFile, writeFile } from 'node:fs/promises';
import { getOfficialTWResearch } from '../api/v1/tw/providers/research.js';
import { getOfficialTWMarketPulse } from '../api/v1/tw/providers/official.js';
import { aggregateSectors, enrichResearch } from '../server/markets/tw/research.js';
import { collectHistoryDay } from '../server/markets/tw/research-history.js';
const historyFile = new URL('../data/tw-research-history.json', import.meta.url);
let history = [];
try { history = JSON.parse(await readFile(historyFile,'utf8')); } catch {}
const [result,pulse] = await Promise.allSettled([getOfficialTWResearch(),getOfficialTWMarketPulse()]);
if(result.status !== 'fulfilled') throw result.reason;
const snapshot = result.value;
console.log(JSON.stringify({date:snapshot.date, stocks:snapshot.stocks.length, sourceHealth:snapshot.sourceHealth, covered:snapshot.stocks.filter(s=>s.netTwd!==null).length}));
if (!snapshot.stocks.length || !snapshot.stocks.some(s=>Number.isFinite(s.netTwd))) throw new Error('No verified institutional records; previous snapshot retained');
if(pulse.status==='fulfilled') snapshot.pulse = pulse.value.pulse;
const companies = new Map(snapshot.stocks.map(s=>[`${s.market}:${s.symbol}`,s]));
if (process.argv.includes('--backfill') && history.length < 20) {
  const cursor = new Date(`${snapshot.date}T00:00:00Z`);
  for(let i=0;i<42 && history.length<20;i++) {
    cursor.setUTCDate(cursor.getUTCDate()-1); const date=cursor.toISOString().slice(0,10);
    if([0,6].includes(cursor.getUTCDay()) || history.some(d=>d.date===date)) continue;
    try { const day=await collectHistoryDay(date,companies);history.push(day);console.log(`History ${date}: ${day.sectors.length} sectors`); }
    catch(e){console.log(`History ${date}: unavailable (${e.message})`);}
  }
}
history = [...new Map([...history,{date:snapshot.date,sectors:aggregateSectors(snapshot.stocks)}].map(s=>[s.date,s])).values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-60);
await writeFile(historyFile,JSON.stringify(history));
await writeFile(new URL('../data/tw-research.json',import.meta.url),JSON.stringify(enrichResearch(snapshot,history)));
console.log(`Saved ${snapshot.stocks.length} stocks; ${history.length} trading dates.`);
