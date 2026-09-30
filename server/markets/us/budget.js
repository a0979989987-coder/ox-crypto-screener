// Per warm-instance protection. CDN handles identical cross-instance reads;
// a distributed account-wide quota requires a shared store, not an in-memory promise.
let start = 0,
  used = 0,
  active = 0;
const waiting = [];
const limitError = () => Object.assign(Error("目前行情請求額度已達上限。"), { code: 429 });
function release() {
  // Hand the occupied slot directly to the oldest queued request.
  if (waiting.length) waiting.shift()();
  else active--;
}
export async function withinBudget(weight, load) {
  if (active >= 2) {
    if (waiting.length >= 12) throw limitError();
    await new Promise(resolve => waiting.push(resolve));
  } else active++;
  try {
    const now = Date.now();
    if (now - start >= 60000) {
      start = now;
      used = 0;
    }
    const budget = Math.max(
      1,
      Number(process.env.US_API_CREDITS_PER_MINUTE) || 8,
    );
    if (used + weight > budget) throw limitError();
    used += weight;
    return await load();
  } finally {
    release();
  }
}
export function resetBudget() {
  start = 0;
  used = 0;
  active = 0;
}
