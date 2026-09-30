export function rankChartRows(rows,{tab='all',tier='all',side='long',watchlist=new Set(),query=''}={}){
 const seen=new Set(),pool=rows.filter(r=>/^\d{4}$/.test(r.symbol)&&Number.isFinite(r.price)&&!seen.has(r.symbol)&&seen.add(r.symbol));
 const q=query.trim().toLowerCase(),search=r=>!q||`${r.symbol} ${r.name}`.toLowerCase().includes(q);
 if(tab==='watch')return pool.filter(r=>watchlist.has(r.symbol)).filter(search);
 if(tab==='surge')return [...pool].filter(search).sort((a,b)=>(b.turnoverTwd||0)-(a.turnoverTwd||0)).slice(0,50);
 const direction=pool.filter(r=>Number.isFinite(r.changePct)&&(side==='long'?r.changePct>=0:r.changePct<0));
 const limits={T1:10,T2:15,T3:15};
 return ['T1','T2','T3'].flatMap(t=>tier!=='all'&&tier.toUpperCase()!==t?[]:direction.filter(r=>r.tier===t).sort((a,b)=>(b.oxScore??-1)-(a.oxScore??-1)||(b.turnoverTwd||0)-(a.turnoverTwd||0)).slice(0,limits[t]).map(r=>({...r,displayTier:t}))).filter(search);
}
export function chartUniverse(state,snapshot){
 const facts=new Map((snapshot?.stocks||[]).map(r=>[r.symbol,{...r}]));
 for(const r of state?.data?.radar||[])facts.set(r.symbol,{...facts.get(r.symbol),...r});
 return [...facts.values()];
}
