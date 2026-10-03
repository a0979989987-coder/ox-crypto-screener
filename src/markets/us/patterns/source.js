import { USAdapter } from '../provider.js?v=20261003-us-live1';
import { nativeAllowed } from '../view-utils.js?v=20261003-us-live1';
import { closedCandles } from '../model.js?v=20261003-us-live1';

export const TIMEFRAMES = Object.freeze({ '1D':86400, '1W':604800, '1M':2592000 });
const abortError = () => new DOMException('Aborted', 'AbortError');
const finite = value => typeof value === 'number' && Number.isFinite(value);
const contexts = new Map();
const snapshotRevisions = new WeakMap();
let nextRevision = 0;
function snapshotRevision(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return 0;
  if (!snapshotRevisions.has(snapshot)) snapshotRevisions.set(snapshot, ++nextRevision);
  return snapshotRevisions.get(snapshot);
}

// A file replacement, new close or change of access scope gets a separate
// pattern session. An old personal dataset must never surface on the public feed.
export function patternSourceKey({ capabilities = {}, snapshot } = {}) {
  return JSON.stringify(['us', capabilities.dataScope || 'public', capabilities.source || '',
    capabilities.rawDataAvailable === true, capabilities.externalDisplayConfirmed === true,
    capabilities.localDataAvailable === true, capabilities.privateValidation === true,
    snapshot?.sessionDate || '', snapshot?.createdAt || snapshot?.asOf || '',
    snapshot?.counts?.quoted || 0, snapshotRevision(snapshot)]);
}

export function patternDataAllowed(capabilities) {
  const displayAllowed = capabilities?.externalDisplayConfirmed === true ||
    capabilities?.dataScope === 'device' && capabilities.localDataAvailable === true ||
    capabilities?.privateValidation === true && nativeAllowed(capabilities);
  return ['eod','perpetual'].includes(capabilities?.mode) && capabilities.rawDataAvailable === true &&
    capabilities.chartMode !== 'widget' && displayAllowed;
}

