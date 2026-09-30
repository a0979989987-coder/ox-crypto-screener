// UI-only fragments follow index.html's verified Crypto structure. No market data here.
export const glyphs = {
  radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="m12 12 6.4-6.4"/><circle cx="7.5" cy="15.5" r="1"/>',
  star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
  settings:'<path d="M4 6h4m4 0h8M4 12h10m4 0h2M4 18h2m4 0h10"/><circle cx="10" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  expand:'<path d="M9 3H3v6m12-6h6v6M3 15v6h6m6 0h6v-6"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  collapse:'<path d="m9 5 7 7-7 7"/>',
  scan:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.5"/><path d="m12 12 5-5M12 2v2M22 12h-2M12 22v-2M2 12h2"/>',
  undo:'<path d="m9 5-5 5 5 5M4 10h10a5 5 0 1 1 0 10"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  latest:'<path d="M4 12h15m-5-5 5 5-5 5M20 4v16"/>',
};
export const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[name] || ''}</svg>`;
export function positionTimeframe(root, reveal = false) {
  const rail=root.querySelector('.chart-timeframe-strip'), active=rail?.querySelector('.active'), marker=rail?.querySelector('.tf-glass-indicator');
  if(!active||!marker)return;
  marker.style.width=`${active.offsetWidth}px`;marker.style.transform=`translateX(${active.offsetLeft}px)`;rail.classList.add('is-ready');
  if(reveal)rail.scrollLeft=Math.max(0,active.offsetLeft+active.offsetWidth-rail.clientWidth);
}
export function openDialog(dialog, opener) {
  dialog._opener=opener||document.activeElement; dialog.showModal();
}
export function closeDialog(dialog) {
  dialog.close(); dialog._opener?.focus?.({preventScroll:true});
}
