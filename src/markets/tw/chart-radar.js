import { rankChartRows, chartUniverse } from './chart-radar-model.js';
import { escapeTW as esc } from './radar-card.js';
import { savedResearch } from './research-data.js';
import { bundleState, bundleEntry, subscribeBundle, preloadBundle } from './patterns/bundle.js';
import { fetchSeries } from './patterns/source.js';
import { TIMEFRAMES, FRAME_LABELS } from './patterns/model.js';
const UP='#f16a70',DOWN='#48b78e';
const num=n=>Number.isFinite(n)?n.toLocaleString('zh-TW',{maximumFractionDigits:2}):'—';
const change=n=>Number.isFinite(n)?`${n>=0?'+':''}${n.toFixed(2)}%`:'—';
const money=n=>Number.isFinite(n)?`${(n/1e8).toFixed(2)} 億`:'—';
const glyph=type=>`<svg viewBox="0 0 24 24" aria-hidden="true">${({radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 7-7M12 3v9"/>',fire:'<path d="M13 3c1 5-4 6-3 10 2-1 3-3 3-3 4 3 5 5 4 8-1 3-7 4-10 0-3-5 2-8 6-15Z"/>',star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',fold:'<path d="m15 6-6 6 6 6M3 3v18"/>'})[type]}</svg>`;
export function mountTWChartRadar(host,{state:marketState,watchlist=new Set()}={}) {
 const life=new AbortController(),$=s=>host.querySelector(s),listen=(el,type,fn,options={})=>el?.addEventListener(type,fn,{...options,signal:life.signal});
 let tab='all',tier='all',side='long',query='',symbol='',frame='1D',focus=false,folded=false,serial=0,controller=null,drawings,gestures,holdTimer,held=false,levelLines=[];
 const state={symbol:'',period:frame,candleData:[],chart:null,candleSeries:null,chartPriceViewport:null};
 if(!document.querySelector('[data-tw-chart-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./chart-radar.css?v=20260930-twchart1',import.meta.url);link.dataset.twChartStyle='';document.head.append(link);}
 host.innerHTML=`<div class="tw-chart-radar"><div class="twcr-search"><input type="search" list="twcr-stocks" placeholder="搜尋股票名稱或代號" aria-label="搜尋台股圖表標的"><datalist id="twcr-stocks"></datalist><span class="twcr-date"></span></div><div class="twcr-workspace"><section class="chart-box twcr-chart-box"><div class="twcr-quote"><b data-quote-name>選擇股票</b><span data-quote-price>—</span><span data-quote-change></span><button type="button" data-action="fold" aria-label="收合候選列表" aria-pressed="false">${glyph('fold')}</button></div><div class="chart-controls"><div class="chart-timeframe-group" role="group" aria-label="台股時間級別">${Object.keys(TIMEFRAMES).map(f=>`<button type="button" data-twcr-frame="${f}" aria-pressed="${f===frame}">${FRAME_LABELS[f]}</button>`).join('')}</div><label class="twcr-levels"><input type="checkbox" data-levels>前高前低</label><button type="button" data-action="reset" aria-label="重設圖表">↶</button><button type="button" data-action="focus" aria-label="放大圖表">${glyph('expand')}</button></div><div id="tw-radar-chart" aria-label="台股 K 線圖"></div><div class="twcr-status" role="status"></div><button type="button" class="twcr-exit" data-action="exit" aria-label="退出全螢幕" hidden>${glyph('close')}</button></section><section class="twcr-scanner panel"><div class="scanner-tabs twcr-tabs" role="tablist" aria-label="台股圖表雷達分類"><button type="button" class="tab-btn active" data-twcr-tab="all" aria-label="T1 T2 T3 雷達，點按切換級別、長按開啟選單" aria-haspopup="menu" aria-expanded="false">${glyph('radar')}<span data-tier-label>T1–T3</span><small>▾</small></button><button type="button" class="tab-btn" data-twcr-tab="surge" aria-label="當日成交額前 50 名">${glyph('fire')}<span data-surge-count></span></button><button type="button" class="tab-btn" data-twcr-tab="watch" aria-label="自選股票">${glyph('star')}<span data-watch-count></span></button><button type="button" class="twcr-side" data-action="side" aria-label="切換當日上漲或下跌">↑</button></div><div class="twcr-tier-menu" role="menu" hidden>${['all','T1','T2','T3'].map(t=>`<button type="button" role="menuitemradio" data-twcr-tier="${t}" aria-checked="${t===tier}">${t==='all'?'全部':t}</button>`).join('')}</div><div class="twcr-pool-info"></div><div class="twcr-results" role="list"></div></section></div></div>`;
 const root=$('.tw-chart-radar'),box=$('.chart-box'),el=$('#tw-radar-chart');
 const snapshot=()=>{const b=bundleState();return b.stocks.length?{date:b.date,stocks:b.stocks}:savedResearch();};
 const universe=()=>chartUniverse(marketState,snapshot());
 function renderList(){
  if(life.signal.aborted)return;
  const rows=rankChartRows(universe(),{tab,tier,side,watchlist,query});let lastTier='';
  $('[data-tier-label]').textContent=tier==='all'?'T1–T3':tier;
  host.querySelectorAll('[data-twcr-tab]').forEach(b=>{const selected=b.dataset.twcrTab===tab;b.classList.toggle('active',selected);b.setAttribute('aria-selected',String(selected));});
  host.querySelectorAll('[data-twcr-tier]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.twcrTier===tier)));
  $('[data-surge-count]').textContent=rankChartRows(universe(),{tab:'surge'}).length;
  $('[data-watch-count]').textContent=watchlist.size;
  $('[data-action="side"]').textContent=side==='long'?'↑':'↓';$('[data-action="side"]').setAttribute('aria-pressed',String(side==='short'));$('[data-action="side"]').style.color=side==='long'?UP:DOWN;
  $('.twcr-pool-info').textContent=tab==='all'?`${side==='long'?'當日上漲':'當日下跌'} · 分級／觀察候選 · ${rows.length} 檔`:tab==='surge'?`當日成交額前 ${rows.length} 檔`:`自選 ${rows.length} 檔`;
  $('.twcr-date').textContent=snapshot()?.date?`資料日 ${snapshot().date}`:'官方資料載入中';
  $('#twcr-stocks').innerHTML=universe().map(r=>`<option value="${esc(r.symbol)}">${esc(r.name)}</option>`).join('');
  $('.twcr-results').innerHTML=rows.map(r=>{const heading=tab==='all'&&r.displayTier!==lastTier?`<div class="twcr-tier-heading">${esc(r.displayTier)}</div>`:'';lastTier=r.displayTier;return `${heading}<article class="twcr-card ${r.symbol===symbol?'selected':''}" role="listitem" data-stock="${r.symbol}"><button type="button" class="twcr-select" data-symbol="${r.symbol}" aria-label="開啟 ${esc(r.symbol+' '+r.name)} 圖表"><span class="twcr-card-name">${esc(r.symbol)} <b>${esc(r.name)}</b></span><span class="twcr-card-price">${num(r.price)}</span><span class="twcr-card-change" style="color:${r.changePct>=0?UP:DOWN}">${change(r.changePct)}</span><span class="twcr-card-turnover">成交額 ${money(r.turnoverTwd)}</span>${r.rankStatus==='WATCH'?'<span class="twcr-card-rank">觀察候選 · 分級待確認</span>':''}</button><button type="button" class="twcr-star ${watchlist.has(r.symbol)?'saved':''}" data-favorite="${r.symbol}" aria-pressed="${watchlist.has(r.symbol)}" aria-label="${watchlist.has(r.symbol)?'移除':'加入'} ${esc(r.name)} 自選">${glyph('star')}</button></article>`;}).join('')||`<div class="twcr-empty">${marketState?.status==='loading'?'官方雷達資料載入中…':'目前沒有符合條件的股票'}</div>`;
 }
 function refreshRange(){state.candleSeries?.applyOptions({autoscaleInfoProvider:provider});}
 function provider(original){const info=original();return state.chartPriceViewport?{...info,priceRange:state.chartPriceViewport,margins:{above:0,below:0}}:info;}
 function getRange(){const h=el.clientHeight-state.chart.timeScale().height(),maxValue=state.candleSeries.coordinateToPrice(0),minValue=state.candleSeries.coordinateToPrice(h-1);return Number.isFinite(maxValue)&&maxValue>minValue?{minValue,maxValue}:null;}
 function setRange(range){const margins=state.chart.priceScale('right').options().scaleMargins,h=el.clientHeight-state.chart.timeScale().height(),span=range.maxValue-range.minValue;state.chartPriceViewport={minValue:range.minValue+span*h*margins.bottom/(h-1),maxValue:range.maxValue-span*h*margins.top/(h-1)};refreshRange();}
 function ensureChart(){
  if(state.chart)return true;
  const lib=window.LightweightCharts;if(!lib){$('.twcr-status').textContent='圖表元件載入中，請稍後重試';return false;}
  state.chart=lib.createChart(el,{autoSize:true,layout:{background:{color:'#11161a'},textColor:'#adb4b8',fontSize:11},grid:{vertLines:{color:'#ffffff06'},horzLines:{color:'#ffffff08'}},rightPriceScale:{visible:true,autoScale:true,scaleMargins:{top:.15,bottom:.2}},leftPriceScale:{visible:false},timeScale:{timeVisible:false,rightOffset:5,borderColor:'#ffffff1a'},handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:false,vertTouchDrag:false},handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:false},localization:{locale:'zh-TW'},crosshair:{mode:0}});
  state.candleSeries=state.chart.addCandlestickSeries({upColor:UP,downColor:DOWN,borderUpColor:UP,borderDownColor:DOWN,wickUpColor:UP,wickDownColor:DOWN,autoscaleInfoProvider:provider});
  state.volumeSeries=state.chart.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:'volume',lastValueVisible:false,priceLineVisible:false});state.chart.priceScale('volume').applyOptions({scaleMargins:{top:.85,bottom:0},visible:false});
  gestures=window.OXChartGestures?.({container:el,state,formatPrice:num,getRange,setRange,refreshRange,isDrawing:()=>el.querySelector('.chart-drawing-layer.is-editing')});
  drawings=window.OXChartDrawings?.({box,chartEl:el,state,market:'tw',isExpanded:()=>focus});return true;
 }
 function levels(){for(const line of levelLines)state.candleSeries?.removePriceLine(line);levelLines=[];if(!$('[data-levels]').checked||!state.candleData.length)return;const prior=state.candleData.slice(-61,-1);if(!prior.length)return;for(const [title,price,color]of [['前高',Math.max(...prior.map(c=>c.high)),'#f7bd52'],['前低',Math.min(...prior.map(c=>c.low)),'#5ca5ff']])levelLines.push(state.candleSeries.createPriceLine({title,price,color,lineStyle:2,lineWidth:1,axisLabelVisible:true}));}
 async function openSymbol(next){
  if(!/^\d{4}$/.test(next)||life.signal.aborted)return;
  symbol=next;state.symbol=next;state.period=frame;state.chartPriceViewport=null;const run=++serial;controller?.abort();controller=new AbortController();
  const row=universe().find(r=>r.symbol===symbol);$('[data-quote-name]').textContent=`${symbol} ${row?.name||''}`;$('[data-quote-price]').textContent=num(row?.price);$('[data-quote-change]').textContent=change(row?.changePct);$('[data-quote-change]').style.color=row?.changePct>=0?UP:DOWN;
  $('.twcr-status').textContent='官方 K 線載入中';renderList();if(!ensureChart())return;
  state.candleData=[];state.candleSeries.setData([]);state.volumeSeries.setData([]);levels();
  try{if(!bundleEntry(next,'1D',snapshot()?.date))await preloadBundle().catch(()=>{});if(run!==serial||life.signal.aborted)return;const data=await fetchSeries(next,frame,controller.signal,snapshot()?.date,{minimum:1});if(run!==serial||life.signal.aborted)return;
   state.candleData=data.candles;state.candleSeries.setData(data.candles);state.volumeSeries.setData(data.candles.map(c=>({time:c.time,value:c.volume,color:c.close>=c.open?'#f16a7035':'#48b78e35'})));state.chart.timeScale().fitContent();refreshRange();levels();drawings?.sync();
   $('.twcr-status').textContent=`TWSE／TPEx · ${FRAME_LABELS[frame]} K · 截至 ${data.candles.at(-1)?.lastDate||data.candles.at(-1)?.date} · 拖曳／雙指縮放`;
  }catch(error){if(run===serial&&!life.signal.aborted&&error.name!=='AbortError')$('.twcr-status').textContent='官方 K 線暫時無法取得，請稍後重試';}
 }
 function setFocus(value){focus=value;document.body.classList.toggle('tw-chart-focus',value);root.classList.toggle('is-focused',value);$('[data-action="exit"]').hidden=!value;$('[data-action="focus"]').hidden=value;drawings?.sync();requestAnimationFrame(()=>{if(!life.signal.aborted)state.chart?.resize(el.clientWidth,el.clientHeight);});}
 const all=$('[data-twcr-tab="all"]');const menu=value=>{$('.twcr-tier-menu').hidden=!value;all.setAttribute('aria-expanded',String(value));};
 listen(all,'pointerdown',()=>{held=false;clearTimeout(holdTimer);holdTimer=setTimeout(()=>{held=true;menu(true);},2000);});
 for(const event of ['pointerup','pointercancel','pointerleave'])listen(all,event,()=>clearTimeout(holdTimer));
 listen(all,'dblclick',()=>menu(true));listen(all,'contextmenu',event=>event.preventDefault());
 listen(host,'click',event=>{
  const b=event.target.closest('button');if(!b||b.closest('.chart-drawing-tools'))return;
  if(b.dataset.twcrFrame){frame=b.dataset.twcrFrame;host.querySelectorAll('[data-twcr-frame]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));if(symbol)openSymbol(symbol);return;}
  if(b.dataset.twcrTier){tier=b.dataset.twcrTier;tab='all';menu(false);renderList();return;}
  if(b.dataset.twcrTab){if(b.dataset.twcrTab==='all'){if(held){held=false;return;}if(tab==='all'){const options=['all','T1','T2','T3'];tier=options[(options.indexOf(tier)+1)%options.length];}tab='all';}else tab=b.dataset.twcrTab;menu(false);renderList();return;}
  if(b.dataset.symbol){openSymbol(b.dataset.symbol);return;}
  if(b.dataset.favorite){const value=b.dataset.favorite;watchlist.has(value)?watchlist.delete(value):watchlist.add(value);try{localStorage.setItem('ox-tw-radar-watchlist-v1',JSON.stringify([...watchlist]));}catch{}renderList();return;}
  switch(b.dataset.action){case 'side':side=side==='long'?'short':'long';renderList();break;case 'fold':folded=!folded;root.classList.toggle('is-folded',folded);b.setAttribute('aria-pressed',String(folded));b.setAttribute('aria-label',folded?'展開候選列表':'收合候選列表');break;case 'focus':setFocus(true);break;case 'exit':setFocus(false);break;case 'reset':state.chartPriceViewport=null;refreshRange();state.chart?.timeScale().fitContent();break;}
 });
 listen($('[data-levels]'),'change',levels);
 listen($('.twcr-search input'),'input',event=>{query=event.target.value;renderList();});
 listen($('.twcr-search input'),'change',event=>{const value=event.target.value.trim(),row=universe().find(r=>r.symbol===value||r.name===value);if(row)openSymbol(row.symbol);});
 listen($('.twcr-search input'),'keydown',event=>{if(event.key==='Enter'){const row=universe().find(r=>`${r.symbol} ${r.name}`.includes(event.target.value.trim()));if(row)openSymbol(row.symbol);}});
 listen(document,'keydown',event=>{if(event.key==='Escape'){menu(false);if(focus)setFocus(false);}});
 const unsubscribe=subscribeBundle(()=>{renderList();if(!symbol){const first=rankChartRows(universe(),{side})[0]||universe()[0];if(first)openSymbol(first.symbol);}});
 renderList();const initial=rankChartRows(universe(),{side})[0]||universe()[0];if(initial)openSymbol(initial.symbol);else preloadBundle().catch(()=>{});
 return {openSymbol,update(next){marketState=next;renderList();if(!symbol){const first=rankChartRows(universe(),{side})[0]||universe()[0];if(first)openSymbol(first.symbol);}},destroy(){life.abort();serial++;controller?.abort();clearTimeout(holdTimer);unsubscribe();document.body.classList.remove('tw-chart-focus');gestures?.destroy();drawings?.destroy();state.chart?.remove();host.textContent='';}};
}
