import { qualifyClassicRow, compareClassic } from '../../core/classic.js?v=20261001-classic1';
export function rankChartRows(rows,{tab='all',tier='all',side='long',watchlist=new Set(),query='',strictTier=false}={}){
 const seen=new Set(),pool=rows.filter(r=>/^\d{4}$/.test(r.symbol)&&Number.isFinite(r.price)&&r.price>0&&!seen.has(r.symbol)&&seen.add(r.symbol));
 const q=query.trim().toLowerCase(),search=r=>!q||`${r.symbol} ${r.name}`.toLowerCase().includes(q);
 if(tab==='watch')return pool.filter(r=>watchlist.has(r.symbol)).filter(search);
 if(tab==='surge')return [...pool].filter(search).sort((a,b)=>(b.turnoverTwd||0)-(a.turnoverTwd||0)).slice(0,50);
 const direction=pool.flatMap(r=>{
  const signal=qualifyClassicRow(r,side);if(!signal)return [];
  return [{...r,classicSignal:signal,tier:signal.tier,setup:'OX 經典 · '+signal.stage,stage:signal.stage,
    oxScore:signal.qualityScore}];
 }),taken=new Set(),limits={T1:10,T2:10,T3:10};
 const groups=['T1','T2','T3'].map(t=>{
  const ranked=direction.filter(r=>r.tier===t&&!taken.has(r.symbol)).sort((a,b)=>compareClassic(a,b)||(b.turnoverTwd||0)-(a.turnoverTwd||0)).slice(0,limits[t])
   .map(r=>({...r,displayTier:t,rankStatus:r.stage}));
  ranked.forEach(r=>taken.add(r.symbol));return ranked;
 });
 return groups.flatMap((rows,i)=>tier!=='all'&&tier.toUpperCase()!==['T1','T2','T3'][i]?[]:rows).filter(search);
}
export function chartUniverse(state,snapshot){
 const facts=new Map((snapshot?.stocks||[]).map(r=>[r.symbol,{...r}]));
 for(const r of state?.data?.radar||[]){const merged={...facts.get(r.symbol),...r};for(const field of ['price','changePct','turnoverTwd'])if(!Number.isFinite(r[field]))merged[field]=facts.get(r.symbol)?.[field]??null;facts.set(r.symbol,merged);}
 return [...facts.values()];
}
