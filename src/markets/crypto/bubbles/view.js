import { METRICS, bubbleRows, metricText, largeTradeFlow, canonical } from './model.js?v=20261001-bubbles1';
import { fetchCaps, fetchQuotes, fetchLargeTrades, pause } from './source.js?v=20261001-bubbles1';
import { BubbleField } from './field.js?v=20261001-bubbles1';
import { createToolsRail } from '../../../components/strength/tools-rail.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const css=new URL('./bubbles.css?v=20261001-bubbles1',import.meta.url);
const icon=(name)=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${{expand:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',close:'m6 6 12 12M18 6 6 18',reset:'M3 4v6h6M4 10a8 8 0 1 1 1 8',pause:'M8 5v14M16 5v14',play:'m8 5 11 7-11 7Z',search:'M15 15l5 5M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0',help:'M12 11v6m0-10v1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'}[name]||''}"/></svg>`;
const runtime=()=>typeof state!=='undefined'&&state.activeMarket==='crypto'?state:null;
export function mountCryptoBubbles(host,{quotes=null,caps:initialCaps=null,analyses=null,onOpenRadar=symbol=>window.switchSymbol?.(symbol)}={}) {
  const shadow=host.shadowRoot||host.attachShadow({mode:'open'}),life=new AbortController();
  let metric='change',limit=50,scope='all',query='',caps=initialCaps||[],localQuotes=quotes||[],rows=[],focused=false,paused=false,selected=null,capError='',quoteError='',flowDone=0,flowTotal=0,flowRequest=null,quoteRequest=false,capPending=false,capAttempt=0;
  const flows=new Map();
  shadow.innerHTML=`<link rel="stylesheet" href="${css}"><section class="oxb cfx"><div class="oxb-top"><div class="oxb-scope" role="group" aria-label="幣種範圍"><button data-scope="all" aria-pressed="true">全部</button><button data-scope="watch" aria-pressed="false">自選</button></div><div class="oxb-utility"><button data-action="help" aria-label="泡泡圖資料說明">${icon('help')}</button><button data-action="pause" aria-label="暫停泡泡動畫" aria-pressed="false">${icon('pause')}</button><button data-action="focus" aria-label="展開泡泡圖">${icon('expand')}</button></div></div><div class="oxb-metrics"></div><div class="oxb-filter"><label>${icon('search')}<input type="search" aria-label="搜尋泡泡幣種" placeholder="搜尋幣種"></label><select aria-label="泡泡數量"><option value="30">前 30</option><option value="50" selected>前 50</option><option value="100">前 100</option></select><button data-action="reset" aria-label="重設泡泡視野">${icon('reset')}</button></div><div class="oxb-stage"><canvas tabindex="0" aria-label="動態加密泡泡圖"></canvas><div class="oxb-empty" role="status">正在讀取即時行情…</div><div class="oxb-zoom"><button data-action="out" aria-label="縮小泡泡圖">−</button><button data-action="in" aria-label="放大泡泡圖">＋</button></div></div><footer class="oxb-footer"><span data-slot="method"></span><span data-slot="status" role="status"></span></footer><details class="oxb-list"><summary>幣種列表</summary><div></div></details><dialog class="oxb-dialog" aria-label="泡泡幣種詳情"><header><strong data-slot="asset"></strong><button data-action="close-asset" aria-label="關閉幣種詳情">${icon('close')}</button></header><div data-slot="detail"></div><button class="oxb-radar" data-action="radar">查看雷達 K 線 ↗</button></dialog><dialog class="oxb-help oxb-dialog" aria-label="泡泡圖資料說明"><header><strong>資料與閱讀方式</strong><button data-action="close-help" aria-label="關閉泡泡圖說明">${icon('close')}</button></header><p>泡泡大小依所選數據作壓縮比較，顏色為 24 小時漲跌；大資金模式則依大單淨主買的正負著色。藍為正、紅為負。</p><p>漲幅：Bitget USDT 永續 24H 漲跌。成交量：同交易所 24H 成交額（USDT）。市值：CoinGecko 流通市值（USD），每 5 分鐘更新；缺少可確認幣種對應或新鮮市值的幣不列入。</p><p>大資金灌入：以所選數量的成交額前列合約取樣，再依大單淨額大小排序。Bitget 各合約最新 100 筆成交中，最近 5 分鐘、單筆至少 10,000 USDT 的主動買額減主動賣額。這是已取得成交的取樣，不是完整 5 分鐘統計，也不代表交易所入金或鏈上資金淨流入。每 30 秒重新取樣。</p><p>OX 評分：沿用雷達的 OX 經典評分，尚未分析的幣不填假分數。泡泡每次重新排序仍保留位置，數據變化會平順調整大小。</p><p>拖動泡泡可推擠其他泡泡；雙指或滑鼠滾輪縮放，放大後拖空白處移動視野。離開頁面會停止動畫與資料請求；切到背景時暫停動畫和定時更新。</p></dialog></section>`;
  const q=s=>shadow.querySelector(s);
  const metricRail=createToolsRail({tabs:METRICS,selected:metric,label:'泡泡大小指標',attribute:'data-bubble-metric',onSelect(id){metric=id;selected=null;flowRequest?.abort();flowRequest=null;paint();if(id==='cap')loadCaps();if(id==='flow')loadFlows();}});
  q('.oxb-metrics').append(metricRail.element);
  const field=new BubbleField(q('canvas'),{onSelect:openAsset,logo:base=>{const paths=typeof OX_COIN_LOGOS!=='undefined'?OX_COIN_LOGOS:{};return paths[base.toLowerCase()]?new URL(paths[base.toLowerCase()],document.baseURI).href:null;}});
  function pool(){const rt=runtime();const live=rt?.tickers||[];const liveTime=Math.max(0,...live.map(t=>Number(t.ts)||0)),localTime=Math.max(0,...localQuotes.map(t=>Number(t.ts)||0));return localTime>liveTime?localQuotes:live.length?live:localQuotes;}
  function watching(){try{return new Set((typeof getWatchlistRecords==='function'?getWatchlistRecords():[]).map(r=>r.symbol));}catch{return new Set();}}
  function paint(){if(life.signal.aborted)return;const tickers=pool(),rt=runtime();rows=bubbleRows(tickers,{metric,limit,caps,flows,query,watch:scope==='watch'?watching():null,analyses:analyses||rt?.analyzedCache||new Map()});field.setRows(rows,metric);
    q('.oxb-empty').hidden=rows.length>0;
    q('.oxb-empty').textContent=scope==='watch'&&!watching().size?'先在雷達收藏幣種，這裡會顯示你的自選':query&&!rows.length?'沒有符合的幣種':metric==='cap'?capError||(caps.length?'目前沒有可確認的新鮮市值資料':'正在讀取市值…'):metric==='flow'?flowRequest?'正在讀取大單成交…':'目前沒有可驗證的大單取樣，稍後自動重試':metric==='score'?'雷達正在分析 OX 評分…':quoteError||'正在讀取即時行情…';
    const method={change:'24H 漲幅 · 藍漲／紅跌',volume:'24H 成交額 · USDT',cap:'流通市值 · USD',flow:'≥1萬 USDT 大單 · 最新100筆取樣',score:'OX 經典評分'};
    q('[data-slot="method"]').textContent=method[metric];
    const newest=metric==='score'?0:Math.max(0,...rows.map(r=>metric==='cap'?Date.parse(r.capTime)||0:metric==='flow'?r.flow?.at||0:r.stamp)),stamp=newest?new Date(newest).toLocaleTimeString('zh-TW',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'}):'';
    q('[data-slot="status"]').textContent=`${rows.length} 幣${metric==='flow'&&flowRequest?` · ${flowDone}/${flowTotal}`:stamp?' · '+(metric==='cap'?'市值 ':metric==='flow'?'取樣 ':'')+stamp:''}`;
    if(q('.oxb-list').open)renderList();if(selected)updateDetail();
  }
  function renderList(){q('.oxb-list>div').innerHTML=rows.map(r=>`<button data-asset="${escape(r.symbol)}"><span>${escape(r.base)}</span><b>${metricText(r.value,metric)}</b></button>`).join('');}
  function openAsset(r){selected=r.symbol;field.selected=r.symbol;updateDetail();q('.oxb-dialog:not(.oxb-help)').showModal();}
  function updateDetail(){const r=rows.find(r=>r.symbol===selected);if(!r)return;q('[data-slot="asset"]').textContent=r.base;
    q('[data-slot="detail"]').innerHTML=`<strong class="oxb-price">${r.price.toLocaleString('en-US',{maximumFractionDigits:r.price<1?8:4})}<small> USDT</small></strong><dl><div><dt>24H 漲幅</dt><dd class="${r.change>=0?'up':'down'}">${metricText(r.change,'change')}</dd></div><div><dt>24H 成交額</dt><dd>${metricText(r.volume,'volume')} USDT</dd></div><div><dt>流通市值</dt><dd>${metricText(r.cap,'cap')}</dd></div><div><dt>OX 評分</dt><dd>${metricText(r.score,'score')}</dd></div>${r.flow?`<div><dt>大單淨主買</dt><dd>${metricText(r.flow.value,'flow')} USDT</dd></div><div><dt>取樣大單</dt><dd>${r.flow.count} 筆／${r.flow.trades} 筆成交</dd></div>`:''}</dl>${r.capTime?`<small class="oxb-note">市值更新 ${new Date(r.capTime).toLocaleString('zh-TW',{hour12:false})}</small>`:''}${r.flow?'<small class="oxb-note">僅最新成交取樣，非完整 5 分鐘或入金統計</small>':''}`;
  }
  async function loadQuotes(){if(quoteRequest||life.signal.aborted||document.hidden||quotes)return;const latest=Math.max(0,...pool().map(t=>Number(t.ts)||0));if(Date.now()-latest<25000)return;quoteRequest=true;try{localQuotes=await fetchQuotes(life.signal);quoteError='';paint();if(metric==='flow')loadFlows();}catch(e){if(e.name!=='AbortError'){quoteError='行情暫時無法更新，稍後自動重試';paint();}}finally{quoteRequest=false;}}
  async function loadCaps(){if(capPending||life.signal.aborted||document.hidden||initialCaps)return;if(Date.now()-capAttempt<60000&&capError)return;capPending=true;capAttempt=Date.now();try{caps=await fetchCaps(life.signal);capError='';paint();}catch(e){if(e.name!=='AbortError'){capError='市值來源暫時無法更新，稍後自動重試';paint();}}finally{capPending=false;}}
  async function loadFlows(){if(metric!=='flow'||flowRequest||life.signal.aborted||document.hidden)return;
    const candidates=bubbleRows(pool(),{metric:'volume',limit,query,watch:scope==='watch'?watching():null});
    const pending=candidates.filter(r=>Date.now()-(flows.get(r.symbol)?.at||0)>30000);if(!pending.length)return;
    const request=new AbortController();flowRequest=request;const abort=()=>request.abort();life.signal.addEventListener('abort',abort,{once:true});flowDone=0;flowTotal=pending.length;paint();
    let next=0;
    async function worker(){while(next<pending.length&&!request.signal.aborted){const r=pending[next++];try{const result=await fetchLargeTrades(r.symbol,request.signal),flow=largeTradeFlow(result.records,result.time);if(flow&&!request.signal.aborted)flows.set(r.symbol,{...flow,at:Date.now()});}catch(e){if(e.name==='AbortError')break;}if(request.signal.aborted)break;flowDone++;paint();await pause(300,request.signal);}}
    try{await Promise.all(Array.from({length:Math.min(4,pending.length)},worker));}
    catch(e){if(e.name!=='AbortError')console.warn('[OX Bubbles]',e.message);}
    finally{life.signal.removeEventListener('abort',abort);if(flowRequest===request){flowRequest=null;paint();}}
  }
  function setFocus(value){focused=value;q('.oxb').classList.toggle('focused',focused);q('[data-action="focus"]').innerHTML=icon(focused?'close':'expand');q('[data-action="focus"]').setAttribute('aria-label',focused?'退出泡泡圖全螢幕':'展開泡泡圖');requestAnimationFrame(()=>field.resize());}
  function closeInner(){for(const d of [q('.oxb-help'),q('.oxb-dialog:not(.oxb-help)')])if(d.open){d.close();selected=null;return true;}if(focused){setFocus(false);return true;}return false;}
  shadow.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
    if(d.scope){scope=d.scope;shadow.querySelectorAll('[data-scope]').forEach(el=>el.setAttribute('aria-pressed',el===b));flowRequest?.abort();flowRequest=null;paint();loadFlows();return;}
    if(d.asset){const r=rows.find(r=>r.symbol===d.asset);if(r)openAsset(r);return;}
    switch(d.action){case'help':q('.oxb-help').showModal();break;case'close-help':q('.oxb-help').close();break;case'close-asset':selected=null;q('.oxb-dialog:not(.oxb-help)').close();break;case'focus':setFocus(!focused);break;
      case'pause':paused=!paused;field.paused=paused;field.run();b.innerHTML=icon(paused?'play':'pause');b.setAttribute('aria-label',paused?'播放泡泡動畫':'暫停泡泡動畫');b.setAttribute('aria-pressed',paused);break;
      case'reset':field.reset();loadQuotes();if(metric==='cap'){capAttempt=0;loadCaps();}loadFlows();break;case'in':field.setZoom(field.zoom*1.2);break;case'out':field.setZoom(field.zoom/1.2);break;
      case'radar':{const symbol=selected;closeInner();if(focused)setFocus(false);onOpenRadar(symbol);break;}
    }
  },{signal:life.signal});
  q('input').addEventListener('input',e=>{query=e.target.value.trim();flowRequest?.abort();flowRequest=null;paint();if(metric==='flow'){clearTimeout(searchTimer);searchTimer=setTimeout(loadFlows,300);}},{signal:life.signal});let searchTimer=0;
  q('select').addEventListener('change',e=>{limit=Number(e.target.value);flowRequest?.abort();flowRequest=null;paint();loadFlows();},{signal:life.signal});
  q('.oxb-list').addEventListener('toggle',()=>{if(q('.oxb-list').open)renderList();},{signal:life.signal});
  shadow.addEventListener('keydown',e=>{if(e.key==='Escape'&&closeInner()){e.preventDefault();e.stopPropagation();}if(e.target.matches('canvas')&&['+','-','0'].includes(e.key)){e.preventDefault();if(e.key==='0')field.reset();else field.setZoom(field.zoom*(e.key==='+'?1.2:1/1.2));}},{signal:life.signal});
  q('.oxb-dialog:not(.oxb-help)').addEventListener('close',()=>{selected=null;},{signal:life.signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)flowRequest?.abort();else{paint();loadQuotes();loadFlows();}},{signal:life.signal});
  const paintTimer=setInterval(()=>{if(!document.hidden)paint();},2000),quoteTimer=setInterval(loadQuotes,15000),flowTimer=setInterval(loadFlows,30000),capsTimer=setInterval(loadCaps,300000);
  paint();loadQuotes();loadCaps();
  return {closeInner,destroy(){life.abort();flowRequest?.abort();clearInterval(paintTimer);clearInterval(quoteTimer);clearInterval(flowTimer);clearInterval(capsTimer);clearTimeout(searchTimer);field.destroy();metricRail.destroy();for(const d of shadow.querySelectorAll('dialog'))d.close();shadow.innerHTML='';}};
}
