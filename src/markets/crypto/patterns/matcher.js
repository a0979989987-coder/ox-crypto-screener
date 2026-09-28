import { PATTERNS, patternById } from './catalog.js?v=patterns4-20260929';
const clamp = (x, a=0, b=1) => Math.max(a, Math.min(b, x));
const mean = a => a.reduce((s,x)=>s+x,0)/a.length;
export function normalize(points) {
  if(points.length<2)return [];
  const lo=Math.min(...points.map(p=>p.y)),hi=Math.max(...points.map(p=>p.y));
  const left=points[0].x,span=points.at(-1).x-left;
  if(hi-lo<1e-12||span<=0)return [];
  return points.map(p=>({x:(p.x-left)/span,y:(p.y-lo)/(hi-lo)}));
}
export function resample(points,n=40) {
  const p=normalize(points);if(!p.length)return [];
  let j=1;return Array.from({length:n},(_,i)=>{
    const x=i/(n-1);while(j<p.length-1&&p[j].x<x)j++;
    const t=clamp((x-p[j-1].x)/(p[j].x-p[j-1].x||1));
    return p[j-1].y+(p[j].y-p[j-1].y)*t;
  });
}
// Bounded DTW plus aligned error preserves timing and prevents arbitrary warping.
export function similarity(a,b) {
  if(a.length!==b.length||a.length<4)return 0;
  const n=a.length,band=7;let prev=new Float64Array(n+1).fill(Infinity),row=new Float64Array(n+1);prev[0]=0;
  for(let i=1;i<=n;i++){
    row.fill(Infinity);
    for(let j=Math.max(1,i-band);j<=Math.min(n,i+band);j++)row[j]=Math.abs(a[i-1]-b[j-1])+Math.min(prev[j],row[j-1],prev[j-1]);
    [prev,row]=[row,prev];
  }
  const aligned=mean(a.map((x,i)=>Math.abs(x-b[i])));
  const edge=(Math.abs(a[0]-b[0])+Math.abs(a.at(-1)-b.at(-1)))/2;
  return clamp(1-(prev[n]/n*.55+aligned*.3+edge*.15)*2.2)*100;
}
export function swingPoints(candles,radius=2,threshold=0) {
  const raw=[];
  for(let i=radius;i<candles.length-radius;i++){
    const c=candles[i],slice=candles.slice(i-radius,i+radius+1);
    const high=slice.every(x=>c.high>=x.high)&&slice.some(x=>c.high>x.high);
    const low=slice.every(x=>c.low<=x.low)&&slice.some(x=>c.low<x.low);
    if(high===low)continue; // Intrabar order is unknown for an outside bar.
    const p={x:i,y:high?c.high:c.low,type:high?1:-1};const last=raw.at(-1);
    if(last?.type===p.type){if((p.y-last.y)*p.type>0)raw[raw.length-1]=p;}
    else if(!last||Math.abs(p.y-last.y)>=threshold)raw.push(p);
  }
  return raw;
}
function alternating(p,t) {return p.slice(1).every((v,i)=>Math.sign(v.y-p[i].y)===Math.sign(t[i+1].y-t[i].y));}
export function harmonicRatios(p) {
  const v=p.map(x=>typeof x==='number'?x:x.y),[a,b,c,d]=v.slice(-4);
  const ab=Math.abs(b-a),bc=Math.abs(c-b),cd=Math.abs(d-c);
  if(Math.min(ab,bc,cd)<=1e-12)return null;
  const out={bc:bc/ab,cd:cd/bc,equal:cd/ab};
  if(v.length===5){const xa=Math.abs(v[1]-v[0]);if(!xa)return null;out.ab=ab/xa;out.ad=Math.abs(v[1]-v[4])/xa;}
  return out;
}
export function validateHarmonic(p,pattern) {
  const ratios=harmonicRatios(p);if(!ratios||!alternating(p,pattern.points))return null;
  const [x,a,b,c,d]=p.map(q=>q.y);
  if(p.length===5){const dir=Math.sign(a-x);if((c-b)*dir<=0||(a-c)*dir<=0)return null;}
  for(const [key,[lo,hi]] of Object.entries(pattern.ratios)) {
    const tolerance=lo===hi?lo*.05:0;
    if(ratios[key]<lo-tolerance-1e-9||ratios[key]>hi+tolerance+1e-9)return null;
  }
  return ratios;
}
function regression(points){const mx=mean(points.map(p=>p.x)),my=mean(points.map(p=>p.y));const m=points.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0)/(points.reduce((s,p)=>s+(p.x-mx)**2,0)||1);return {m,b:my-m*mx};}
export function structureValid(p,pattern) {
  if(p.length!==pattern.points.length||!alternating(p,pattern.points))return false;
  const q=normalize(p).map(v=>v.y),r=pattern.rule;
  if(r==='harmonic')return !!validateHarmonic(p,pattern);
  if(r==='w'||r==='m'){
    const v=r==='m'?q.map(v=>1-v):q;
    return Math.abs(v[1]-v[3])<=.25&&v[0]-v[1]>=.35&&v[2]-Math.max(v[1],v[3])>=.30&&v[4]-v[3]>=.18;
  }
  if(['hs','ihs','triple-bottom','triple-top'].includes(r)){
    const v=['hs','triple-top'].includes(r)?q.map(v=>1-v):q;
    const shoulders=Math.abs(v[1]-v[5])<=.18,neck=Math.abs(v[2]-v[4])<=.18;
    return shoulders&&neck&&(r==='hs'||r==='ihs'?Math.min(v[1],v[5])-v[3]>=.16:Math.max(v[1],v[3],v[5])-Math.min(v[1],v[3],v[5])<=.18)&&v[6]>=Math.min(v[2],v[4])-.18;
  }
  const z=normalize(p);const highs=z.filter((v,i)=>p[i].type===1),lows=z.filter((v,i)=>p[i].type===-1);
  if(highs.length<2||lows.length<2)return false;
  const h=regression(highs),l=regression(lows),width0=h.b-l.b,width1=h.m+h.b-l.m-l.b;
  const contracts=width0>0&&width1>0&&width1/width0<.76;
  switch(r){
    case 'triangle':return contracts&&h.m<-.12&&l.m>.12;
    case 'ascending':return contracts&&Math.abs(h.m)<.16&&l.m>.24;
    case 'descending':return contracts&&Math.abs(l.m)<.16&&h.m<-.24;
    case 'range':return Math.abs(h.m)<.18&&Math.abs(l.m)<.18;
    case 'falling-wedge':return contracts&&h.m<-.28&&l.m<-.08;
    case 'rising-wedge':return contracts&&h.m>.08&&l.m>.28;
    case 'broadening':return width0>0&&width1>width0*1.35&&h.m>.15&&l.m<-.15;
    case 'channel-up':return h.m>.25&&l.m>.25&&Math.abs(h.m-l.m)<.25;
    case 'channel-down':return h.m<-.25&&l.m<-.25&&Math.abs(h.m-l.m)<.25;
    case 'flag-up':case 'flag-down':case 'pennant-up':case 'pennant-down':{
      const dir=r.endsWith('up')?1:-1;
      if((q[1]-q[0])*dir<.8)return false;
      const tail=p.slice(1),tailPattern={points:pattern.points.slice(1),rule:r.startsWith('flag')?(dir===1?'channel-down':'channel-up'):'triangle'};
      return structureValid(tail,tailPattern);
    }
    default:return true;
  }
}
function atr(c) {return mean(c.slice(1).map((v,i)=>Math.max(v.high-v.low,Math.abs(v.high-c[i].close),Math.abs(v.low-c[i].close))));}
// These are observed setup phases, never a breakout prediction or the Radar's T1/T2/T3 score.
function setupPhase(context,pattern,pivots,score,shape,visual,end){
  const {candles,volatility:a}=context,last=candles.at(-1).close,age=candles.length-1-end,r=pattern?.rule;
  if(!pattern||!pivots)return {tier:score>=90&&age<=2?2:3,stage:'相似路徑'};
  const bullish=['w','ihs','triple-bottom'].includes(r),bearish=['m','hs','triple-top'].includes(r);
  if(bullish||bearish){
    const dir=bullish?1:-1,trough=pivots.at(-2).y,neck=pivots.length===5?pivots[2].y:(pivots[2].y+pivots[4].y)/2;
    const height=Math.max(Math.abs(neck-trough),a),progress=(last-neck)*dir;
    // A failed right shoulder or second bottom is not an actionable reversal.
    if((last-trough)*dir<-.35*a)return null;
    const symmetry=pivots.length===5?Math.abs(pivots[1].y-pivots[3].y)/height:Math.abs(pivots[1].y-pivots[5].y)/height;
    const strict=symmetry<=.18&&shape>=86&&visual>=64&&score>=83&&age<=3;
    if(strict&&progress>=-.9*a&&progress<=.25*a)return {tier:1,stage:'頸線附近 · 待確認'};
    if(progress>=-.9*a&&progress<=Math.min(1.7*a,height*.38)&&score>=76&&age<=5)return {tier:2,stage:progress>0?'初步越過頸線':'接近頸線'};
    return {tier:3,stage:progress>Math.min(1.7*a,height*.38)?'已走離頸線':'尚未到觸發區'};
  }
  if(['triangle','ascending','descending'].includes(r)){
    const highs=pivots.filter(p=>p.type===1),lows=pivots.filter(p=>p.type===-1);
    if(highs.length<2||lows.length<2)return {tier:3,stage:'結構待確認'};
    const upper=regression(highs),lower=regression(lows),x=candles.length-1;
    const top=upper.m*x+upper.b,bottom=lower.m*x+lower.b;
    const widthAtStart=(upper.m-lower.m)*pivots[0].x+upper.b-lower.b;
    const width=(top-bottom),contract=widthAtStart>0?width/widthAtStart:1;
    const up=(last-top)/a,down=(bottom-last)/a,opposite=r==='ascending'?down:r==='descending'?up:Math.max(0,Math.min(up,down));
    if(opposite>.45)return null;
    if(up>.35||down>.35){const move=Math.max(up,down);return move<=1.5&&score>=77?{tier:2,stage:'初步突破邊界'}:{tier:3,stage:'已走離收斂區'};}
    if(score>=84&&shape>=86&&visual>=64&&contract<=.67&&age<=3&&width>-.35*a)return {tier:1,stage:'收斂末段 · 待確認'};
    return {tier:3,stage:'收斂中'};
  }
  // Other catalog shapes have no verified trigger rule yet; keep them out of T1.
  if(score>=88&&shape>=88&&age<=2)return {tier:2,stage:'形態候選 · 位置待確認'};
  if(score>=78&&age<=5)return {tier:2,stage:'形態形成中'};
  return {tier:3,stage:'相似形態 · 較早期'};
}
// Build reusable features once per symbol/timeframe, independent of the selected drawing.
export function prepareCandles(candles) {
  const volatility=atr(candles), n=candles.length, swings=[];
  for(const [radius,multiple] of [[1,.5],[2,.65],[3,1],[5,1.5],[8,2]]) {
    const p=swingPoints(candles,radius,volatility*multiple);swings.push(p);
  }
  const windows=[];
  for(let end=n-1;end>=Math.max(0,n-7);end-=2)for(let span=16;span<=Math.min(160,end);span+=4){
    const start=end-span,slice=candles.slice(start,end+1),points=slice.map((c,i)=>({x:i,y:c.close}));
    if(Math.max(...slice.map(c=>c.high))-Math.min(...slice.map(c=>c.low))<volatility*2)continue;
    windows.push({start,end,samples:resample(points)});
  }
  return {candles,volatility,swings,windows,visuals:new Map()};
}
const targets=new Map(PATTERNS.map(p=>[p.id,resample(p.points)]));
function levelMatch(context,pattern) {
  const {candles:c,volatility:a,swings}=context,n=c.length,last=c.at(-1).close;
  if(!a)return null;
  const support=pattern.rule.endsWith('support'),trend=pattern.rule.startsWith('trend'),type=support?-1:1;
  const pivots=swings[1].filter(p=>p.type===type&&p.x>=n-150);let best=null;
  const consider=(touches,line)=>{
    const start=touches[0].x,end=n-1,span=end-start;
    if(span<15||touches.length<3||end-touches.at(-1).x>32)return;
    const atEnd=line.m*end+line.b,distance=(last-atEnd)*(support?1:-1);
    if(distance<(support?-.45:-2)*a||distance>5*a)return;
    const crossed=c.slice(start,touches.at(-1).x+1).filter((v,i)=>(v.close-(line.m*(i+start)+line.b))*(support?1:-1)<-a).length;
    if(crossed>span*.08)return;
    const error=mean(touches.map(p=>Math.abs(p.y-(line.m*p.x+line.b))))/a;
    const score=clamp(.72+Math.min(touches.length,5)*.035-error*.09-Math.abs(distance)/a*.012)*100;
    const tier=error<=.48&&score>=82&&distance>=0&&distance<=.75*a?1:
      score>=76&&(support?distance>.75*a&&distance<=2.2*a:distance<0&&distance>=-1.5*a)?2:3;
    const stage=tier===1?(support?'支撐附近 · 待確認':'阻力附近 · 待確認'):tier===2?(support?'初步反彈':'初步突破'):'已離開水平區';
    if(best&&(tier>best.tier||tier===best.tier&&score<=best.similarity))return;
    best={start,end,similarity:Math.round(score*10)/10,points:[{x:start,y:line.m*start+line.b},{x:end,y:atEnd}],label:pattern.name,lastTime:c[end].time,touches:touches.length,tier,stage,kind:'level'};
  };
  if(!trend){
    for(const pivot of pivots){
      const near=pivots.filter(p=>Math.abs(p.y-pivot.y)<=a*.58),touches=[];
      for(const p of near)if(!touches.length||p.x-touches.at(-1).x>=4)touches.push(p);
      if(touches.length>=3)consider(touches,{m:0,b:mean(touches.map(p=>p.y))});
    }
  }else for(let start=0;start<pivots.length-2;start++){
    const tail=pivots.slice(start),line=regression(tail);
    if(line.m*(support?1:-1)<a*.025)continue;
    const touches=tail.filter(p=>Math.abs(p.y-(line.m*p.x+line.b))<=a*.8);
    if(touches.length>=3&&touches.at(-1).x-touches[0].x>=12)consider(touches,regression(touches));
  }
  return best;
}
export function matchPrepared(context,query) {
  const {candles,n= context.candles.length}=context;
  if(candles.length<24)return null;
  const sketch=query.mode==='sketch',pattern=sketch?null:patternById(query.id);
  if(pattern?.rule.startsWith('level')||pattern?.rule.startsWith('trend'))return levelMatch(context,pattern);
  const target=sketch?resample(query.points||[]):targets.get(pattern?.id)||resample(query.points||[]);
  if(!target.length)return null;
  let best=null;
  const consider=(start,end,pivots,ratios=null,samples=null)=>{
    if(end-start<15||end-start>160||n-1-end>8)return;
    const key=start+':'+end;
    let visualSamples=samples||context.visuals.get(key);
    if(!visualSamples){const slice=candles.slice(start,end+1);if(Math.max(...slice.map(c=>c.high))-Math.min(...slice.map(c=>c.low))<context.volatility*2)return;visualSamples=resample(slice.map((c,i)=>({x:i,y:c.close})));context.visuals.set(key,visualSamples);}
    const visual=similarity(visualSamples,target);let score=visual,shape=visual;
    if(pivots){shape=similarity(resample(pivots),target);score=.6*shape+.4*visual;if(shape<70)return;}
    const reversal=pattern&&['w','m'].includes(pattern.rule);
    const minimum=sketch?70:pattern?.rule==='harmonic'?72:reversal?71:77;
    if(score<minimum)return;
    const phase=setupPhase(context,pattern,pivots,score,shape,visual,end);if(!phase)return;
    if(best&&(phase.tier>best.tier||phase.tier===best.tier&&score<=best.similarity))return;
    best={start,end,similarity:Math.round(score*10)/10,points:pivots||candles.slice(start,end+1).map((c,i)=>({x:i+start,y:c.close})),ratios,label:sketch?'相似路徑':pattern?.name||'自繪路徑',...phase,kind:sketch?'sketch':'pattern',lastTime:candles[end].time};
  };
  if(pattern&&pattern.rule!=='path') {
    for(const base of context.swings){
      const pivots=[...base];
      if(pattern.rule!=='harmonic'&&pivots.length){const last=pivots.at(-1),c=candles.at(-1);if((c.close-last.y)*last.type<0)pivots.push({x:n-1,y:c.close,type:-last.type});}
      const k=pattern.points.length;
      for(let i=Math.max(0,pivots.length-k-6);i<=pivots.length-k;i++){
        const p=pivots.slice(i,i+k);if(n-1-p.at(-1).x>8||!structureValid(p,pattern))continue;
        consider(p[0].x,p.at(-1).x,p,pattern.rule==='harmonic'?validateHarmonic(p,pattern):null);
      }
    }
  }else {
    // Cheap aligned distance narrows the candidates before DTW. Timing and price are normalized.
    const nearest=context.windows.map(w=>({w,error:mean(w.samples.map((v,i)=>Math.abs(v-target[i])))})).sort((a,b)=>a.error-b.error).slice(0,16);
    for(const {w} of nearest)consider(w.start,w.end,null,null,w.samples);
  }
  if(sketch&&best&&query.id){
    const structural=matchPrepared(context,{id:query.id});
    if(structural&&Math.abs(structural.end-best.end)<=8&&Math.abs(structural.start-best.start)<=25){
      best.tier=structural.tier;best.stage=structural.stage;
    }else{best.tier=3;best.stage='路徑相似 · 結構未確認';}
  }
  return best;
}
export function matchCandles(candles,query){return matchPrepared(prepareCandles(candles),query);}
export function classifyPrepared(context){
  const matches={};for(const p of PATTERNS){const match=matchPrepared(context,{id:p.id});if(match)matches[p.id]=match;}return matches;
}
export function patternCounts(entries,frames){
  const sets=new Map(PATTERNS.map(p=>[p.id,new Set()]));
  for(const entry of entries)if(frames.includes(entry.data.frame))for(const id of Object.keys(entry.matches))sets.get(id)?.add(entry.data.symbol);
  return Object.fromEntries([...sets].map(([id,s])=>[id,s.size]));
}
export function queryFromStrokes(strokes) {
  const valid=strokes.filter(s=>s.length>=2);if(!valid.length)return null;
  // Two drawn boundaries become an alternating path between their measured envelopes.
  if(valid.length===2){
    const lines=valid.map(s=>regression(s)),left=Math.max(...valid.map(s=>Math.min(...s.map(p=>p.x)))),right=Math.min(...valid.map(s=>Math.max(...s.map(p=>p.x))));
    if(right-left>.15){
      const mid=(left+right)/2;lines.sort((a,b)=>(b.m*mid+b.b)-(a.m*mid+a.b));
      const points=Array.from({length:7},(_,i)=>{const x=left+(right-left)*i/6,l=lines[i%2];return{x,y:l.m*x+l.b};});
      if(lines[0].m*right+lines[0].b>=lines[1].m*right+lines[1].b){
        const candidates=PATTERNS.filter(p=>['triangle','ascending','descending','range','falling-wedge','rising-wedge','channel-up','channel-down','broadening'].includes(p.id));
        const best=candidates.map(p=>({p,s:similarity(resample(points),resample(p.points))})).sort((a,b)=>b.s-a.s)[0];
        return best.s>=83?{id:best.p.id,points,mode:'sketch'}:{points,mode:'sketch'};
      }
    }
  }
  const raw=valid.at(-1),a=raw[0].x,b=raw.at(-1).x;
  const chronological=b>=a?raw:[...raw].reverse();let last=-Infinity;
  const path=chronological.filter(p=>{if(p.x<=last+.001)return false;last=p.x;return true;});
  if(path.length<2||path.at(-1).x-path[0].x<.12)return null;
  const line=regression(path),deviation=Math.sqrt(mean(path.map(p=>(p.y-line.m*p.x-line.b)**2))),height=Math.max(...path.map(p=>p.y))-Math.min(...path.map(p=>p.y));
  if(height<.045)return {id:'horizontal-resistance',mode:'level'};
  if(deviation<.025&&Math.abs(line.m)>.15)return {id:line.m>0?'trend-up':'trend-down',mode:'level'};
  const p=normalize(path);if(!p.length)return null;
  // Only label a hand-drawn common shape when strongly aligned; harmonic names require explicit ratio validation.
  const best=PATTERNS.filter(t=>t.rule!=='harmonic'&&!t.rule.startsWith('level')&&!t.rule.startsWith('trend')).map(t=>({t,s:similarity(resample(p),resample(t.points))})).sort((a,b)=>b.s-a.s)[0];
  return best.s>=78?{id:best.t.id,points:p,mode:'sketch'}:{points:p,mode:'sketch'};
}
export function sortMatches(rows){return [...rows].sort((a,b)=>(a.match?.tier??3)-(b.match?.tier??3)||b.similarity-a.similarity||(b.oxScore??-1)-(a.oxScore??-1)||b.turnover-a.turnover||a.symbol.localeCompare(b.symbol));}
