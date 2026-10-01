import { deviceRecord } from './device-storage.js?v=20261001-us-device1';
import { buildDeviceDataset, deviceCandles } from './device-eod-core.js?v=20261001-reversal1';

let active = null, restoring;
async function build(packet, progress) {
  if (typeof Worker === 'undefined') return buildDeviceDataset(packet, { progress });
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./device-eod-worker.js?v=20261001-reversal1', import.meta.url), { type:'module' });
    const timer = setTimeout(() => { worker.terminate(); reject(Error('本機分析逾時，請換較小的盤後檔重試。')); }, 120000);
    const finish = () => { clearTimeout(timer); worker.terminate(); };
    worker.onmessage = ({ data }) => {
      if (data.percent !== undefined) { progress?.(data.percent); return; }
      finish(); data.error ? reject(Error(data.error)) : resolve(data.dataset);
    };
    worker.onerror = () => { finish(); reject(Error('本機盤後分析無法啟動，請重新整理後重試。')); };
    worker.postMessage(packet);
  });
}
export const DeviceEOD = {
  get active() { return active; },
  async restore() {
    restoring ||= (async () => {
      try { const packet = await deviceRecord('eod'); if (packet) active = await build(packet); }
      catch { /* Corrupt/unavailable local storage never enables a raw API. */ }
      return active;
    })();
    return restoring;
  },
  async importFile(file, progress) {
    if (!file || file.size > 50 * 1024 * 1024) throw Error('請選擇小於 50 MB 的 OX 盤後 JSON 檔。');
    let packet;
    try { packet = JSON.parse(await file.text()); } catch { throw Error('無法讀取盤後 JSON 檔。'); }
    const dataset = await build(packet, progress);
    // Commit only after validation and an atomic storage write both succeed.
    // A malformed replacement never destroys the last usable personal dataset.
    await deviceRecord('eod', dataset.packet);
    active = dataset; restoring = Promise.resolve(dataset);
    return dataset;
  },
  async clear() {
    await deviceRecord('eod', null); active = null; restoring = Promise.resolve(null);
  },
  candles(symbol, options) { return deviceCandles(active, symbol, options); },
  quote(symbol) {
    const quote = active.snapshot.quotes.find(row => row.symbol === symbol);
    if (!quote) throw Error(`${symbol} 不在這份本機盤後資料內。`);
    return quote;
  },
};
