import { PATTERNS, patternById } from './catalog.js';
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
  const n=a.length,band=4;let prev=new Float64Array(n+1).fill(Infinity);prev[0]=0;
  for(let i=1;i<=n;i++){
    const row=new Float64Array(n+1).fill(Infinity);
    for(let j=Math.max(1,i-band);j<=Math.min(n,i+band);j++)row[j]=Math.abs(a[i-1]-b[j-1])+Math.min(prev[j],row[j-1],prev[j-1]);
    prev=row;
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
    return Math.abs(v[1]-v[3])<=.18&&v[2]-Math.max(v[1],v[3])>=.45&&v[4]>=v[2]-.18;
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
export function matchCandles(candles,query) {
  if(candles.length<24)return null;
  const pattern=patternById(query.id),target=resample(pattern?.points||query.points||[]);
  if(!target.length)return null;
  const n=candles.length;let best=null;
  const consider=(start,end,pivots,ratios=null)=>{
    if(end-start<15||end-start>140||n-1-end>8)return;
    const slice=candles.slice(start,end+1),pricePath=slice.map((c,i)=>({x:i,y:c.close}));
    if(Math.max(...slice.map(c=>c.high))-Math.min(...slice.map(c=>c.low))<atr(slice)*2.5)return;
    const visual=similarity(resample(pricePath),target);
    let score=visual;
    if(pivots){const shape=similarity(resample(pivots),target);score=.6*shape+.4*visual;if(shape<77)return;}
    const minimum=pattern?.rule==='harmonic'?72:78;
    if(score<minimum||best&&score<=best.similarity)return;
    best={start,end,similarity:Math.round(score*10)/10,points:pivots||pricePath.map(v=>({x:v.x+start,y:v.y})),ratios,label:pattern?.name||'自繪路徑',lastTime:candles[end].time};
  };
  if(pattern&&pattern.rule!=='path') {
    const minMove=atr(candles)*.65;
    for(const radius of [2,3,5]){
      const pivots=swingPoints(candles,radius,minMove);
      // A terminal close is allowed for neckline/continuation sketches; never for harmonic pivots.
      if(pattern.rule!=='harmonic'&&pivots.length){const last=pivots.at(-1),c=candles.at(-1);if((c.close-last.y)*last.type<0)pivots.push({x:n-1,y:c.close,type:-last.type});}
      const k=pattern.points.length;
      for(let i=Math.max(0,pivots.length-k-4);i<=pivots.length-k;i++){
        const p=pivots.slice(i,i+k);if(n-1-p.at(-1).x>8||!structureValid(p,pattern))continue;
        consider(p[0].x,p.at(-1).x,p,pattern.rule==='harmonic'?validateHarmonic(p,pattern):null);
      }
    }
  }else{
    for(let end=n-1;end>=n-4;end--)for(let span=20;span<=Math.min(140,end);span+=4)consider(end-span,end,null);
  }
  return best;
}
export function queryFromStrokes(strokes) {
  const valid=strokes.filter(s=>s.length>=3);if(!valid.length)return null;
  // Two drawn boundaries become an alternating path between their measured envelopes.
  if(valid.length===2){
    const lines=valid.map(s=>regression(s)),left=Math.max(...valid.map(s=>Math.min(...s.map(p=>p.x)))),right=Math.min(...valid.map(s=>Math.max(...s.map(p=>p.x))));
    if(right-left>.15){
      const mid=(left+right)/2;lines.sort((a,b)=>(b.m*mid+b.b)-(a.m*mid+a.b));
      const points=Array.from({length:7},(_,i)=>{const x=left+(right-left)*i/6,l=lines[i%2];return{x,y:l.m*x+l.b};});
      if(lines[0].m*right+lines[0].b>=lines[1].m*right+lines[1].b){
        const candidates=PATTERNS.filter(p=>['triangle','ascending','descending','range','falling-wedge','rising-wedge','channel-up','channel-down','broadening'].includes(p.id));
        const best=candidates.map(p=>({p,s:similarity(resample(points),resample(p.points))})).sort((a,b)=>b.s-a.s)[0];
        return best.s>=83?{id:best.p.id,points}:{points};
      }
    }
  }
  const raw=valid.at(-1),a=raw[0].x,b=raw.at(-1).x;
  const chronological=b>=a?raw:[...raw].reverse();let last=-Infinity;
  const path=chronological.filter(p=>{if(p.x<=last+.001)return false;last=p.x;return true;});
  if(path.length<3||path.at(-1).x-path[0].x<.12)return null;
  const p=normalize(path);if(!p.length)return null;
  // Only label a hand-drawn common shape when strongly aligned; harmonic names require explicit ratio validation.
  const best=PATTERNS.filter(t=>t.rule!=='harmonic').map(t=>({t,s:similarity(resample(p),resample(t.points))})).sort((a,b)=>b.s-a.s)[0];
  return best.s>=90?{id:best.t.id,points:p}:{points:p};
}
export function sortMatches(rows){return [...rows].sort((a,b)=>b.similarity-a.similarity||(b.oxScore??-1)-(a.oxScore??-1)||b.turnover-a.turnover||a.symbol.localeCompare(b.symbol));}
