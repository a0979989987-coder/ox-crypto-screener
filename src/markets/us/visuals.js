import {BubbleField} from '../crypto/bubbles/field.js?v=20261002-tw3';
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
