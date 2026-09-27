// Restore the OX LIVE display preference before the page body paints.
try {
  document.documentElement.classList.toggle('ox-live-disabled', localStorage.getItem('ox-setting-oxLive') === '0');
} catch { /* Storage may be unavailable in a private browser session. */ }
