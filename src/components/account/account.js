(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const overlay = $('#ox-account-overlay');
  const authView = $('#ox-account-auth-view');
  const center = $('#ox-account-center');
  const status = $('#ox-account-auth-status');
  let priorFocus = null;
  const open = (view='auth', returnFocus=null) => {
    priorFocus = returnFocus || document.activeElement;
    overlay?.classList.add('is-open'); overlay?.setAttribute('aria-hidden','false');
    document.body.classList.add('ox-account-open');
    authView.hidden = view !== 'auth'; center.hidden = view !== 'center';
    requestAnimationFrame(() => (view === 'auth' ? $('#ox-account-tab-login') : $('#ox-account-close'))?.focus());
  };
  const close = () => {
    overlay?.classList.remove('is-open'); overlay?.setAttribute('aria-hidden','true');
    document.body.classList.remove('ox-account-open'); priorFocus?.focus?.();
  };
  const mode = (register) => {
    const card = $('#ox-account-auth-view');
    card.classList.add('is-switching');
    window.setTimeout(() => card.classList.remove('is-switching'), 280);
    overlay.classList.toggle('is-register', register);
    $('#ox-account-tab-login').setAttribute('aria-selected', String(!register));
    $('#ox-account-tab-register').setAttribute('aria-selected', String(register));
    $('#ox-account-title-main').textContent = register ? '建立 OX 帳號' : '登入 OX';
    $('#ox-account-email-submit').textContent = register ? '建立帳號' : '繼續';
    $('#ox-account-password-wrap').hidden = !register;
    $('#ox-account-password').autocomplete = register ? 'new-password' : 'current-password';
    $('#ox-account-lead')?.remove();
    status.textContent = 'Google 與 Email 驗證服務尚未連接，現在不會提交或保存你的資料。';
  };
  // The control panel stops click bubbling, so its account CTA must open the
  // account surface on the button itself instead of relying on document delegation.
  document.querySelectorAll('[data-ox-account-open]').forEach(trigger => {
    trigger.addEventListener('click', e => {
      e.preventDefault();
      const controlOverlay = $('#ox-control-overlay');
      const controlWasOpen = controlOverlay?.classList.contains('is-open');
      if (controlWasOpen) $('#ox-control-close')?.click();
      open('auth', controlWasOpen ? $('#ox-control-open') : trigger);
    });
  });
  document.addEventListener('click', e => {
    if (e.target.closest('#ox-account-trigger')) open();
    if (e.target.closest('#ox-account-close,#ox-account-skip')) close();
    if (e.target.closest('[data-ox-account-login]')) open();
    if (e.target.closest('#ox-account-tab-login')) mode(false);
    if (e.target.closest('#ox-account-tab-register')) mode(true);
    if (e.target.closest('#ox-account-google')) window.OXAuth.signInWithGoogle().then(() => { status.textContent = 'Google 登入目前尚未連接，沒有傳送任何帳號資料。'; });
    if (e.target.closest('#ox-account-bitget-info')) { $('#ox-account-info-modal').classList.add('is-open'); $('#ox-account-info-modal').setAttribute('aria-hidden','false'); }
    if (e.target.closest('#ox-account-info-close') || (e.target.id === 'ox-account-info-modal')) { $('#ox-account-info-modal').classList.remove('is-open'); $('#ox-account-info-modal').setAttribute('aria-hidden','true'); }
  });
  $('#ox-account-email-form')?.addEventListener('submit', e => { e.preventDefault(); const register=$('#ox-account-tab-register').getAttribute('aria-selected')==='true'; const action=register?window.OXAuth.registerWithEmail:window.OXAuth.signInWithEmail; action().then(() => { status.textContent = 'Email 驗證目前尚未連接，沒有傳送或保存你的資料。'; }); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if ($('#ox-account-info-modal')?.classList.contains('is-open')) { $('#ox-account-info-modal').classList.remove('is-open'); $('#ox-account-info-modal').setAttribute('aria-hidden','true'); } else close(); }
    if (e.key === 'Tab' && overlay?.classList.contains('is-open')) {
      const nodes = [...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(x => !x.closest('[hidden]'));
      if (!nodes.length) return; const first=nodes[0], last=nodes[nodes.length-1];
      if (e.shiftKey && document.activeElement===first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement===last) { e.preventDefault(); first.focus(); }
    }
  });
  window.OXAccount = Object.freeze({open,close, get sessionStatus(){return 'provider-not-connected';}});
})();
