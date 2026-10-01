/* Browser talks only to OX. Provider tokens remain in HttpOnly cookies. */
(() => {
  let current = null;
  let config = { configured: false };
  async function request(endpoint, body) {
    try {
      const response = await fetch(`/api/v1/account/${endpoint}`, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json();
      if (!response.ok) return { ok: false, message: result.message || '登入服務尚未設定或暫時無法使用。' };
      return result;
    } catch { return { ok: false, message: '目前無法連接登入服務。' }; }
  }
  function setUser(user) { current = user || null; document.dispatchEvent(new CustomEvent('ox:accountchange', { detail: { user: current } })); }
  window.OXAuth = Object.freeze({
    get user() { return current; },
    get status() { return { configured: config.configured === true, providerConnected: !!current, configurationOnly: !current }; },
    async initialize() { config = await request('config'); let user = null; if (config.configured) { const result = await request('session'); if (result.ok) user = result.user; } setUser(user); return config; },
    async getCurrent() { const result = await request('session'); setUser(result.ok ? result.user : null); return current; },
    async signInWithGoogle() { const result = await request('google', { returnTo: location.pathname + location.search + location.hash }); if (result.ok && result.url) location.assign(result.url); return result; },
    signInWithEmail(email) { return request('email', { email, register: false, returnTo: location.pathname + location.search + location.hash }); },
    registerWithEmail(email) { return request('email', { email, register: true, returnTo: location.pathname + location.search + location.hash }); },
    async verifyEmail(email, token) { const result = await request('verify', { email, token }); if (result.ok) setUser(result.user); return result; },
    async signOut() { const result = await request('logout', {}); if (result.ok) setUser(null); return result; }
  });
})();
