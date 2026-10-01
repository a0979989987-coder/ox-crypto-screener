import { createClient } from '@supabase/supabase-js';
import { seal, unseal, cookie, readCookie, safeReturn } from './cookies.js';
const bursts = new Map();
function allow(key) {
  const now = Date.now();
  for (const [k, v] of bursts) if (v.until < now) bursts.delete(k);
  if (bursts.size >= 1000 && !bursts.has(key)) return false;
  const entry = bursts.get(key) || { count: 0, until: now + 60000 };
  bursts.set(key, entry); return ++entry.count <= 5;
}
const publicUser = user => {
  const email = typeof user.email === 'string' ? user.email : '';
  const name = [user.user_metadata?.full_name, user.user_metadata?.name, email.split('@')[0]].find(value => typeof value === 'string' && value.trim());
  return { id: user.id, email, displayName: name?.slice(0, 120) || 'OX 會員', createdAt: user.created_at, methods: (Array.isArray(user.identities) ? user.identities : []).map(i => i.provider).filter(value => typeof value === 'string'), role: 'ox_member', cryptoFull: false };
};
export function createAccountHandler({ env = process.env, clientFactory = createClient, limiter = allow } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private'); res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    const endpoint = req.query?.endpoint;
    const secret = env.OX_AUTH_SESSION_SECRET, url = env.OX_SUPABASE_URL, key = env.OX_SUPABASE_PUBLISHABLE_KEY;
    const configured = !!(secret?.length >= 32 && /^https:\/\/[^/]+\.supabase\.co$/.test(url || '') && key && /^https:\/\/[^/]+$/.test(env.OX_ACCOUNT_ORIGIN || ''));
    const json = (code, body) => res.status(code).json(body);
    const clear = () => res.setHeader('Set-Cookie', ['access', 'refresh', 'flow'].map(k => cookie(k, '')));
    if (endpoint === 'config' && req.method === 'GET') return json(200, { configured, providerConnectionVerified: false, databaseConnected: false });
    if (!configured) return json(503, { ok: false, code: 'AUTH_PROVIDER_NOT_CONFIGURED', message: '正式登入服務尚未設定。' });
    const origin = env.OX_ACCOUNT_ORIGIN;
    if (!['config', 'google', 'callback', 'email', 'verify', 'session', 'logout'].includes(endpoint)) return json(404, { ok: false });
    if (!['GET', 'POST'].includes(req.method)) return json(405, { ok: false });
    if (req.method === 'POST' && (req.headers.origin !== origin || req.headers['content-type']?.split(';')[0] !== 'application/json')) return json(403, { ok: false, message: '請從 OX 網站操作。' });
    const getOnly = ['session', 'callback'];
    if ((getOnly.includes(endpoint) && req.method !== 'GET') || (!getOnly.includes(endpoint) && req.method !== 'POST')) return json(405, { ok: false });
    let body = req.body || {};
    if (req.method === 'POST') {
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return json(400, { ok: false }); } }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > 4096) return json(400, { ok: false });
      if (!limiter(String(req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown') + ':' + endpoint)) return json(429, { ok: false, message: '操作太頻繁，請稍後再試。' });
    }
    const rawFlow = readCookie(req, 'flow');
    const flow = unseal(rawFlow, secret, 'flow');
    const storageMap = new Map(Object.entries(flow?.storage || {}));
    const storage = { getItem: key => storageMap.get(key) ?? null, setItem: (key, value) => storageMap.set(key, value), removeItem: key => storageMap.delete(key) };
    let client;
    const saveSession = session => {
      if (!session?.access_token || !session?.refresh_token) throw new Error('Invalid session');
      res.setHeader('Set-Cookie', [cookie('access', seal(session.access_token, secret, 'access')), cookie('refresh', seal(session.refresh_token, secret, 'refresh')), cookie('flow', '')]);
    };
    const redirect = path => { res.setHeader('Location', path); return res.status(303).end(); };
    const callbackFailure = reason => {
      // Fixed, non-sensitive categories only. Never return/log the auth code,
      // verifier, cookie, token, user data, or raw upstream exception.
      res.setHeader('Set-Cookie', cookie('flow', ''));
      return redirect(`/?ox_auth=error&ox_auth_reason=${reason}`);
    };
    try {
      client = clientFactory(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storage } });
      if (endpoint === 'google') {
        const returnTo = safeReturn(body.returnTo);
        const { data, error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: origin + '/api/v1/account/callback', skipBrowserRedirect: true } });
        if (error || !data.url || new URL(data.url).origin !== new URL(url).origin) throw new Error('OAuth failed');
        const flowId = typeof data.flowId === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(data.flowId) ? data.flowId : undefined;
        res.setHeader('Set-Cookie', cookie('flow', seal({ storage: Object.fromEntries(storageMap), returnTo, ...(flowId ? { flowId } : {}) }, secret, 'flow', 600), 600));
        return json(200, { ok: true, url: data.url });
      }
      if (endpoint === 'callback') {
        if (req.query.error) return callbackFailure(req.query.error === 'access_denied' ? 'provider_denied' : 'provider_callback_error');
        if (!flow) return callbackFailure(rawFlow ? 'flow_invalid' : 'flow_missing');
        if (typeof req.query.code !== 'string' || !req.query.code || req.query.code.length > 2048) return callbackFailure('code_missing');
        const options = flow.flowId ? { flowId: flow.flowId } : undefined;
        const { data, error } = await client.auth.exchangeCodeForSession(req.query.code, options);
        if (error) {
          const reason = error.name === 'AuthPKCECodeVerifierMissingError' ? 'pkce_missing' : error.code === 'bad_code_verifier' ? 'pkce_mismatch' : ['flow_state_expired', 'otp_expired'].includes(error.code) ? 'authorization_expired' : error.code === 'flow_state_not_found' ? 'authorization_invalid' : 'exchange_failed';
          return callbackFailure(reason);
        }
        if (!data?.user || !data.session?.access_token || !data.session?.refresh_token) return callbackFailure('response_invalid');
        saveSession(data.session); return redirect(safeReturn(flow.returnTo));
      }
      if (endpoint === 'email' || endpoint === 'verify') {
        const email = body.email;
        if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { ok: false, message: '請輸入有效的電子郵件。' });
        if (endpoint === 'email') {
          const returnTo = safeReturn(body.returnTo);
          const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: body.register === true, emailRedirectTo: origin + '/api/v1/account/callback' } });
          if (error) return json(400, { ok: false, message: '無法寄出登入連結，請稍後重試或確認電子郵件設定。' });
          res.setHeader('Set-Cookie', cookie('flow', seal({ storage: Object.fromEntries(storageMap), returnTo }, secret, 'flow', 600), 600));
          return json(200, { ok: true, message: '登入連結已寄出，請到信箱點擊連結完成登入。' });
        }
        if (typeof body.token !== 'string' || !/^\d{6,10}$/.test(body.token)) return json(400, { ok: false, message: '請輸入信件中的驗證碼。' });
        const { data, error } = await client.auth.verifyOtp({ email, token: body.token, type: 'email' });
        if (error || !data.user) return json(400, { ok: false, message: '驗證碼無效或已過期，請重新寄送。' });
        saveSession(data.session); return json(200, { ok: true, user: publicUser(data.user) });
      }
      const access = unseal(readCookie(req, 'access'), secret, 'access');
      const refresh = unseal(readCookie(req, 'refresh'), secret, 'refresh');
      if (endpoint === 'logout') {
        try {
          if (access && refresh) {
            const { error } = await client.auth.setSession({ access_token: access, refresh_token: refresh });
            if (!error) await client.auth.signOut({ scope: 'local' });
          }
        } catch { /* Always finish local logout if the provider is unavailable. */ }
        clear(); return json(200, { ok: true });
      }
      if (endpoint === 'session') {
        if (!access || !refresh) return json(200, { ok: true, user: null });
        let validatedAccess = access;
        let { data, error } = await client.auth.getUser(access);
        if (error) {
          const refreshed = await client.auth.refreshSession({ refresh_token: refresh });
          if (refreshed.error || !refreshed.data.user) { clear(); return json(200, { ok: true, user: null }); }
          // Validate with the provider; never authorize from decoded client claims.
          const validated = await client.auth.getUser(refreshed.data.session.access_token);
          if (validated.error || !validated.data.user) { clear(); return json(200, { ok: true, user: null }); }
          saveSession(refreshed.data.session); data = validated.data;
          validatedAccess = refreshed.data.session.access_token;
        }
        let accountStorage = 'unverified';
        if (data.user) {
          try {
            // Read the existing table using this user's JWT and its RLS policy.
            // Never create tables, use service-role credentials, or write privileges here.
            const reader = clientFactory(url, key, { global: { headers: { Authorization: `Bearer ${validatedAccess}` } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
            const result = await reader.from('ox_accounts').select('id').eq('id', data.user.id).maybeSingle();
            if (!result.error) accountStorage = result.data?.id === data.user.id ? 'stored' : 'missing';
          } catch { /* Login remains available; storage status is explicitly unverified. */ }
        }
        return json(200, { ok: true, user: data.user ? { ...publicUser(data.user), accountStorage } : null });
      }
      return json(404, { ok: false });
    } catch {
      if (endpoint === 'logout') { clear(); return json(200, { ok: true }); }
      if (endpoint === 'callback') return callbackFailure('callback_unavailable');
      return json(503, { ok: false, message: '登入服務暫時無法使用，請稍後再試。' });
    }
  };
}
