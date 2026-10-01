export function rankChartRows(rows,{tab='all',tier='all',side='long',watchlist=new Set(),query='',strictTier=false}={}){
 const seen=new Set(),pool=rows.filter(r=>/^\d{4}$/.test(r.symbol)&&Number.isFinite(r.price)&&r.price>0&&!seen.has(r.symbol)&&seen.add(r.symbol));
 const q=query.trim().toLowerCase(),search=r=>!q||`${r.symbol} ${r.name}`.toLowerCase().includes(q);
 if(tab==='watch')return pool.filter(r=>watchlist.has(r.symbol)).filter(search);
 if(tab==='surge')return [...pool].filter(search).sort((a,b)=>(b.turnoverTwd||0)-(a.turnoverTwd||0)).slice(0,50);
 const direction=pool.filter(r=>Number.isFinite(r.changePct)&&(side==='long'?r.changePct>=0:r.changePct<0)),taken=new Set(),limits={T1:10,T2:15,T3:15};
 // Same ranked-group rule as Crypto: real T1 only; T2/T3 may include WATCH
 // candidates. Original provider membership is retained and never overwritten.
 const groups=['T1','T2','T3'].map(t=>{
  const fit=t.toLowerCase()+'Fit',order=(a,b)=>(b[fit]||0)-(a[fit]||0)||(b.oxScore??-1)-(a.oxScore??-1)||(b.turnoverTwd||0)-(a.turnoverTwd||0);
  const ranked=direction.filter(r=>r.tier===t&&!taken.has(r.symbol)).sort(order).slice(0,limits[t]).map(r=>({...r,displayTier:t,rankStatus:t==='T1'?'CONFIRMED':t==='T2'?'READY':'EARLY'}));
  ranked.forEach(r=>taken.add(r.symbol));
  if(t!=='T1'&&!strictTier)for(const r of direction.filter(r=>!taken.has(r.symbol)).sort(order)){if(ranked.length>=limits[t])break;ranked.push({...r,displayTier:t,rankStatus:'WATCH'});taken.add(r.symbol);}
  return ranked;
 });
 return groups.flatMap((rows,i)=>tier!=='all'&&tier.toUpperCase()!==['T1','T2','T3'][i]?[]:rows).filter(search);
}
export function chartUniverse(state,snapshot){
 const facts=new Map((snapshot?.stocks||[]).map(r=>[r.symbol,{...r}]));
 for(const r of state?.data?.radar||[]){const merged={...facts.get(r.symbol),...r};for(const field of ['price','changePct','turnoverTwd'])if(!Number.isFinite(r[field]))merged[field]=facts.get(r.symbol)?.[field]??null;facts.set(r.symbol,merged);}
 return [...facts.values()];
}
