// This adapter is imported by the loopback dev server only, never by Vercel.
import { readFile } from 'node:fs/promises';
import { handleUS2 } from './service.js';
const hosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
export function loopbackRequest(request) {
  const address = request.socket?.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return false;
  try {
    if (!hosts.has(new URL(`http://${request.headers.host}`).hostname)) return false;
    if (request.headers.origin && !hosts.has(new URL(request.headers.origin).hostname)) return false;
    if (request.headers['sec-fetch-site'] === 'cross-site') return false;
    return true;
  } catch { return false; }
}
export function privateUSPreview({ snapshotPath, financeUpstream } = {}) {
  let bundlePending;
  return async (endpoint, query) => handleUS2(endpoint, query,
    () => { throw Error('盤後模式不呼叫盤中行情。'); }, financeUpstream,
    {privateValidation:true, readBundle: async () => {
      if (!snapshotPath) throw Error('私人盤後快照尚未指定。');
      const data=await (bundlePending ||= readFile(snapshotPath,'utf8').then(JSON.parse).catch(error=>{bundlePending=null;throw error;}));
      if (data.mode !== 'eod' || !data.privateValidation || !data.histories) throw Error('不是私人盤後快照。');
      return data;
    }});
}
