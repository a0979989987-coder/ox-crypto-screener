// Per warm-instance protection. CDN handles identical cross-instance reads;
// a distributed account-wide quota requires a shared store, not an in-memory promise.
let start = 0,
  used = 0,
  active = 0;
export async function withinBudget(weight, load) {
  const now = Date.now();
  if (now - start >= 60000) {
    start = now;
    used = 0;
  }
  const budget = Math.max(
    1,
    Number(process.env.US_API_CREDITS_PER_MINUTE) || 8,
  );
  if (used + weight > budget || active >= 2) {
    const e = Error("目前行情請求額度已達上限。");
    e.code = 429;
    throw e;
  }
  used += weight;
  active++;
  try {
    return await load();
  } finally {
    active--;
  }
}
export function resetBudget() {
  start = 0;
  used = 0;
  active = 0;
}
