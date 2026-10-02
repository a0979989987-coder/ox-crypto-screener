export const MARKET_NAMES = { crypto: '加密', tw: '台股', us: '美股', all: '新聞總頁' };
export const CATEGORY_NAMES = {
  dividend: '除權息', macro: '國際財經數據', earnings: '法說會', holiday: '休市／交易日',
  'dividend-preview': '除權息預告', payment: '現金發放日', exchange: '交易所事件',
  unlock: '代幣解鎖', network: '主網／協議升級', listing: '上架／下架／維護', governance: '治理投票',
  airdrop: '空投快照／申領', burn: '銷毀／回購', regulation: '監管／ETF 公告'
};
export const MARKET_CATEGORIES = {
  tw: ['dividend', 'macro', 'earnings', 'holiday', 'dividend-preview', 'payment', 'exchange'],
  crypto: ['unlock', 'network', 'listing', 'governance', 'airdrop', 'burn', 'macro', 'regulation'],
  us: ['macro', 'earnings', 'holiday', 'exchange'], all: Object.keys(CATEGORY_NAMES)
};
const source = (id, name, markets, extra = {}) => ({ id, name, markets, status: 'not-connected', ...extra });
export const SOURCE_CATALOG = [
  source('twse', '臺灣證券交易所', ['tw']), source('tpex', '證券櫃檯買賣中心', ['tw']),
  source('technews', '科技新報', ['tw']), source('digitimes', 'DIGITIMES／電子時報', ['tw']),
  source('yahoo', 'Yahoo', ['tw'], { aggregator: true }), source('cnyes', '鉅亨網', ['tw']),
  source('wantgoo', '玩股網', ['tw']), source('google-news', 'Google 新聞', ['tw'], { aggregator: true }),
  source('ltn', '自由時報', ['tw']), source('cna', '中央通訊社', ['tw']), source('udn', '經濟日報', ['tw']),
  source('ctee', '工商時報', ['tw']), source('cmoney', 'CMoney 投資網誌', ['tw']), source('chinatimes', '中時新聞網', ['tw']),
  source('168', '168 財經', ['tw']), source('jin10', '金十數據', ['tw']), source('investing', 'Investing', ['tw','us']),
  source('forexfactory', 'Forex Factory', ['tw']), source('moneydj', 'MoneyDJ 理財網', ['tw']),
  source('pchome', 'PChome 股市', ['tw']), source('ebc', '東森財經新聞網', ['tw']), source('msn', 'MSN 財經', ['tw'], { aggregator: true }),
  source('coindesk', 'CoinDesk', ['crypto']), source('cointelegraph', 'Cointelegraph', ['crypto']), source('decrypt', 'Decrypt', ['crypto']),
  source('theblock', 'The Block', ['crypto']), source('panews', 'PANews', ['crypto']), source('foresight', 'Foresight News', ['crypto']),
  source('blockbeats', 'BlockBeats', ['crypto']), source('odaily', 'Odaily', ['crypto']),
  source('blocktempo', '動區動趨 BlockTempo', ['crypto']), source('abmedia', '鏈新聞 ABMedia', ['crypto']),
  source('bitget', 'Bitget 官方公告', ['crypto']), source('binance', 'Binance 官方公告', ['crypto']),
  source('coinbase', 'Coinbase 官方公告', ['crypto']), source('kraken', 'Kraken 交易所', ['crypto']), source('okx', 'OKX 官方公告', ['crypto']),
  source('ethereum', '以太坊基金會', ['crypto']), source('bitcoin-core', '比特幣核心開發團隊', ['crypto']), source('aptos', 'Aptos 基金會', ['crypto']), source('aave-governance', 'Aave 治理（Snapshot）', ['crypto']),
  source('fed', '美國聯準會', ['us']), source('bls-cpi', '美國勞工統計局・物價', ['us']), source('bls-jobs', '美國勞工統計局・就業', ['us']),
  source('bls-calendar', '美國勞工統計局・行事曆', ['crypto', 'tw', 'us']), source('ecb', '歐洲央行', ['us']),
  source('sec', '美國證券交易委員會', ['us', 'crypto']), source('cftc', '美國商品期貨交易委員會', ['us', 'crypto']),
  source('twse-dividends', '證交所・除權息預告', ['tw']), source('twse-holidays', '證交所・交易日曆', ['tw']),
  source('tpex-dividends', '櫃買中心・除權息預告', ['tw']), source('tpex-dividends-daily', '櫃買中心・除權息結果', ['tw']),
  source('twse-conferences', '證交所・法說會月表', ['tw']),
  source('mops-conferences', '公開資訊觀測站・法說會', ['tw']), source('mops-payments', '公開資訊觀測站・配息', ['tw'])
];
export const TIME_CHOICES = [['3', '3 小時'], ['24', '24 小時'], ['168', '1 週'], ['720', '30 日']];
export const EVENT_PROVIDERS = { macro: ['bls-calendar'], 'dividend-preview': ['twse-dividends','tpex-dividends'], dividend: ['tpex-dividends-daily'], earnings: ['twse-conferences','mops-conferences'], holiday: ['twse-holidays'], payment: ['mops-payments'], governance: ['aave-governance'], network: ['bitcoin-core'], unlock: ['aptos'] };
export function sourceName(item) { return SOURCE_CATALOG.find(s => s.id === (item.sourceId || item.id))?.name || item.source || item.name || item.sourceId || '來源待確認'; }
