import {BubbleField} from '../crypto/bubbles/field.js?v=20261002-finance4';
import {mountBubbles} from '../crypto/bubbles/view.js?v=20261003-us-parity1';
import {patternDataAllowed} from './patterns/source.js?v=20261003-us-parity1';
import {e,price,compact,pct} from './view-utils.js?v=20261001-us-device1';

export const US_BUBBLE_METRICS = Object.freeze([['change','收盤漲跌'],['volume','成交量'],['liquidity','平均成交額'],['rvol','量比']]);
const usableNumber = value => typeof value === 'number' && Number.isFinite(value);
export function usBubbleRows({capabilities,snapshot,directory=[]},{metric='change',direction='both',watch=null,limit=50}={}) {
 if(!patternDataAllowed(capabilities)||snapshot?.mode!=='eod'||!snapshot.sessionDate||!US_BUBBLE_METRICS.some(row=>row[0]===metric))return [];
 const daily=new Map((snapshot.analyses||[]).filter(row=>row.interval==='1D').map(row=>[row.symbol,row]));
 const names=new Map(directory.map(row=>[row.symbol,row])),seen=new Set();
 return (snapshot.quotes||[]).flatMap(quote=>{
  const analysis=daily.get(quote.symbol),item=names.get(quote.symbol)||analysis;
  if(!item?.name||item.complex||seen.has(quote.symbol)||!(usableNumber(quote.price)&&quote.price>0)||
    !usableNumber(quote.changePct)||quote.asOf&&quote.asOf!==snapshot.sessionDate)return [];
  seen.add(quote.symbol);
  const values={change:quote.changePct,volume:quote.volume,liquidity:analysis?.liquidity,rvol:analysis?.rvol},value=values[metric];
  if(!usableNumber(value)||metric!=='change'&&value<0||watch&&!watch.has(quote.symbol)||
    direction==='long'&&quote.changePct<=0||direction==='short'&&quote.changePct>=0)return [];
  return [{symbol:quote.symbol,base:quote.symbol,name:item.name,price:quote.price,change:quote.changePct,
   volume:usableNumber(quote.volume)?quote.volume:null,liquidity:usableNumber(analysis?.liquidity)?analysis.liquidity:null,
   rvol:usableNumber(analysis?.rvol)?analysis.rvol:null,value,dataDate:snapshot.sessionDate}];
 }).sort((a,b)=>(metric==='change'?Math.abs(b.value)-Math.abs(a.value):b.value-a.value)||a.symbol.localeCompare(b.symbol)).slice(0,limit);
}
export function usBubbleText(value,metric) {
 if(!usableNumber(value))return '—';
 if(metric==='change')return pct(value);
 if(metric==='rvol')return `${value.toFixed(2)}×`;
 return compact(value);
}
export function mountUSBubbles(host,{getContext,watching,onOpenRadar,refresh=()=>{}}) {
 host.dataset.bubbleMarket='us';
 const adapter={marketLabel:'美股',metrics:US_BUBBLE_METRICS,format:usBubbleText,
  palette:{up:'#00b8d4',down:'#ff3078'},radiusForRows:usBubbleRadii,watching,
  displayName:row=>`${row.symbol} ${row.name}`,
  rows:options=>usBubbleRows(getContext(),options),
  empty(node,{scope,direction,metric}){
   const context=getContext();
   node.textContent=!patternDataAllowed(context.capabilities)?'美股盤後行情尚未接通':scope==='watch'&&!watching().size?
    '先在美股雷達收藏股票，這裡會顯示你的自選':!context.snapshot?.quotes?.length?'尚未取得收盤行情':
    metric==='rvol'?'目前沒有可驗證的完整日量比':`目前沒有符合${direction==='long'?'看多':direction==='short'?'看空':'篩選'}條件的股票`;
  },
  detail:row=>`<strong class="oxb-price">${price(row.price)}<small> USD</small></strong><dl><div><dt>收盤漲跌</dt><dd class="${row.change>=0?'up':'down'}">${pct(row.change)}</dd></div><div><dt>成交股數</dt><dd>${compact(row.volume)} 股</dd></div><div><dt>完整日量比</dt><dd>${usBubbleText(row.rvol,'rvol')}</dd></div><div><dt>20日平均估算成交額</dt><dd>${compact(row.liquidity)} USD</dd></div></dl><small class="oxb-note">交易日 ${e(row.dataDate)} · 已收盤<br>成交額以每日收盤價 × 成交股數估算；泡泡大小依 20 日平均估算成交額。未提供逐筆成交或盤中行情。</small>`,
  start(){return ()=>{};},refresh,
 };
 const mounted=mountBubbles(host,{adapter,onOpenRadar});
 host.shadowRoot.querySelector('[data-slot="metric-label"]').textContent='收盤漲跌';
 host.shadowRoot.querySelector('[data-action="metric-menu"]').setAttribute('aria-label','選擇泡泡篩選條件，目前收盤漲跌');
 const style=document.createElement('style');style.textContent='.oxb-dialog .up,.up b,.oxb-direction[data-direction=long]{color:#00b8d4}.oxb-dialog .down,.down b,.oxb-direction[data-direction=short]{color:#ff3078}';host.shadowRoot.append(style);
 return {...mounted,draw:mounted.refresh};
}
// Keep US sizing tied to average traded value while sharing the same drag,
// contact deformation, pinch, recovery and lifecycle as Crypto and Taiwan.
export function usBubbleRadii(rows,width,height){
 const radii=rows.map(row=>20+Math.log10(Math.max(1,row.liquidity||1))*2);
 const area=radii.reduce((sum,r)=>sum+Math.PI*r*r,0),fit=Math.min(1,Math.sqrt(width*height*.52/Math.max(area,1)));
 return radii.map(r=>Math.min(width*.22,height*.22,Math.max(8,r*fit)));
}
export class USBubbles {
 constructor(root,rows,onSelect){
  this.root=root;this.rows=rows;this.onSelect=onSelect;
  root.innerHTML='<canvas class="us2-bubble-plot" aria-label="股票泡泡圖：顏色為完整交易日漲跌，大小為平均成交額的對數權重" tabindex="0"></canvas><div class="us2-visual-legend">藍＋／紅−：完整日漲跌 · 大小：20日平均成交額對數 <button type="button">重設視野</button></div>';
  this.canvas=root.querySelector('canvas');this.canvas.style.touchAction='none';
  this.field=new BubbleField(this.canvas,{assetName:'股票',metricNames:{change:'完整日漲跌'},palette:{up:'#00b8d4',down:'#ff3078'},radiusForRows:usBubbleRadii,onSelect:n=>this.onSelect(n.symbol),formatMetric:value=>Number.isFinite(value)?`${value>=0?'+':''}${value.toFixed(2)}%`:'—'});
  root.querySelector('button').onclick=()=>this.field.reset();
  this.canvas.addEventListener('keydown',e=>{if(!['+','-','0'].includes(e.key))return;e.preventDefault();if(e.key==='0')this.field.reset();else this.field.setZoom(this.field.zoom*(e.key==='+'?1.2:1/1.2));},{signal:this.field.life.signal});
  this.draw();
 }
 draw(){this.field.setRows(this.rows.slice(0,60).map(row=>({symbol:row.symbol,base:row.symbol,value:row.changePct,change:row.changePct,liquidity:row.liquidity})),'change');}
 destroy(){this.field.destroy();this.root.innerHTML='';}
}
export function bindPatternBoard(root, onPath) {
  const canvas = root.querySelector("canvas"),
    ctx = canvas.getContext("2d");
  let points = [],
    pointer = null,
    start = null,
    fromControl = false,
    suppress = false;
  const paint = () => {
    const d = devicePixelRatio || 1,
      w = root.clientWidth,
      h = root.clientHeight;
    canvas.width = w * d;
    canvas.height = h * d;
    ctx.scale(d, d);
    ctx.fillStyle = "#e0e7ef13";
    for(let x=22;x<w-10;x+=24)for(let y=18;y<h-12;y+=24)ctx.fillRect(x,y,1,1);
    if (points.length > 1) {
      ctx.strokeStyle = "#f4f0e8";
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      points.forEach((p, i) =>
        i ? ctx.lineTo(p.x * w, p.y * h) : ctx.moveTo(p.x * w, p.y * h),
      );
      ctx.stroke();
    }
  };
  const pos = (e) => {
    const r = root.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };
  const down = (e) => {
    if (e.button !== 0) return;
    pointer = e.pointerId;
    start = pos(e);
    fromControl = !!e.target.closest("button,select");
    if (!fromControl) {
      points = [start];
      root.setPointerCapture(pointer);
      e.preventDefault();
      paint();
    }
  };
  const move = (e) => {
    if (pointer !== e.pointerId) return;
    const p = pos(e);
    if (fromControl) {
      if (
        Math.hypot(
          (p.x - start.x) * root.clientWidth,
          (p.y - start.y) * root.clientHeight,
        ) < 8
      )
        return;
      fromControl = false;
      suppress = true;
      points = [start];
      root.setPointerCapture(pointer);
    }
    points.push(p);
    paint();
  };
  const up = (e) => {
    if (pointer !== e.pointerId) return;
    pointer = null;
    if (!fromControl && points.length > 4) onPath(points);
  };
  const click = (e) => {
    if (suppress) {
      e.preventDefault();
      e.stopImmediatePropagation();
      suppress = false;
    }
  };
  root.addEventListener("pointerdown", down);
  root.addEventListener("pointermove", move);
  root.addEventListener("pointerup", up);
  root.addEventListener("pointercancel", () => (pointer = null));
  root.addEventListener("click", click, true);
  let resizeFrame = 0;
  const ro = new ResizeObserver(() => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; paint(); });
  });
  ro.observe(root);
  paint();
  return {
    clear() {
      points = [];
      paint();
      onPath([]);
    },
    destroy() {
      ro.disconnect();
      cancelAnimationFrame(resizeFrame);
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", up);
      root.removeEventListener("click", click, true);
    },
  };
}
