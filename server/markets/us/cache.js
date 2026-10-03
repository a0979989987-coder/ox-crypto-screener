// Warm-instance request coalescing complements CDN caching. This is not an
// account-wide quota lock. Stale data is returned only with explicit metadata.
const cache = new Map(), pending = new Map();
let backoffUntil = 0;
export async function cachedRequest(key, load, {
  ttl = 60000, stale = 300000, withMetadata = false,
} = {}) {
  const now = Date.now(), hit = cache.get(key);
  const result = (entry, isStale = false, reason = null) => withMetadata
    ? { value: entry.value, cache: { fetchedAt: entry.at, stale: isStale, reason } }
    : entry.value;
  const fallback = reason => withMetadata && hit && now - hit.at < stale
    ? result(hit, true, reason) : null;
  if (hit && now - hit.at < ttl) return result(hit);
  if (now < backoffUntil && !pending.has(key)) {
    const previous = fallback("RATE_LIMITED");
    if (previous) return previous;
    const error = Error("行情供應商限流，請稍後重試。");
    error.code = 429;
    error.retryAfter = Math.max(1, Math.ceil((backoffUntil - now) / 1000));
    throw error;
  }
  if (!pending.has(key)) {
    const request = Promise.resolve().then(load).then(value => {
      const entry = { at: Date.now(), value };
      cache.set(key, entry);
      while (cache.size > 250) cache.delete(cache.keys().next().value);
      return entry;
    }).catch(error => {
      if (Number(error.code) === 429 || error.status === 429)
        backoffUntil = Math.max(backoffUntil, Date.now() + Math.max(60, Number(error.retryAfter) || 60) * 1000);
      throw error;
    }).finally(() => pending.delete(key));
    pending.set(key, request);
  }
  try {
    return result(await pending.get(key));
  } catch (error) {
    const status = Number(error.status) || Number(error.code);
    // Never hide lost authorization, an invalid symbol or invalid input.
    if ([400, 401, 403, 404, 451].includes(status)) throw error;
    const previous = fallback(status === 429 ? "RATE_LIMITED" : "UPDATE_FAILED");
    if (previous) return previous;
    if (hit && now - hit.at < stale) {
      const expired = Error("資料更新失敗；快取資料已過期。");
      expired.code = "STALE_DATA";
      throw expired;
    }
    throw error;
  }
}
export function resetCache() {
  cache.clear(); pending.clear(); backoffUntil = 0;
}
