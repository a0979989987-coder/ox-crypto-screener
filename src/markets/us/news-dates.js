const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit',
});
export function eventDay(event) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(event?.date || '')) return event.date;
  const at = Date.parse(event?.occursAt);
  return Number.isFinite(at) ? dayFormat.format(at) : '';
}
export function matchesEventWindow(event, { scope='week', date='', watch=new Set(), now=Date.now() }={}) {
  const day = eventDay(event);
  if (!day) return false;
  if (date) return day === date;
  const today = dayFormat.format(now);
  if (scope === 'today') return day === today;
  if (scope === 'watch') {
    if (!event.symbols?.some(symbol => watch.has(symbol))) return false;
    // An all-day item stays relevant for the entire Taipei date, even though
    // midnight has passed. Timed items retain their real upcoming cutoff.
    return event.occursAt ? Date.parse(event.occursAt) >= now : day >= today;
  }
  const midnight = Date.parse(`${today}T00:00:00+08:00`);
  const weekday = new Date(midnight + 8 * 3600000).getUTCDay();
  const monday = midnight - ((weekday + 6) % 7) * 86400000;
  return day >= dayFormat.format(monday) && day < dayFormat.format(monday + 7 * 86400000);
}
export const todayTaipei = (now=Date.now()) => dayFormat.format(now);
