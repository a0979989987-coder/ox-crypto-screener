import { PATTERNS, patternById, TIMEFRAMES } from './catalog.js?v=patterns5d-20260929';
import { queryFromStrokes, normalize, sortMatches, patternCounts, prepareCandles, classifyPrepared, matchPrepared } from './matcher.js?v=patterns5d-20260929';
import { fetchUniverse, scanUniverse, primeCandleCache, fetchSeries, radarCandidates } from './source.js?v=patterns5d-20260929';
import { readIndex, saveIndex, pruneIndex, entryCurrent, INDEX_VERSION } from './index-cache.js?v=patterns5d-20260929';
import { candleChart } from './charts.js?v=patterns5d-20260929';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={down:'<path d="m6 9 6 6 6-6"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',undo:'<path d="m9 5-5 5 5 5M4 10h10a5 5 0 1 1 0 10"/>',refresh:'<path d="M4 4v6h6M4 10a8 8 0 1 1 1 8"/>',expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||''}</svg>`;
const volume=n=>!Number.isFinite(n)?'—':n>=1e8?(n/1e8).toFixed(2)+'億':n>=1e4?(n/1e4).toFixed(1)+'萬':n.toFixed(0);
const signed=n=>Number.isFinite(n)?`${n>=0?'+':''}${n.toFixed(2)}%`:'—';
const stamp=ms=>new Date(ms).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false});
let saved={frames:['4H','1H'],limit:0,query:null,strokes:[]};
export function mountPatternSearch(host){
  const shadow=host.shadowRoot||host.attachShadow({mode:'open'}),life=new AbortController();
  let frames=[...saved.frames],limit=saved.limit,query=saved.query,strokes=structuredClone(saved.strokes),universe=null,controller=null,version=0,busy=false,lastScan=0,resumePending=false;
  let rows=new Map(),shown=24,tierFilter='all',progress={done:0,total:0,failed:0},paintTimer=0,drawTimer=0,boardRAF=0,lastSignature='',selectedRow=null,detailChart=null,detailController=null,detailVersion=0,detailFrame=null;
  let chartInstances=[],chartObserver=null,worker=null,workerId=0,jobs=new Map(),fallback=new Map();
  let glowEnded=0,moreObserver=null;const reducedMotion=matchMedia('(prefers-reduced-motion:reduce)').matches;
  let entries=new Map(),queryVersion=0,searchRunning=false,searchPending=false,disposed=false,lastError='';
  const hydrated=new Set();
  shadow.innerHTML=`<link rel="stylesheet" href="${new URL('./patterns.css?v=patterns5e-20260929',import.meta.url)}"><main class="px"><section class="px-board" aria-label="型態畫板"><canvas tabindex="0" aria-label="由左向右畫走勢，完成後自動比對；亦可使用型態選單"></canvas><div class="px-controls"><button class="px-control" data-action="timeframes" aria-haspopup="dialog" aria-expanded="false"><span data-frame-label></span>${icon('down')}</button><button class="px-control" data-action="patterns" aria-haspopup="dialog" aria-expanded="false"><span data-pattern-label>型態</span>${icon('down')}</button></div><span class="px-hint">畫出走勢，或選擇型態</span><div class="px-board-bottom"><div class="px-modes" hidden><button data-mode="sketch">相似路徑</button><button data-mode="pattern">型態條件</button></div><span class="px-caption"></span><button class="px-icon" data-action="undo" aria-label="清除上一筆" title="清除上一筆">${icon('undo')}</button><div class="px-tier-filters" role="group" aria-label="型態階段"><button data-tier-filter="all" aria-pressed="true">全部</button><button data-tier-filter="1" aria-pressed="false">T1</button><button data-tier-filter="2" aria-pressed="false">T2</button><button data-tier-filter="3" aria-pressed="false">T3</button></div></div></section><div class="px-meta"><span class="px-status" role="status" aria-live="polite">Bitget · USDT 永續</span><button data-action="refresh" aria-label="重新掃描">重新掃描</button></div><div class="px-load-track" hidden><i></i></div><section class="px-grid" aria-label="依 T1 T2 T3 排列的幣種"><div class="px-empty">等待畫入型態</div></section><button class="px-more" data-action="more" hidden>顯示更多</button><dialog class="px-dialog px-presets" aria-label="選擇型態"><div class="px-dialog-head"><span>型態</span><button class="px-icon" data-action="close" aria-label="關閉型態選單">${icon('close')}</button></div><div class="px-dialog-body"><input class="px-search" aria-label="搜尋型態" placeholder="搜尋型態"><div class="px-count-status" aria-live="polite"></div><div class="px-options"></div></div></dialog><dialog class="px-dialog px-settings" aria-label="時間級別"><div class="px-dialog-head"><span>時間級別</span><button class="px-icon" data-action="close" aria-label="關閉時間級別">${icon('close')}</button></div><div class="px-dialog-body"><div class="px-frames">${Object.keys(TIMEFRAMES).map(f=>`<button class="px-frame-option" data-frame="${f}">${f}</button>`).join('')}</div><label class="px-setting"><span>成交額觀察池</span><select data-limit aria-label="掃描幣種數"><option value="80">前 80 幣</option><option value="160">前 160 幣</option><option value="0">全部合資格幣</option></select></label><details class="px-help"><summary>比對與資料</summary><p>只掃描 Bitget 加密 USDT 永續，24H 成交額至少 300 萬 USDT。依成交額選池；結果先依 T1／T2／T3 階段，再依相似度與 OX 分數排序。型態 T1＝結構清楚、尚未啟動且價格仍靠近可觀察位置；T2＝開始啟動或需再次確認；T3＝仍早期或已走離；這是觀察階段，不是勝率或交易建議。未噴發只描述尚未突破，不保證行情方向。未畫圖時顯示原雷達 T1／T2／T3 候選，型態階段另列；畫圖後的 T1／T2／T3 才是型態階段。水平線至少三次確認觸及，整段不能貫穿明顯 K 線。選擇多個級別會分別比對。</p><p>進入頁面即預先分類，選型態直接讀取分類結果。手繪辨認出明確 W／M 時優先搜尋型態條件，容許左右寬度與深淺不同；可切回相似路徑。其餘不確定筆跡保留相似路徑，不強加型態名稱。W／M 包含形成中的第二段反彈，卡片會標示狀態。白線標示比對區段；相似度不是勝率。</p><p>OX 使用原本經典評分公式，以 1H 已收盤 K 線計算。成交額與漲跌為 24H；不同級別共用同一筆 OX 評分。</p><p>分類結果保存於此裝置，只沿用仍符合已收盤級別的資料。開啟頁面時預先載入；已分類的型態切換不重抓行情。數量按目前級別計算不重複幣種，同幣可符合不同類別。未載入完會顯示分類進度；首次使用與新增級別仍須載入。行情最長每 5 分鐘更新；1W 會納入 Bitget 真實但尚未收盤的本週 K，並明確標示未收，其餘級別只用已收盤 K；切走或背景停止。資料缺漏會跳過並顯示缺漏數，不補造 K 線。諧波固定比例容差為相對 ±5%，區間比例採硬性範圍；結果都是待觀察的型態候選。</p></details></div></dialog><dialog class="px-dialog px-detail" aria-label="型態 K 線詳情"><div class="px-dialog-head"><span class="px-detail-title"></span><div class="px-detail-tools"><button class="px-icon" data-action="reset-chart" aria-label="重設圖表範圍">${icon('refresh')}</button><button class="px-icon" data-action="close" aria-label="關閉圖表">${icon('close')}</button></div></div><div class="px-detail-frames" role="group" aria-label="K 線時間級別">${Object.keys(TIMEFRAMES).map(f=>`<button data-detail-frame="${f}" aria-pressed="false">${f}</button>`).join('')}</div><div class="px-detail-stage"><canvas aria-label="可拖曳及雙指縮放的 K 線圖"></canvas><div class="px-detail-loading" role="status" hidden></div></div><div class="px-detail-footer"></div></dialog></main>`;
  const q=s=>shadow.querySelector(s),qa=s=>[...shadow.querySelectorAll(s)],board=q('.px-board canvas');
  function preferences(){saved={frames:[...frames],limit,query,strokes:structuredClone(strokes)};}
  function labels(){
    q('[data-frame-label]').textContent=frames.join(' + ');q('[data-pattern-label]').textContent=patternById(query?.id)?.name||'型態';
    q('.px-modes').hidden=!strokes.length||!query?.points||!query?.id;
    qa('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===(query?.mode==='sketch'?'sketch':'pattern')));
    q('.px-caption').textContent=query?.mode==='sketch'&&!query.id?'相似路徑':'';
    q('.px-hint').hidden=strokes.length>0||!!query;q('[data-action="undo"]').disabled=!strokes.length&&!query;
    qa('[data-frame]').forEach(b=>b.setAttribute('aria-pressed',frames.includes(b.dataset.frame)));q('[data-limit]').value=String(limit);
  }
  function templatePath(p){return p.points.every(v=>v.y===p.points[0].y)?p.points:normalize(p.points);}
  function drawBoard(){
    boardRAF=0;const w=board.clientWidth,h=board.clientHeight,dpr=Math.min(devicePixelRatio||1,2);if(!w||!h)return;if(board.width!==w*dpr||board.height!==h*dpr){board.width=w*dpr;board.height=h*dpr;}const c=board.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
    c.fillStyle='#e0e7ef13';for(let x=22;x<w-10;x+=24)for(let y=18;y<h-12;y+=24)c.fillRect(x,y,1,1);
    const paths=strokes.length?strokes:(query?.id?[templatePath(patternById(query.id))]:query?.points?[normalize(query.points)]:[]);
    const glow=reducedMotion?0:activePointer!==null?1:Math.max(0,1-(performance.now()-glowEnded)/1400);
    c.shadowColor=`rgba(255,255,255,${.15+glow*.8})`;c.shadowBlur=1+glow*15;c.lineWidth=2+glow*.35;c.lineJoin=c.lineCap='round';c.strokeStyle='#f7f7f2';paths.forEach(path=>{c.beginPath();path.forEach((p,i)=>{const x=18+p.x*(w-36),y=18+(1-p.y)*(h-36);if(i)c.lineTo(x,y);else c.moveTo(x,y);});c.stroke();});
    if(paths[0]?.length){const p=paths.at(-1).at(-1);c.fillStyle='#f3efde';c.beginPath();c.arc(18+p.x*(w-36),18+(1-p.y)*(h-36),3,0,Math.PI*2);c.fill();}
    if(activePointer===null&&glow>0&&!document.hidden)boardRAF=requestAnimationFrame(drawBoard);
  }
  const scheduleBoard=()=>{if(!boardRAF)boardRAF=requestAnimationFrame(drawBoard);};const resize=new ResizeObserver(scheduleBoard);resize.observe(board);
  function resetWorker(){worker?.terminate();worker=null;for(const j of jobs.values())j.reject(new DOMException('Aborted','AbortError'));jobs.clear();fallback.clear();hydrated.clear();}
  function compute(message){
    if(!worker){try{worker=new Worker(new URL('./worker.js?v=patterns5d-20260929',import.meta.url),{type:'module'});worker.onmessage=({data})=>{const job=jobs.get(data.id);jobs.delete(data.id);if(job)data.error?job.reject(Error(data.error)):job.resolve(data.result);};worker.onerror=()=>{for(const j of jobs.values())j.reject(Error('型態計算失敗'));jobs.clear();worker?.terminate();worker=null;hydrated.clear();};}catch{}}
    if(!worker)return new Promise(resolve=>setTimeout(()=>{
      if(message.type==='index'){const context=prepareCandles(message.candles);fallback.set(message.key,context);resolve(message.matches||classifyPrepared(context));}
      else resolve(message.keys.flatMap(key=>{const context=fallback.get(key),match=context&&matchPrepared(context,message.query);return match?[{key,match}]:[];}));
    },0));
    return new Promise((resolve,reject)=>{const id=++workerId;jobs.set(id,{resolve,reject});worker.postMessage({...message,id});});
  }
  function activeEntries(){
    let list=[...entries.values()].filter(e=>frames.includes(e.data.frame)&&entryCurrent(e));
    const symbols=new Set(universe?universe.tickers.map(t=>t.symbol):[...new Map(list.sort((a,b)=>b.data.turnover-a.data.turnover).map(e=>[e.data.symbol,e])).keys()].slice(0,limit||Infinity));
    return list.filter(e=>symbols.has(e.data.symbol));
  }
  function counts(){return patternCounts(activeEntries(),frames);}
  function updateCounts(){
    const totals=counts();qa('[data-count]').forEach(e=>{e.textContent=totals[e.dataset.count]?String(totals[e.dataset.count]):busy?'…':'0';});
    q('.px-count-status').textContent=busy?`預先分類 ${progress.done}/${progress.total||'…'} 組`:`${frames.join(' + ')} · 不重複幣種${progress.failed?' · 部分資料缺漏':''}`;
  }
  function updateStatus(){
    q('.px').dataset.indexState=busy?'loading':lastError||progress.failed?'partial':'ready';
    const amount=activeEntries().length,matched=new Set([...rows.values()].map(r=>r.symbol)).size;
    status(`${lastError?lastError+' · ':''}Bitget · ${!universe&&amount?'快取 · ':''}${busy?'預先分類 '+progress.done+'/'+(progress.total||'…')+' 組':amount+' 組已分類'}${query?' · '+matched+' 幣符合':''}${progress.failed?' · '+progress.failed+' 缺漏':''}${lastScan?' · '+stamp(lastScan):''}`);
    updateCounts();
  }
  function setRows(matches){rows=new Map(matches.map(({entry,match})=>[entry.key,{...entry.data,match,similarity:match.similarity}]));renderResults(!rows.size);updateStatus();}
  async function search(){
    if(disposed||document.hidden||activePointer!==null)return;queryVersion++;const run=queryVersion,target=query&&structuredClone(query),list=activeEntries();
    if(!target){
      const radar=new Map(radarCandidates().map(r=>[r.symbol,r]));
      const candidatesBySymbol=new Map();
      list.filter(entry=>radar.has(entry.data.symbol)).forEach(entry=>{
        const ranked=radar.get(entry.data.symbol);
        const named=Object.values(entry.matches).filter(m=>m.kind!=='sketch'&&m.tier<=2);
        const best=sortMatches(named.map(match=>({match,similarity:match.similarity}))).at(0)?.match;
        const n=entry.data.candles.length;
        const candidate={entry,match:best?{...best,radar:true,radarTier:ranked.tier,radarRank:ranked.rank}:{tier:3,stage:'型態待確認',label:'雷達候選',similarity:0,points:[],start:Math.max(0,n-60),end:n-1,radar:true,radarTier:ranked.tier,radarRank:ranked.rank,unconfirmed:true}};
        const previous=candidatesBySymbol.get(entry.data.symbol);
        if(!previous||candidate.match.tier<previous.match.tier||candidate.match.tier===previous.match.tier&&candidate.match.similarity>previous.match.similarity)candidatesBySymbol.set(entry.data.symbol,candidate);
      });
      setRows([...candidatesBySymbol.values()]);return;
    }
    if(target.mode!=='sketch'&&target.id){setRows(list.flatMap(entry=>entry.matches[target.id]?[{entry,match:entry.matches[target.id]}]:[]));return;}
    if(searchRunning){searchPending=true;return;}
    searchRunning=true;searchPending=false;
    try{
      const result=await compute({type:'search',keys:list.map(e=>e.key),query:target});
      if(run!==queryVersion||disposed)return;
      const byKey=new Map(list.map(e=>[e.key,e]));setRows(result.filter(r=>byKey.has(r.key)).map(r=>({entry:byKey.get(r.key),match:r.match})));
    }catch(e){if(!disposed&&e.name!=='AbortError')status(e.message);}
    finally{searchRunning=false;if(searchPending&&!disposed){searchPending=false;search();}}
  }
  function clearCharts(){chartObserver?.disconnect();chartObserver=null;chartInstances.forEach(c=>c.destroy());chartInstances=[];}
  function renderResults(force=false){
    q('.px-tier-filters').hidden=!rows.size;
    const displayTier=r=>query?r.match.tier:r.match.radarTier;
    const totals=[1,2,3].map(t=>[...rows.values()].filter(r=>displayTier(r)===t).length);
    qa('[data-tier-filter]').forEach(b=>{const filter=b.dataset.tierFilter;b.setAttribute('aria-pressed',filter===tierFilter);b.textContent=filter==='all'?`全部 ${rows.size}`:`T${filter} ${totals[Number(filter)-1]}`;});
    const sorted=sortMatches([...rows.values()].filter(r=>tierFilter==='all'||String(displayTier(r))===tierFilter).map(r=>({...r,displayTier:displayTier(r),rankPriority:query?null:10-r.match.radarRank}))),visible=sorted.slice(0,shown),signature=sorted.length+'|'+visible.map(r=>`${r.symbol}:${r.frame}:${r.similarity}:${r.match.tier}:${r.match.radarTier}:${r.match.stage}:${r.oxScore}:${r.serverTime}`).join('|');
    q('.px-more').hidden=sorted.length<=shown;
    if(!force&&signature===lastSignature)return;lastSignature=signature;clearCharts();
    if(!visible.length){q('.px-grid').innerHTML=`<div class="px-empty">${tierFilter!=='all'&&rows.size?'此階段暫無符合的幣種':!query?(busy?'載入雷達候選型態…':'雷達候選暫無可用資料，可畫走勢或選擇型態'):busy?'正在加入已分類結果…':progress.failed===progress.total&&progress.total?'行情未取得，請重新掃描':'目前沒有符合的型態，可切換級別或重畫'}</div>`;return;}
    let lastTier=null;
    q('.px-grid').innerHTML=visible.map(r=>{const tier=displayTier(r),group=tierFilter==='all'&&lastTier!==tier?`<div class="px-tier-heading" data-tier-heading="${tier}">${query?'':'雷達 '}T${tier}<span>${query?(tier===1?'未噴發／未破位':tier===2?'初步啟動':'其他觀察'):'雷達候選'}</span></div>`:'';lastTier=tier;return `${group}<button class="px-card" data-tier="${tier}" data-result="${esc(r.symbol+':'+r.frame)}" aria-label="${esc(r.symbol)} ${r.frame} ${query?'型態':'雷達'} T${tier} ${esc(r.match.stage)}，開啟 K 線"><div class="px-card-top"><span class="px-symbol">${esc(r.symbol.replace(/USDT$/,''))}<span class="px-frame">${r.frame}${r.candles.at(-1).provisional?' · 未收':''}</span></span><span class="px-card-right"><b class="px-tier-badge">${query?'':'雷達 '}T${tier}</b><span class="px-change ${r.change>=0?'px-up':'px-down'}">${signed(r.change)}</span></span></div><div class="px-match"><span>${esc(query?r.match.stage:r.match.unconfirmed?'型態未確認':r.match.label.replace(/・.*$/,''))}</span><span>${query?'相似 '+r.similarity.toFixed(1):r.match.unconfirmed?'':'型態 T'+r.match.tier+' · '+esc(r.match.stage)}</span></div><canvas aria-label="${esc(r.symbol)} 實際型態 K 線"></canvas><div class="px-energy"><span>OX</span><strong>${r.oxScore??'—'}</strong><span class="px-track" role="meter" aria-label="OX 強度" aria-valuemin="0" aria-valuemax="100" ${r.oxScore===null?'':`aria-valuenow="${Math.min(100,r.oxScore)}"`}><i style="width:${Math.max(0,Math.min(100,r.oxScore??0))}%"></i></span></div><div class="px-turnover"><span>24H 成交額</span><b>${volume(r.turnover)} U</b></div></button>`;}).join('');
    const mountCard=card=>{if(card.dataset.chartMounted)return;const row=rows.get(card.dataset.result);if(row){card.dataset.chartMounted='true';chartInstances.push(candleChart(card.querySelector('canvas'),row));}chartObserver?.unobserve(card);};
    chartObserver=new IntersectionObserver(items=>{for(const e of items)if(e.isIntersecting)mountCard(e.target);},{rootMargin:'150px'});
    // Draw visible cards immediately. Incremental indexing must not repeatedly
    // cancel a deferred observer before the first frame is painted.
    qa('.px-card').forEach(card=>{const r=card.getBoundingClientRect();if(r.bottom>-150&&r.top<innerHeight+150)mountCard(card);else chartObserver.observe(card);});
    moreObserver?.disconnect();moreObserver=new IntersectionObserver(items=>{if(items.some(e=>e.isIntersecting)&&!q('.px-more').hidden){shown+=24;renderResults(true);}},{rootMargin:'180px'});if(!q('.px-more').hidden)moreObserver.observe(q('.px-more'));
  }
  function queueRender(){if(!paintTimer)paintTimer=setTimeout(()=>{paintTimer=0;search();},250);}
  function status(text){q('.px-status').textContent=text;}
  function stop(){version++;controller?.abort();controller=null;busy=false;clearTimeout(paintTimer);paintTimer=0;q('.px-load-track').hidden=true;}
  async function hydrate(entry){
    const old=entries.get(entry.key),same=old?.data.serverTime===entry.data.serverTime&&old?.data.candles.length===entry.data.candles.length;
    if(!hydrated.has(entry.key)||!same){await compute({type:'index',key:entry.key,candles:entry.data.candles,matches:entry.matches});hydrated.add(entry.key);}
    entries.set(entry.key,entry);primeCandleCache(entry.data);
  }
  async function scan(){
    stop();if(document.hidden||disposed)return;
    resumePending=false;lastError='';const run=version;controller=new AbortController();const signal=controller.signal;busy=true;progress={done:0,total:0,failed:0};
    updateStatus();q('.px-load-track').hidden=false;q('.px-load-track i').style.width='0%';
    try{
      const cached=await readIndex(frames);if(run!==version)return;
      for(const entry of cached){if(run!==version)return;await hydrate(entry);}
      search();
      if(!universe||Date.now()-universe.serverTime>60000||frames.some(f=>Math.floor(Date.now()/1000/TIMEFRAMES[f])!==Math.floor(universe.serverTime/1000/TIMEFRAMES[f])))universe=await fetchUniverse(signal,limit);
      if(run!==version)return;const pool=universe;progress.total=pool.tickers.length*frames.length;updateStatus();
      await scanUniverse(pool,frames,{signal,onSeries:async data=>{
        if(run!==version)return;const key=data.symbol+':'+data.frame,existing=entries.get(key),same=existing&&entryCurrent(existing,data.serverTime)&&existing.data.candles.at(-1).time===data.candles.at(-1).time&&(!data.candles.at(-1).provisional||existing.data.serverTime===data.serverTime);
        const matches=same&&hydrated.has(key)?existing.matches:await compute({type:'index',key,candles:data.candles,matches:same?existing.matches:null});
        if(run!==version)return;hydrated.add(key);const entry={key,data,matches,version:INDEX_VERSION};entries.set(key,entry);saveIndex(data,matches);queueRender();
      },onProgress:p=>{if(run!==version)return;progress=p;q('.px-load-track i').style.width=`${p.done/p.total*100}%`;updateStatus();}});
      if(run!==version)return;lastScan=Date.now();
      const keys=activeEntries().map(e=>e.key);worker?.postMessage({type:'retain',keys});for(const key of hydrated)if(!keys.includes(key))hydrated.delete(key);
      pruneIndex();
    }catch(e){if(run===version&&e.name!=='AbortError')lastError=e.message||'行情取得失敗';}
    finally{if(run===version){busy=false;controller=null;q('.px-load-track').hidden=true;search();}}
  }
  function openDialog(selector,button){const d=q(selector);d.classList.remove('px-closing');qa('.px-control').forEach(b=>b.setAttribute('aria-expanded',b===button));d.showModal();}
  function closeDialogs(immediate=false){qa('dialog[open]').forEach(d=>{if(immediate||matchMedia('(prefers-reduced-motion:reduce)').matches)d.close();else{d.classList.add('px-closing');setTimeout(()=>{if(d.classList.contains('px-closing')){d.close();d.classList.remove('px-closing');}},180);}});qa('.px-control').forEach(b=>b.setAttribute('aria-expanded','false'));detailController?.abort();detailController=null;detailVersion++;detailChart?.destroy();detailChart=null;detailFrame=null;selectedRow=null;}
  function presetOptions(search=''){
    let group='';const totals=counts();q('.px-options').innerHTML=PATTERNS.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())).map(p=>{const heading=p.group!==group?`<div class="px-group">${p.group}</div>`:'';group=p.group;return `${heading}<button class="px-option" data-preset="${p.id}" aria-pressed="${query?.id===p.id}"><svg viewBox="0 0 50 28" fill="none" stroke="currentColor" stroke-width="1.3"><polyline points="${templatePath(p).map(v=>`${2+v.x*46},${25-v.y*22}`).join(' ')}"/></svg><span>${p.name}</span><b class="px-count" data-count="${p.id}">${totals[p.id]||0}</b></button>`;}).join('')||'<div class="px-empty">沒有此型態</div>';updateCounts();
  }
  function displayDetail(row){
    detailFrame=row.frame;
    qa('[data-detail-frame]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.detailFrame===row.frame));
    q('.px-detail-title').textContent=`${row.symbol.replace(/USDT$/,'')} · ${row.frame}${row.match?.radar?` · 雷達 T${row.match.radarTier}`:row.match?` · 型態 T${row.match.tier} · 相似 ${row.match.similarity.toFixed(1)}`:''}`;
    q('.px-detail-footer').innerHTML=`<span>${row.match?.radar?`雷達 T${row.match.radarTier} · ${row.match.unconfirmed?'型態未確認':`型態 T${row.match.tier} · ${esc(row.match.stage)} · ${esc(row.match.label)}`}`:row.match?`型態 T${row.match.tier} · ${esc(row.match.stage)} · ${esc(row.match.label)}`:'此級別無符合型態 · 僅顯示 K 線'}</span><span>OX ${row.oxScore??'—'}</span><span>24H ${signed(row.change)}</span><span>成交額 ${volume(row.turnover)} USDT</span><div>Bitget · ${row.candles.at(-1).provisional?'本週 K 尚未收盤 · 更新 '+new Date(row.serverTime).toLocaleString('zh-TW',{hour12:false}):'已收盤 '+new Date(row.candles.at(-1).time*1000).toLocaleString('zh-TW',{hour12:false})} · 拖曳／雙指縮放</div>${row.match?.ratios?`<div class="px-detail-ratios">${Object.entries(row.match.ratios).map(([k,v])=>`${({ab:'AB/XA',bc:'BC/AB',cd:'CD/BC',ad:'AD/XA',equal:'CD/AB'})[k]} ${v.toFixed(3)}`).join(' · ')}</div>`:''}`;
    q('.px-detail-loading').hidden=true;detailChart?.destroy();detailChart=candleChart(q('.px-detail canvas'),row,{interactive:true});
  }
  async function selectDetailFrame(frame){
    if(!selectedRow||!TIMEFRAMES[frame])return;
    if(detailFrame===frame){detailController?.abort();detailController=null;detailVersion++;q('.px-detail-loading').hidden=true;return;}
    detailController?.abort();const run=++detailVersion;detailController=new AbortController();
    const loading=q('.px-detail-loading');loading.textContent=`載入 ${frame} K 線…`;loading.hidden=false;
    try{
      const original=selectedRow,entry=entries.get(original.symbol+':'+frame);
      const data=entry&&entryCurrent(entry)?entry.data:await fetchSeries(original.symbol,frame,detailController.signal);
      if(run!==detailVersion||!selectedRow)return;
      const match=frame===original.frame?original.match:entry&&entryCurrent(entry)&&query?.id&&query.mode!=='sketch'?entry.matches[query.id]||null:query?matchPrepared(prepareCandles(data.candles),query):null;
      displayDetail({...original,...data,match,frame});
    }catch(e){if(run===detailVersion&&e.name!=='AbortError'){loading.textContent=e.message||`${frame} K 線未取得`;}}
    finally{if(run===detailVersion)detailController=null;}
  }
  function openResult(key){
    const row=rows.get(key);if(!row)return;selectedRow=row;q('.px-detail').showModal();displayDetail(row);
  }
  shadow.addEventListener('click',e=>{
    const preset=e.target.closest('[data-preset]'),frame=e.target.closest('[data-frame]'),tierChoice=e.target.closest('[data-tier-filter]'),detailChoice=e.target.closest('[data-detail-frame]'),result=e.target.closest('[data-result]'),button=e.target.closest('[data-action]');
    if(tierChoice){tierFilter=tierChoice.dataset.tierFilter;shown=24;renderResults(true);return;}
    if(preset){clearTimeout(drawTimer);query={id:preset.dataset.preset};strokes=[];shown=24;labels();scheduleBoard();closeDialogs();preferences();search();return;}
    const mode=e.target.closest('[data-mode]');if(mode&&query?.points){query={...query,mode:mode.dataset.mode};shown=24;labels();preferences();search();return;}
    if(frame){const f=frame.dataset.frame;if(frames.includes(f)){if(frames.length===1)return;frames=frames.filter(x=>x!==f);}else frames.push(f);frames.sort((a,b)=>TIMEFRAMES[b]-TIMEFRAMES[a]);labels();preferences();search();clearTimeout(drawTimer);drawTimer=setTimeout(scan,300);return;}
    if(detailChoice){selectDetailFrame(detailChoice.dataset.detailFrame);return;}
    if(result){openResult(result.dataset.result);return;}
    if(!button)return;
    switch(button.dataset.action){
      case 'patterns':presetOptions();q('.px-search').value='';openDialog('.px-presets',button);break;
      case 'timeframes':labels();openDialog('.px-settings',button);break;
      case 'close':closeDialogs();break;
      case 'undo':clearTimeout(drawTimer);glowEnded=0;strokes=[];query=strokes.length?queryFromStrokes(strokes):null;labels();scheduleBoard();preferences();search();break;
      case 'refresh':universe=null;scan();break;
      case 'more':shown+=24;renderResults(true);break;
      case 'reset-chart':detailChart?.reset();break;
    }
  },{signal:life.signal});
  q('.px-search').addEventListener('input',e=>presetOptions(e.target.value),{signal:life.signal});
  q('[data-limit]').addEventListener('change',e=>{limit=Number(e.target.value);universe=null;preferences();scan();},{signal:life.signal});
  qa('dialog').forEach(d=>{d.addEventListener('cancel',e=>{e.preventDefault();closeDialogs();},{signal:life.signal});d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialogs();}},{signal:life.signal});});
  let activePointer=null,currentStroke=null;
  const position=e=>{const r=board.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left-18)/(r.width-36))),y:Math.max(0,Math.min(1,1-(e.clientY-r.top-18)/(r.height-36)))};};
  board.addEventListener('pointerdown',e=>{if(activePointer!==null||e.button>0)return;clearTimeout(drawTimer);queryVersion++;rows.clear();query=null;strokes=[];glowEnded=0;activePointer=e.pointerId;currentStroke=[position(e)];strokes=[currentStroke];q('.px-board').classList.add('is-drawing');board.setPointerCapture(e.pointerId);labels();scheduleBoard();},{signal:life.signal});
  board.addEventListener('pointermove',e=>{if(e.pointerId!==activePointer)return;const p=position(e),last=currentStroke.at(-1);if(Math.hypot(p.x-last.x,p.y-last.y)>.003){currentStroke.push(p);if(currentStroke.length>1200)currentStroke.splice(1,1);scheduleBoard();}},{signal:life.signal});
  const finish=e=>{if(e.pointerId!==activePointer)return;activePointer=null;glowEnded=performance.now();q('.px-board').classList.remove('is-drawing');if(e.type==='pointercancel')strokes.pop();if(currentStroke?.length<2&&strokes.at(-1)===currentStroke)strokes.pop();currentStroke=null;query=queryFromStrokes(strokes);shown=24;labels();scheduleBoard();preferences();renderResults(true);status(query?'正在搜尋已分類資料…':'請由左向右畫一段走勢');clearTimeout(drawTimer);drawTimer=setTimeout(search,100);};
  board.addEventListener('pointerup',finish,{signal:life.signal});board.addEventListener('pointercancel',finish,{signal:life.signal});
  board.addEventListener('keydown',e=>{if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();q('[data-action="undo"]').click();}},{signal:life.signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){queryVersion++;if(busy){resumePending=true;stop();status('已暫停 · 返回後重新掃描');}clearTimeout(drawTimer);}else if(resumePending||!lastScan||Date.now()-lastScan>60000)scan();},{signal:life.signal});
  const timer=setInterval(()=>{const cadence=Math.min(300000,...frames.map(f=>TIMEFRAMES[f]*1000));if(!busy&&!document.hidden&&Date.now()-lastScan>=cadence)scan();},15000);
  labels();scheduleBoard();scan();
  return {closeInner:closeDialogs,destroy(){disposed=true;queryVersion++;preferences();stop();resetWorker();life.abort();resize.disconnect();clearCharts();moreObserver?.disconnect();detailChart?.destroy();closeDialogs(true);clearInterval(timer);clearTimeout(drawTimer);cancelAnimationFrame(boardRAF);shadow.replaceChildren();}};
}
