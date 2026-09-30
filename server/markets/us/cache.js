// Warm-instance request coalescing complements CDN caching. Not a distributed quota lock.
const cache = new Map(),
  pending = new Map();
let backoffUntil = 0;
export async function cachedRequest(
  key,
  load,
  { ttl = 60000, stale = 300000 } = {},
) {
  const now = Date.now(),
    hit = cache.get(key);
  if (hit && now - hit.at < ttl) return hit.value;
  if (pending.has(key)) return pending.get(key);
  if (now < backoffUntil) {
    const e = Error("行情供應商限流，請稍後重試。");
    e.code = 429;
    throw e;
  }
  const p = Promise.resolve()
    .then(load)
    .then((value) => {
      cache.set(key, { at: Date.now(), value });
      while (cache.size > 250) cache.delete(cache.keys().next().value);
      return value;
    })
    .catch((e) => {
      if (Number(e.code) === 429 || e.status === 429)
        backoffUntil = Date.now() + 60000;
      if (hit && now - hit.at < stale) {
        const error = Error("資料更新失敗；快取資料已過期。");
        error.code = "STALE_DATA";
        throw error;
      }
      throw e;
    })
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}
export function resetCache() {
  cache.clear();
  pending.clear();
  backoffUntil = 0;
}
