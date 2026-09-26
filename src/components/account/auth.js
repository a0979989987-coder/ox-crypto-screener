/* Provider adapter boundary. A server Auth provider must replace these stubs. */
(() => {
  const unavailable = async () => ({ok:false, code:'AUTH_PROVIDER_NOT_CONFIGURED'});
  window.OXAuth = Object.freeze({
    status: Object.freeze({providerConnected:false, googleConnected:false, emailConnected:false}),
    signInWithGoogle: unavailable,
    signInWithEmail: unavailable,
    registerWithEmail: unavailable,
    signOut: unavailable
  });
})();
