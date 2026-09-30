import { icon, openDialog, closeDialog, positionTimeframe } from "./ui.js?v=20260930-us-free1";
import { INTERVALS } from "./calendar.js?v=20260930-us-free1";
import { chartWidgetSettings, widgetSymbol } from "./widget-config.js?v=20260930-us-free1";

// Keep mounted provider frames across OX page switches. No polling or DOM rebuild
// occurs when the provider updates prices. Bounded cache is cleared on page unload.
const frames = new Map();
export class USWidgetChart {
  constructor(root, {symbol="SPY", interval="1D", capabilities={}, asset={}, onState=()=>{}, onInterval=()=>{}, onCollapse=null}={}) {
    Object.assign(this, {root,symbol,interval,capabilities,asset,onState,onInterval,onCollapse,bars:[],disposed:false});
    root.classList.add("us2-widget-chart");
    root.innerHTML = `<div class="chart-controls us2-chart-toolbar"><div class="ctrl-group chart-timeframe-group"><div class="chart-timeframe-strip us2-timeframes" aria-label="圖表時間級別"><span class="tf-glass-indicator" aria-hidden="true"></span>${INTERVALS.map(tf=>`<button class="btn-tf ${tf===interval?'active':''}" data-tf="${tf}" aria-pressed="${tf===interval}">${tf}</button>`).join('')}</div></div><div class="ctrl-group chart-tool-actions"><button class="chart-tool-icon" data-widget-info aria-label="圖表工具與資料來源">${icon('settings')}</button>${onCollapse?`<button class="chart-tool-icon us2-list-toggle" data-collapse aria-label="收起／展開雷達清單">${icon('collapse')}</button>`:''}<button class="chart-tool-icon us2-expand-control" data-expand aria-label="展開圖表">${icon('expand')}</button></div></div><button class="us2-focus-exit chart-tool-icon" data-exit-focus aria-label="收合圖表" hidden>${icon('expand')}</button><div class="us2-widget-stage"></div><dialog class="chart-tools-dialog us2-widget-info" aria-label="圖表工具與資料來源"><header><b>圖表工具與資料來源</b><button data-close-widget-info aria-label="關閉">${icon('close')}</button></header><p>指標、繪圖、成交量與時段，使用圖表內工具。美股為 Cboe One 延遲來源；行情時間以圖表標示為準，成交量不保證全市場口徑。</p><p>免費圖表不提供原始 OHLCV 給 OX；OX 經典與型態畫板不會讀取或假造它的資料。</p><p>畫線由 TradingView 管理；免費圖表不保證切頁或重新整理後保留畫線。</p><a href="https://www.tradingview.com/widget-docs/" target="_blank" rel="noopener">TradingView 官方圖表說明 ↗</a></dialog>`;
    this.stage=root.querySelector('.us2-widget-stage');
    this.events=new AbortController();
    root.addEventListener('click', event=>{
      const button=event.target.closest('button');
      if(!button)return;
      if(button.dataset.tf)this.change({interval:button.dataset.tf});
      if(button.hasAttribute('data-widget-info'))openDialog(root.querySelector('dialog'),button);
      if(button.hasAttribute('data-close-widget-info'))closeDialog(root.querySelector('dialog'));
      if(button.hasAttribute('data-collapse'))onCollapse?.();
      if(button.hasAttribute('data-expand')||button.hasAttribute('data-exit-focus'))this.expand();
    },{signal:this.events.signal});
    requestAnimationFrame(()=>{if(!this.disposed)positionTimeframe(root,true);});
    this.mount();
  }
  mount(force=false) {
    if(this.disposed)return;
    this.release();
    const key=`${widgetSymbol(this.symbol,this.asset)}:${this.interval}`;
    const settings=chartWidgetSettings(this.symbol,this.interval,this.asset);
    if(!settings){
      this.stage.replaceChildren();
      const note=document.createElement('p');note.className='us2-empty';note.textContent='無法確認此股票的美股交易所，請選擇另一檔股票。';
      this.stage.append(note);return;
    }
    if(force){const old=frames.get(key);if(old){clearTimeout(old.timer);old.element.remove();frames.delete(key);}}
    let entry=frames.get(key);
    if(!entry){
      const element=document.createElement('div');element.className='us2-widget-frame tradingview-widget-container';
      const host=document.createElement('div');host.className='tradingview-widget-container__widget';
      const credit=document.createElement('div');credit.className='tradingview-widget-copyright';
      const link=document.createElement('a');link.href=`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(settings.symbol)}`;link.target='_blank';link.rel='noopener';link.textContent=`${this.symbol} 圖表由 TradingView 提供`;credit.append(link);
      const status=document.createElement('div');status.className='us2-widget-status';status.setAttribute('role','status');
      const text=document.createElement('span');text.textContent=`連線 ${this.symbol} 圖表…`;
      const retry=document.createElement('button');retry.type='button';retry.textContent='重新連線';retry.hidden=true;
      const external=document.createElement('a');external.href=link.href;external.target='_blank';external.rel='noopener';external.textContent='開啟圖表 ↗';external.hidden=true;
      status.append(text,retry,external);element.append(host,credit,status);
      entry={key,element,status,text,retry,external,ready:false,owner:this};
      const failed=()=>{if(entry.ready)return;entry.text.textContent='圖表服務連線較慢，可重試或另開圖表。';retry.hidden=false;external.hidden=false;};
      // Same iframe URL/configuration produced by TradingView's official embed
      // script. Keep provider code inside its frame, away from OX's app context.
      const frame=document.createElement('iframe');frame.title=`${settings.symbol} 美股 K 線`;
      frame.allow='fullscreen';frame.setAttribute('frameborder','0');
      const url=new URL('https://www.tradingview-widget.com/embed-widget/advanced-chart/');
      url.searchParams.set('locale','zh_TW');
      const {locale,...iframeSettings}=settings;
      url.hash=encodeURIComponent(JSON.stringify({...iframeSettings,width:'100%',height:'100%'}));
      frame.src=url.href;entry.frame=frame;
      frame.addEventListener('load',()=>{
        entry.ready=true;clearTimeout(entry.timer);status.hidden=true;entry.owner?.report();
      });
      frame.addEventListener('error',failed);
      host.append(frame);
      entry.timer=setTimeout(failed,14000);
      retry.onclick=()=>entry.owner?.mount(true);
      frames.set(key,entry);
    }
    entry.owner=this;this.entry=entry;this.stage.replaceChildren(entry.element);
    while(frames.size>6){const candidate=[...frames.values()].find(x=>!x.owner);if(!candidate)break;clearTimeout(candidate.timer);candidate.element.remove();frames.delete(candidate.key);}
    this.report();
  }
  report() {
    if(this.disposed)return;
    this.onState({symbol:this.symbol,interval:this.interval,source:'tradingview-widget',widget:true,widgetReady:!!this.entry?.ready,bars:[],error:null});
  }
  change({symbol=this.symbol,interval=this.interval,asset=this.asset}={}) {
    if(symbol===this.symbol&&interval===this.interval)return;
    Object.assign(this,{symbol,interval,asset});
    this.root.querySelectorAll('[data-tf]').forEach(b=>{b.classList.toggle('active',b.dataset.tf===interval);b.setAttribute('aria-pressed',b.dataset.tf===interval);});
    positionTimeframe(this.root,true);this.onInterval(interval);this.mount();
  }
  setCapabilities(cap){this.capabilities=cap;}
  setGuide(){} // OX pattern guides require raw candles; never overlay guessed lines.
  expand() {
    const expanded=this.root.classList.toggle('us2-chart-full');
    document.body.classList.toggle('us2-chart-focus',expanded);
    this.root.querySelector('[data-exit-focus]').hidden=!expanded;
  }
  release(){if(this.entry){this.entry.owner=null;this.entry.element.remove();this.entry=null;}}
  destroy(){this.disposed=true;this.events.abort();this.release();this.root.classList.remove('us2-chart-full','us2-widget-chart');document.body.classList.remove('us2-chart-focus');}
}