export function createUSPatternSource({ getContext, adapter = USAdapter }) {
  const initial = getContext(), sessionKey = patternSourceKey(initial);
  const perpetual=initial.capabilities?.mode==='perpetual';
  let records = contexts.get(sessionKey);
  if (!records) {
    records = { series:new Map(), index:new Map() };
    contexts.set(sessionKey, records);
    while (contexts.size > 2) contexts.delete(contexts.keys().next().value);
  }
  const current = () => {
    const value = getContext();
    if (patternSourceKey(value) !== sessionKey) throw abortError();
    if (!patternDataAllowed(value.capabilities)) throw Error('美股盤後原始 K 線尚未接通，型態掃描暫無資料。');
    if (!['eod','perpetual'].includes(value.snapshot?.mode) || !(value.snapshot.sessionDate || value.snapshot.asOf))
      throw Error(value.error || '尚未取得美股收盤快照。');
    return value;
  };
  const source = {
    id:'us', sessionKey, TIMEFRAMES, defaultFrames:['1D'], defaultLimit:0,
    label:perpetual?'幣安股票合約':'美股 · 盤後', asset:perpetual?'合約':'股票', currency:perpetual?'USDT':'USD', period:perpetual?'24h':'當日', turnoverLabel:'20日平均估算成交額',
    palette:{ up:'#00b8d4', down:'#ff3078' },
    displayName:row => `${row.symbol} ${row.name || ''}`.trim(),
    detailStamp:row => `${perpetual?'幣安合約 UTC · ':''}已完成${row.frame === '1D' ? '日' : row.frame === '1W' ? '週' : '月'} K · ${row.candles.at(-1).periodEnd || row.candles.at(-1).date}`,
    help:'<p>美股畫板與加密市場共用型態辨識、手繪搜尋及 T1／T2／T3 分級。只使用真實且已完成的日／週／月 K 線；休市與資料缺漏不補造，歷史不足不以其他級別代替。</p><p>選擇型態或畫出走勢，會比對已分類的 K 線，不重複下載。未畫圖時可瀏覽整個有行情的觀察池；相似度不是勝率，型態結果也不等於雷達入選。</p>',
    dataDate:() => getContext().snapshot?.sessionDate || getContext().snapshot?.asOf || null,
    scanCurrent:universe => !!universe && universe.revision === patternSourceKey(getContext()) &&
      patternDataAllowed(getContext().capabilities),
    async fetchUniverse(signal, limit = 0) {
      signal?.throwIfAborted();
      const { snapshot, directory = [] } = current();
      const names = new Map(directory.map(row => [row.symbol, row]));
      const daily = new Map((snapshot.analyses || []).filter(row => row.interval === '1D').map(row => [row.symbol, row]));
      const seen = new Set();
      const allTickers = (snapshot.quotes || []).flatMap(quote => {
        if (!quote?.symbol || seen.has(quote.symbol) || !finite(quote.price) || quote.price <= 0 ||
          !perpetual && quote.asOf && quote.asOf !== snapshot.sessionDate) return [];
        const row = daily.get(quote.symbol), item = names.get(quote.symbol) || row;
        if (!item?.name || item.complex) return [];
        seen.add(quote.symbol);
        return [{ ...item, symbol:quote.symbol, name:item.name, quote,
          turnover:finite(row?.liquidity) ? row.liquidity : null,
          change:finite(quote.changePct) ? quote.changePct : null }];
      }).sort((a,b) => (b.turnover ?? -Infinity) - (a.turnover ?? -Infinity) || a.symbol.localeCompare(b.symbol));
      if (!allTickers.length) throw Error('尚無可用的美股盤後股票資料。');
      return { tickers:allTickers.slice(0, limit || Infinity), allTickers,
        dataDate:snapshot.sessionDate || snapshot.asOf, revision:sessionKey, serverTime:Date.parse(snapshot.createdAt || snapshot.asOf) };
    },
    primeCandleCache(data) {
      if (data?.revision === sessionKey && TIMEFRAMES[data.frame] && data.candles?.length)
        records.series.set(data.symbol + ':' + data.frame, data);
    },
    async fetchSeries(symbol, frame, signal, _asOf, { minimum = 1 } = {}) {
      signal?.throwIfAborted();
      if (!Object.hasOwn(TIMEFRAMES, frame)) throw Error('美股盤後畫板只支援日／週／月 K 線。');
      const { capabilities, snapshot, directory = [] } = current();
      const key = symbol + ':' + frame, cached = records.series.get(key);
      if (cached?.candles.length >= minimum) return cached;
      const quote = snapshot.quotes?.find(row => row.symbol === symbol);
      const daily = snapshot.analyses?.find(row => row.symbol === symbol && row.interval === '1D');
      const item = directory.find(row => row.symbol === symbol) || daily;
      if (!quote || !item?.name || item.complex) throw Error(`${symbol} 不在已取得行情的觀察池內。`);
      const response = await adapter.candles(symbol, { interval:frame, limit:200,
        extendedHours:false, signal, capabilities });
      signal?.throwIfAborted();current();
      if (response.mode !== snapshot.mode || response.interval !== frame ||
        (perpetual ? response.source!=='binance-equity' : response.asOf !== snapshot.sessionDate))
        throw Error(`${symbol} 的 K 線日期或級別與收盤快照不一致。`);
      const serverTime = Date.parse(snapshot.createdAt || snapshot.asOf);
      if (!Number.isFinite(serverTime)) throw Error('美股收盤快照時間無效。');
      const input = response.bars || [];
      if (input.some((bar,i) => !bar || !finite(bar.time) || i && bar.time <= input[i-1].time ||
        ![bar.open,bar.high,bar.low,bar.close].every(n => finite(n) && n > 0) ||
        bar.high < Math.max(bar.open,bar.close,bar.low) || bar.low > Math.min(bar.open,bar.close,bar.high) ||
        !(bar.volume === null || finite(bar.volume) && bar.volume >= 0))) throw Error(`${symbol} 的 OHLCV 格式無效。`);
      const candles = closedCandles(input, frame, serverTime).slice(-200);
      if (candles.length < minimum) throw Error(`${symbol} ${frame} 已完成 K 線不足 ${minimum} 根。`);
      const value = { symbol, name:item.name, market:'us', frame, candles, serverTime,
        dataDate:snapshot.sessionDate || snapshot.asOf, revision:sessionKey, source:response.source,
        turnover:finite(daily?.liquidity) ? daily.liquidity : null,
        change:finite(quote.changePct) ? quote.changePct : null, oxScore:null };
      records.series.set(key, value);
      return value;
    },
    async scanUniverse(universe, frames, { signal, onSeries, onProgress }) {
      signal?.throwIfAborted();current();
      if (universe.revision !== sessionKey || frames.some(frame => !Object.hasOwn(TIMEFRAMES,frame))) throw abortError();
      let cursor = 0, done = 0, failed = 0, coinsDone = 0;
      const total = universe.tickers.length * frames.length, coinsTotal = universe.tickers.length;
      const progress = () => onProgress({ done, total, failed, coinsDone, coinsTotal });
      progress();
      await Promise.all(Array.from({ length:Math.min(3,coinsTotal) },async () => {
        while (cursor < coinsTotal) {
          signal?.throwIfAborted();
          const ticker = universe.tickers[cursor++];
          for (const frame of frames) {
            signal?.throwIfAborted();
            try {
              const data = await source.fetchSeries(ticker.symbol,frame,signal,undefined,{ minimum:35 });
              signal?.throwIfAborted();await onSeries({ ...data, ticker });
            } catch (error) { if (signal?.aborted || error.name === 'AbortError') throw error; failed++; }
            done++;
          }
          coinsDone++;progress();
          if (coinsDone % 12 === 0) await new Promise(resolve => setTimeout(resolve,0));
        }
      }));
      return { done, total, failed };
    },
  };
  // Classifications are held only in this data-scoped memory. The personal raw
  // file is already in its own browser store; no second persistent copy/upload.
  const INDEX_VERSION = 1;
  const entryCurrent = entry => entry?.version === INDEX_VERSION &&
    entry.data?.revision === sessionKey && sessionKey === patternSourceKey(getContext()) &&
    patternDataAllowed(getContext().capabilities) && TIMEFRAMES[entry.data.frame] && entry.data.candles?.length >= 35;
  const cache = {
    INDEX_VERSION, entryCurrent,
    async readIndex(frames) { return [...records.index.values()].filter(entry => frames.includes(entry.data.frame) && entryCurrent(entry)); },
    async saveIndex(data,matches) {
      const entry = { key:data.symbol + ':' + data.frame, data, matches, version:INDEX_VERSION };
      if (entryCurrent(entry)) records.index.set(entry.key,entry);
      return entry;
    },
    async pruneIndex() { for (const [key,entry] of records.index) if (!entryCurrent(entry)) records.index.delete(key); },
  };
  return { source, cache };
}
