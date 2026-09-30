/* Home candidates share the radar tiers; preview never changes the radar viewport. */
(() => {
  const home=document.getElementById('view-home');
  if(!home)return;
  const dialog=document.createElement('dialog');
  dialog.className='ox-home-preview';
  dialog.setAttribute('aria-label','幣種 K 線預覽');
  dialog.innerHTML=`<header><strong data-title></strong><div><button data-action="radar">前往雷達</button><button data-action="reset" aria-label="重設圖表">↺</button><button data-action="close" aria-label="關閉預覽">×</button></div></header><nav aria-label="預覽 K 線級別">${['15m','1H','4H','1D','1W'].map(f=>`<button data-frame="${f}">${f}</button>`).join('')}</nav><div class="ox-home-preview-chart"></div><p data-status role="status"></p>`;
  document.body.append(dialog);
  const stage=dialog.querySelector('.ox-home-preview-chart'),title=dialog.querySelector('[data-title]'),status=dialog.querySelector('[data-status]');
  let chart=null,series=null,selected=null,frame='1H',request=0,focusBefore=null;
  function resize(){if(chart&&dialog.open)chart.resize(stage.clientWidth,stage.clientHeight);}
  new ResizeObserver(resize).observe(stage);
  async function load(){
    const id=++request,symbol=selected.symbol;
    title.textContent=`${symbol.replace(/USDT$/,'')} · ${frame} · ${selected.tier.toUpperCase()}`;
    dialog.querySelectorAll('[data-frame]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.frame===frame)));
    series.setData([]);status.textContent='正在載入 K 線…';
    try{
      const data=await BitgetAPI.fetchCandles(symbol,frame,160);
      if(id!==request||!dialog.open)return;
      if(!data.length)throw new Error('沒有可用 K 線');
      series.setData(data);chart.priceScale('right').applyOptions({autoScale:true});chart.timeScale().fitContent();
      status.textContent=`${selected.tier.toUpperCase()} · OX ${selected.score} · Bitget USDT 永續`;
    }catch(_){if(id===request&&dialog.open)status.textContent='K 線暫時無法取得，請切換級別重試。';}
  }
  function open(row){
    clearTimeout(singleTimer);
    const symbol=row.dataset.homeSymbol;
    const candidate=state.analyzedCache.get(symbol);
    selected={symbol,tier:row.dataset.homeTier||candidate?.tier||'t3',score:candidate?.oxScore??'—',side:row.dataset.homeSide};
    frame='1H';focusBefore=row;
    if(!dialog.open)dialog.showModal();
    if(!chart){
      chart=LightweightCharts.createChart(stage,{width:stage.clientWidth,height:stage.clientHeight,layout:{background:{type:'solid',color:'#15191d'},textColor:'#aeb3b3',attributionLogo:false},grid:{vertLines:{visible:false},horzLines:{color:'#ffffff0b'}},rightPriceScale:{autoScale:true,scaleMargins:{top:.12,bottom:.12}},timeScale:{timeVisible:true,rightOffset:5},handleScroll:{pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},handleScale:{pinch:true,mouseWheel:true,axisPressedMouseMove:{price:true,time:true}}});
      series=chart.addCandlestickSeries({upColor:'#00b8d4',downColor:'#ff3078',borderVisible:false,wickUpColor:'#00b8d4',wickDownColor:'#ff3078',priceFormat:{type:'custom',minMove:.00000001,formatter:p=>Number(p).toFixed(chartAxisPrecision(p)).replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'')}});
    }
    resize();load();
  }
  dialog.addEventListener('click',e=>{
    const button=e.target.closest('button');
    if(button?.dataset.frame){frame=button.dataset.frame;load();}
    else if(button?.dataset.action==='close')dialog.close();
    else if(button?.dataset.action==='reset'){chart.priceScale('right').applyOptions({autoScale:true});chart.timeScale().fitContent();}
    else if(button?.dataset.action==='radar'){
      const target=selected;dialog.close();setScannerDirectionFilter(target.side||'long');setScannerTierFilter(target.tier);switchSymbol(target.symbol);
    }else if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}
  });
  dialog.addEventListener('close',()=>{request++;focusBefore?.isConnected&&focusBefore.focus({preventScroll:true});});
  let press=null,holdTimer=null,singleTimer=null,lastTap=null,suppressedUntil=0;
  const rowAt=event=>event.target.closest('#view-home .ox-home-t1-row[data-home-symbol]');
  document.addEventListener('pointerdown',event=>{
    const row=rowAt(event);if(!row||event.button>0)return;
    clearTimeout(holdTimer);press={row,x:event.clientX,y:event.clientY,id:event.pointerId};
    holdTimer=setTimeout(()=>{if(!press)return;suppressedUntil=performance.now()+3000;open(press.row);press=null;},2000);
  },true);
  document.addEventListener('pointermove',event=>{if(press&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>9){clearTimeout(holdTimer);press=null;}},true);
  for(const type of ['pointerup','pointercancel'])document.addEventListener(type,()=>{clearTimeout(holdTimer);press=null;},true);
  document.addEventListener('contextmenu',event=>{if(rowAt(event))event.preventDefault();},true);
  document.addEventListener('click',event=>{
    const row=rowAt(event);if(!row)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(performance.now()<suppressedUntil)return;
    const now=performance.now();
    if(lastTap&&lastTap.symbol===row.dataset.homeSymbol&&now-lastTap.time<330){clearTimeout(singleTimer);lastTap=null;open(row);return;}
    lastTap={symbol:row.dataset.homeSymbol,time:now};
    clearTimeout(singleTimer);
    singleTimer=setTimeout(()=>{lastTap=null;setScannerDirectionFilter(row.dataset.homeSide);setScannerTierFilter(row.dataset.homeTier);switchSymbol(row.dataset.homeSymbol);},340);
  },true);
})();
