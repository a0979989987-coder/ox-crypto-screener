/* Session boundary: production sessions must be server-managed, HttpOnly and Secure. */
(() => {
  window.OXSession = Object.freeze({
    status: 'placeholder',
    async getCurrent(){ return null; },
    async refresh(){ return null; },
    async signOut(){ return {ok:false, code:'AUTH_PROVIDER_NOT_CONFIGURED'}; }
  });
})();
