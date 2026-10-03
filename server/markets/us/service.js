import { eodCapabilities, handleEOD } from './eod-service.js';
import { readFile } from 'node:fs/promises';
import { binanceCapabilities, binanceService } from './binance-service.js';
export function capabilities({ privateValidation = false } = {}) {
  if (!privateValidation && process.env.US_DATA_PROVIDER === 'binance-equity') return binanceCapabilities();
  return eodCapabilities(privateValidation);
}

let directoryPending;
export async function publicDirectory() {
  if (directoryPending) return directoryPending;
  directoryPending = readDirectory().catch((error) => {
    directoryPending = null;
    throw error;
  });
  return directoryPending;
}
async function readDirectory() {
  const j = JSON.parse(
    await readFile(
      new URL("../../../data/us-directory.json", import.meta.url),
      "utf8",
    ),
  );
  return j;
}
export async function snapshot() { return handleUS2('snapshot'); }
export async function handleUS2(endpoint, query, upstream, financeUpstream, options = {}) {
  if (!options.privateValidation && process.env.US_DATA_PROVIDER === 'binance-equity')
    return binanceService.handle(endpoint,query,{known:(await publicDirectory()).items});
  if (endpoint === 'directory') return publicDirectory();
  return handleEOD(endpoint, query, options);
}
