import { PATTERNS, patternById, TIMEFRAMES } from './catalog.js';
import { queryFromStrokes, normalize, sortMatches, matchCandles } from './matcher.js';
import { fetchUniverse, scanUniverse } from './source.js';
import { candleChart } from './charts.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={down:'<path d="m6 9 6 6 6-6"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',undo:'<path d="m9 5-5 5 5 5M4 10h10a5 5 0 1 1 0 10"/>',refresh:'<path d="M4 4v6h6M4 10a8 8 0 1 1 1 8"/>',expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||''}</svg>`;
const volume=n=>!Number.isFinite(n)?'—':n>=1e8?(n/1e8).toFixed(2)+'億':n>=1e4?(n/1e4).toFixed(1)+'萬':n.toFixed(0);
const signed=n=>Number.isFinite(n)?`${n>=0?'+':''}${n.toFixed(2)}%`:'—';
const stamp=ms=>new Date(ms).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false});
let saved={frames:['4H','1H'],limit:80,query:null,strokes:[]};
export function mountPatternSearch(host){
  const shadow=host.shadowRoot||host.attachShadow({mode:'open'}),life=new AbortController();
  let frames=[...saved.frames],limit=saved.limit,query=saved.query,strokes=structuredClone(saved.strokes),universe=null,controller=null,version=0,busy=false,lastScan=0,resumePending=false;
  let rows=new Map(),datasets=new Map(),shown=24,progress={done:0,total:0,failed:0},paintTimer=0,drawTimer=0,boardRAF=0,lastSignature='',selectedRow=null,detailChart=null;
  let chartInstances=[],chartObserver=null,worker=null,workerId=0,jobs=new Map();
  shadow.innerHTML=`<link rel="stylesheet" href="${new URL('./patterns.css',import.meta.url)}"><main class="px"><section class="px-board" aria-label="型態畫板"><canvas tabindex="0" aria-label="由左向右畫走勢，完成後自動比對；亦可使用型態選單"></canvas><div class="px-controls"><button class="px-control" data-action="timeframes" aria-haspopup="dialog" aria-expanded="false"><span data-frame-label></span>${icon('down')}</button><button class="px-control" data-action="patterns" aria-haspopup="dialog" aria-expanded="false"><span data-pattern-label>型態</span>${icon('down')}</button></div><span class="px-hint">畫出走勢，或選擇型態</span><div class="px-board-bottom"><span class="px-caption"></span><button class="px-icon" data-action="undo" aria-label="清除上一筆" title="清除上一筆">${icon('undo')}</button></div></section><div class="px-meta"><span class="px-status" role="status" aria-live="polite">Bitget · USDT 永續</span><button data-action="refresh" aria-label="重新掃描">重新掃描</button></div><div class="px-load-track" hidden><i></i></div><section class="px-grid" aria-label="依相似度排列的幣種"><div class="px-empty">等待畫入型態</div></section><button class="px-more" data-action="more" hidden>顯示更多</button><dialog class="px-dialog px-presets" aria-label="選擇型態"><div class="px-dialog-head"><span>型態</span><button class="px-icon" data-action="close" aria-label="關閉型態選單">${icon('close')}</button></div><div class="px-dialog-body"><input class="px-search" aria-label="搜尋型態" placeholder="搜尋型態"><div class="px-options"></div></div></dialog><dialog class="px-dialog px-settings" aria-label="時間級別"><div class="px-dialog-head"><span>時間級別</span><button class="px-icon" data-action="close" aria-label="關閉時間級別">${icon('close')}</button></div><div class="px-dialog-body"><div class="px-frames">${Object.keys(TIMEFRAMES).map(f=>`<button class="px-frame-option" data-frame="${f}">${f}</button>`).join('')}</div><label class="px-setting"><span>成交額觀察池</span><select data-limit aria-label="掃描幣種數"><option value="80">前 80 幣</option><option value="160">前 160 幣</option><option value="0">全部合資格幣</option></select></label><details class="px-help"><summary>比對與資料</summary><p>只掃描 Bitget 加密 USDT 永續，24H 成交額至少 300 萬 USDT。依成交額選池；結果依相似度、OX 分數排序。選擇多個級別會分別比對。</p><p>使用最近 200 根中的已收盤、連續 K 線。型態需在最近 8 根內結束；比例與轉折條件不符就不列入。白線標示實際比對區段。相似度是幾何比對分數，不是勝率。</p><p>OX 使用原本經典評分公式，以 1H 已收盤 K 線計算。成交額與漲跌為 24H；不同級別共用同一筆 OX 評分。</p><p>頁面開啟時每 5 分鐘重掃；切走或切到背景便停止。資料缺漏會跳過並顯示缺漏數，不補造 K 線。諧波固定比例容差為相對 ±5%，區間比例採硬性範圍；結果都是待觀察的型態候選。</p></details></div></dialog><dialog class="px-dialog px-detail" aria-label="型態 K 線詳情"><div class="px-dialog-head"><span class="px-detail-title"></span><div class="px-detail-tools"><button class="px-icon" data-action="reset-chart" aria-label="重設圖表範圍">${icon('refresh')}</button><button class="px-icon" data-action="close" aria-label="關閉圖表">${icon('close')}</button></div></div><canvas aria-label="可拖曳及雙指縮放的 K 線圖"></canvas><div class="px-detail-footer"></div></dialog></main>`;
  const q=s=>shadow.querySelector(s),qa=s=>[...shadow.querySelectorAll(s)],board=q('.px-board canvas');
  function preferences(){saved={frames:[...frames],limit,query,strokes:structuredClone(strokes)};}
  function labels(){q('[data-frame-label]').textContent=frames.join(' + ');q('[data-pattern-label]').textContent=patternById(query?.id)?.name||'型態';q('.px-caption').textContent=query?.id?'':query?'自繪路徑':'';q('.px-hint').hidden=strokes.length>0||!!query;q('[data-action="undo"]').disabled=!strokes.length&&!query;qa('[data-frame]').forEach(b=>{b.setAttribute('aria-pressed',frames.includes(b.dataset.frame));});q('[data-limit]').value=String(limit);}
  function drawBoard(){
    boardRAF=0;const w=board.clientWidth,h=board.clientHeight,dpr=Math.min(devicePixelRatio||1,2);if(!w||!h)return;board.width=w*dpr;board.height=h*dpr;const c=board.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
    c.fillStyle='#e0e7ef13';for(let x=22;x<w-10;x+=24)for(let y=62;y<h-32;y+=24)c.fillRect(x,y,1,1);
    const paths=strokes.length?strokes:(query?.id?[normalize(patternById(query.id).points)]:query?.points?[normalize(query.points)]:[]);
    c.lineWidth=2;c.lineJoin=c.lineCap='round';c.strokeStyle='#eeece2';paths.forEach(path=>{c.beginPath();path.forEach((p,i)=>{const x=18+p.x*(w-36),y=60+(1-p.y)*(h-105);if(i)c.lineTo(x,y);else c.moveTo(x,y);});c.stroke();});
    if(paths[0]?.length){const p=paths.at(-1).at(-1);c.fillStyle='#f3efde';c.beginPath();c.arc(18+p.x*(w-36),60+(1-p.y)*(h-105),3,0,Math.PI*2);c.fill();}
  }
  const scheduleBoard=()=>{if(!boardRAF)boardRAF=requestAnimationFrame(drawBoard);};const resize=new ResizeObserver(scheduleBoard);resize.observe(board);
  function resetWorker(){worker?.terminate();worker=null;for(const j of jobs.values())j.reject(new DOMException('Aborted','AbortError'));jobs.clear();}
  function compare(candles,target){
    if(!worker){try{worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{const job=jobs.get(data.id);jobs.delete(data.id);if(job)data.error?job.reject(Error(data.error)):job.resolve(data.match);};worker.onerror=()=>{for(const j of jobs.values())j.reject(Error('型態計算失敗'));jobs.clear();worker?.terminate();worker=null;};}catch{}}
    if(!worker)return new Promise(resolve=>setTimeout(()=>resolve(matchCandles(candles,target)),0));
    return new Promise((resolve,reject)=>{const id=++workerId;jobs.set(id,{resolve,reject});worker.postMessage({id,candles,query:target});});
  }
  function clearCharts(){chartObserver?.disconnect();chartObserver=null;chartInstances.forEach(c=>c.destroy());chartInstances=[];}
  function renderResults(force=false){
    const sorted=sortMatches([...rows.values()]),visible=sorted.slice(0,shown),signature=visible.map(r=>`${r.symbol}:${r.frame}:${r.similarity}:${r.oxScore}:${r.serverTime}`).join('|');
    q('.px-more').hidden=sorted.length<=shown;
    if(!force&&signature===lastSignature)return;lastSignature=signature;clearCharts();
    if(!visible.length){q('.px-grid').innerHTML=`<div class="px-empty">${!query?'等待畫入型態':busy?'正在比對真實 K 線…':progress.failed===progress.total&&progress.total?'行情未取得，請重新掃描':'目前沒有符合的型態，可切換級別或重畫'}</div>`;return;}
    q('.px-grid').innerHTML=visible.map(r=>`<button class="px-card" data-result="${esc(r.symbol+':'+r.frame)}" aria-label="${esc(r.symbol)} ${r.frame} 相似度 ${r.similarity.toFixed(1)}，開啟 K 線"><div class="px-card-top"><span class="px-symbol">${esc(r.symbol.replace(/USDT$/,''))}<span class="px-frame">${r.frame}</span></span><span class="px-change ${r.change>=0?'px-up':'px-down'}">${signed(r.change)}</span></div><div class="px-match"><span>${esc(r.match.label.replace(/・.*$/,''))}</span><span>相似 ${r.similarity.toFixed(1)}</span></div><canvas aria-label="${esc(r.symbol)} 實際型態 K 線"></canvas><div class="px-energy"><span>OX</span><strong>${r.oxScore??'—'}</strong><span class="px-track" role="meter" aria-label="OX 強度" aria-valuemin="0" aria-valuemax="100" ${r.oxScore===null?'':`aria-valuenow="${Math.min(100,r.oxScore)}"`}><i style="width:${Math.max(0,Math.min(100,r.oxScore??0))}%"></i></span></div><div class="px-turnover"><span>24H 成交額</span><b>${volume(r.turnover)} U</b></div></button>`).join('');
    chartObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){const row=rows.get(e.target.dataset.result);if(row)chartInstances.push(candleChart(e.target.querySelector('canvas'),row));chartObserver.unobserve(e.target);}},{rootMargin:'150px'});qa('.px-card').forEach(c=>chartObserver.observe(c));
  }
  function queueRender(){if(!paintTimer)paintTimer=setTimeout(()=>{paintTimer=0;renderResults();},600);}
  function status(text){q('.px-status').textContent=text;}
  function stop(){version++;controller?.abort();controller=null;resetWorker();busy=false;clearTimeout(paintTimer);paintTimer=0;q('.px-load-track').hidden=true;}
  async function scan(){
    stop();if(!query){rows.clear();renderResults(true);return;}if(document.hidden)return;
    resumePending=false;const run=version,target=structuredClone(query);controller=new AbortController();const signal=controller.signal;busy=true;rows.clear();datasets.clear();progress={done:0,total:0,failed:0};shown=24;renderResults(true);status('正在連接 Bitget…');q('.px-load-track').hidden=false;q('.px-load-track i').style.width='0%';
    try{
      if(!universe||Date.now()-universe.serverTime>60000)universe=await fetchUniverse(signal,limit);
      const pool=universe;
      await scanUniverse(pool,frames,{signal,onSeries:async data=>{
        if(run!==version)return;datasets.set(data.symbol+':'+data.frame,data);
        const match=await compare(data.candles,target);if(run!==version||!match)return;
        rows.set(data.symbol+':'+data.frame,{...data,match,similarity:match.similarity});queueRender();
      },onProgress:p=>{if(run!==version)return;progress=p;q('.px-load-track i').style.width=`${p.done/p.total*100}%`;status(`Bitget · ${p.done}/${p.total} 組 · ${rows.size} 符合${p.failed?' · '+p.failed+' 缺漏':''}`);}});
      if(run!==version)return;lastScan=Date.now();status(`Bitget · ${pool.tickers.length} 幣 · ${rows.size} 符合${progress.failed?' · '+progress.failed+' 缺漏':''} · ${stamp(pool.serverTime)}`);
    }catch(e){if(run===version&&e.name!=='AbortError')status(`${e.message||'行情取得失敗'} · 點重新掃描`);}
    finally{if(run===version){busy=false;controller=null;q('.px-load-track').hidden=true;renderResults(true);}}
  }
  function openDialog(selector,button){const d=q(selector);qa('.px-control').forEach(b=>b.setAttribute('aria-expanded',b===button));d.showModal();}
  function closeDialogs(){qa('dialog[open]').forEach(d=>d.close());qa('.px-control').forEach(b=>b.setAttribute('aria-expanded','false'));detailChart?.destroy();detailChart=null;selectedRow=null;}
  function presetOptions(search=''){
    let group='';q('.px-options').innerHTML=PATTERNS.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())).map(p=>{const heading=p.group!==group?`<div class="px-group">${p.group}</div>`:'';group=p.group;return `${heading}<button class="px-option" data-preset="${p.id}" aria-pressed="${query?.id===p.id}"><svg viewBox="0 0 50 28" fill="none" stroke="currentColor" stroke-width="1.3"><polyline points="${normalize(p.points).map(v=>`${2+v.x*46},${25-v.y*22}`).join(' ')}"/></svg><span>${p.name}</span></button>`;}).join('')||'<div class="px-empty">沒有此型態</div>';
  }
  function openResult(key){
    const r=rows.get(key);if(!r)return;selectedRow=r;q('.px-detail-title').textContent=`${r.symbol.replace(/USDT$/,'')} · ${r.frame} · ${r.similarity.toFixed(1)}`;
    q('.px-detail-footer').innerHTML=`<span>${esc(r.match.label)}</span><span>OX ${r.oxScore??'—'}</span><span>24H ${signed(r.change)}</span><span>成交額 ${volume(r.turnover)} USDT</span><div>Bitget · 已收盤 ${new Date(r.candles.at(-1).time*1000).toLocaleString('zh-TW',{hour12:false})} · 拖曳／雙指縮放</div>${r.match.ratios?`<div class="px-detail-ratios">${Object.entries(r.match.ratios).map(([k,v])=>`${({ab:'AB/XA',bc:'BC/AB',cd:'CD/BC',ad:'AD/XA',equal:'CD/AB'})[k]} ${v.toFixed(3)}`).join(' · ')}</div>`:''}`;
    q('.px-detail').showModal();detailChart?.destroy();detailChart=candleChart(q('.px-detail canvas'),r,{interactive:true});
  }
  shadow.addEventListener('click',e=>{
    const preset=e.target.closest('[data-preset]'),frame=e.target.closest('[data-frame]'),result=e.target.closest('[data-result]'),button=e.target.closest('[data-action]');
    if(preset){clearTimeout(drawTimer);query={id:preset.dataset.preset};strokes=[];labels();scheduleBoard();closeDialogs();preferences();scan();return;}
    if(frame){const f=frame.dataset.frame;if(frames.includes(f)){if(frames.length===1)return;frames=frames.filter(x=>x!==f);}else frames.push(f);frames.sort((a,b)=>TIMEFRAMES[b]-TIMEFRAMES[a]);labels();preferences();clearTimeout(drawTimer);drawTimer=setTimeout(scan,500);return;}
    if(result){openResult(result.dataset.result);return;}
    if(!button)return;
    switch(button.dataset.action){
      case 'patterns':presetOptions();q('.px-search').value='';openDialog('.px-presets',button);break;
      case 'timeframes':labels();openDialog('.px-settings',button);break;
      case 'close':closeDialogs();break;
      case 'undo':clearTimeout(drawTimer);strokes.pop();query=strokes.length?queryFromStrokes(strokes):null;stop();rows.clear();labels();scheduleBoard();preferences();renderResults(true);status('Bitget · USDT 永續');if(query)scan();break;
      case 'refresh':universe=null;scan();break;
      case 'more':shown+=24;renderResults(true);break;
      case 'reset-chart':detailChart?.reset();break;
    }
  },{signal:life.signal});
  q('.px-search').addEventListener('input',e=>presetOptions(e.target.value),{signal:life.signal});
  q('[data-limit]').addEventListener('change',e=>{limit=Number(e.target.value);universe=null;preferences();scan();},{signal:life.signal});
  qa('dialog').forEach(d=>{d.addEventListener('cancel',e=>{e.preventDefault();closeDialogs();},{signal:life.signal});d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialogs();}},{signal:life.signal});});
  let activePointer=null,currentStroke=null;
  const position=e=>{const r=board.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left-18)/(r.width-36))),y:Math.max(0,Math.min(1,1-(e.clientY-r.top-60)/(r.height-105)))};};
  board.addEventListener('pointerdown',e=>{if(activePointer!==null||e.button>0)return;clearTimeout(drawTimer);stop();rows.clear();if(!strokes.length)query=null;activePointer=e.pointerId;currentStroke=[position(e)];strokes.push(currentStroke);board.setPointerCapture(e.pointerId);labels();scheduleBoard();},{signal:life.signal});
  board.addEventListener('pointermove',e=>{if(e.pointerId!==activePointer)return;const p=position(e),last=currentStroke.at(-1);if(Math.hypot(p.x-last.x,p.y-last.y)>.003){currentStroke.push(p);if(currentStroke.length>1200)currentStroke.splice(1,1);scheduleBoard();}},{signal:life.signal});
  const finish=e=>{if(e.pointerId!==activePointer)return;activePointer=null;if(e.type==='pointercancel')strokes.pop();if(currentStroke?.length<3&&strokes.at(-1)===currentStroke)strokes.pop();currentStroke=null;query=queryFromStrokes(strokes);labels();scheduleBoard();preferences();renderResults(true);status(query?'準備比對…':'請由左向右畫一段走勢');clearTimeout(drawTimer);if(query)drawTimer=setTimeout(scan,750);};
  board.addEventListener('pointerup',finish,{signal:life.signal});board.addEventListener('pointercancel',finish,{signal:life.signal});
  board.addEventListener('keydown',e=>{if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();q('[data-action="undo"]').click();}},{signal:life.signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(busy){resumePending=true;stop();status('已暫停 · 返回後重新掃描');}clearTimeout(drawTimer);}else if(query&&(resumePending||!lastScan||Date.now()-lastScan>300000))scan();},{signal:life.signal});
  const timer=setInterval(()=>{if(query&&!busy&&!document.hidden&&Date.now()-lastScan>=300000&&!qa('dialog[open]').length)scan();},30000);
  labels();scheduleBoard();if(query)scan();
  return {closeInner:closeDialogs,destroy(){preferences();stop();life.abort();resize.disconnect();clearCharts();detailChart?.destroy();closeDialogs();clearInterval(timer);clearTimeout(drawTimer);cancelAnimationFrame(boardRAF);shadow.replaceChildren();}};
}
