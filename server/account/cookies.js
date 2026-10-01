import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
export function seal(value, secret, purpose, ttl = 2592000, now = Date.now()) {
  const iv = randomBytes(12), key = createHash('sha256').update(secret).digest();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(purpose));
  const data = Buffer.concat([cipher.update(JSON.stringify({ value, exp: now + ttl * 1000 })), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}
export function unseal(raw, secret, purpose, now = Date.now()) {
  try {
    if (!raw || raw.length > 3800) return null;
    const data = Buffer.from(raw, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), data.subarray(0, 12));
    decipher.setAAD(Buffer.from(purpose)); decipher.setAuthTag(data.subarray(12, 28));
    const payload = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString());
    return payload.exp > now ? payload.value : null;
  } catch { return null; }
}
export const cookieName = kind => `__Host-ox-account-${kind}`;
export function cookie(kind, value, ttl = 2592000) {
  if (value.length > 3800) throw new Error('Cookie too large');
  return `${cookieName(kind)}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${value ? ttl : 0}`;
}
export function readCookie(req, kind) {
  return (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName(kind) + '='))?.slice(cookieName(kind).length + 1) || '';
}
export function safeReturn(value) {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/';
  const parsed = new URL(value, 'https://ox.invalid');
  return parsed.origin === 'https://ox.invalid' && !parsed.pathname.startsWith('/api/') ? value : '/';
}
