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
  let snapshotPending;
  return async (endpoint, query) => {
    if (endpoint === 'snapshot') {
      if (!snapshotPath) return { schemaVersion: 2, privateValidation: true,
        source: 'finance-query-private', quotes: [], analyses: [], asOf: null,
        counts: { searchable: 0, quoted: 0, scanned: 0 }, error: '私人掃描快照尚未指定。' };
      snapshotPending ||= readFile(snapshotPath, 'utf8').then(JSON.parse).then(data => {
        const snapshot = data.snapshot;
        if (!snapshot?.privateValidation || snapshot.schemaVersion !== 2 ||
            !Array.isArray(snapshot.quotes) || !Array.isArray(snapshot.analyses))
          throw Error('不是可供私人驗證的掃描快照。');
        return snapshot;
      }).catch(error => { snapshotPending = null; throw error; });
      return snapshotPending;
    }
    return handleUS2(endpoint, query, () => { throw Error('私人驗證不使用 Twelve Data。'); },
      financeUpstream, { privateValidation: true });
  };
}
