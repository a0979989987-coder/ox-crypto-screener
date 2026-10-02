// Pure, source-backed text builders. A report date is explicit: the formatter
// never substitutes the machine clock or turns an old snapshot into today's.
const finite = value => typeof value === 'number' && Number.isFinite(value);
const day = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const short = (value, limit = 8) => { const chars = [...clean(value)]; return chars.length > limit ? chars.slice(0, limit - 1).join('') + '…' : chars.join(''); };
const rounded = (value, digits = 1) => Number(value.toFixed(digits)).toString();
const signed = (value, digits = 2) => `${value > 0 ? '+' : ''}${rounded(value, digits)}`;
const compact = value => {
  if (Math.abs(value) < 1e6) return rounded(value, 0);
  const [scale, unit] = Math.abs(value) >= 1e12 ? [1e12, '兆'] : Math.abs(value) >= 1e8 ? [1e8, '億'] : [1e4, '萬'];
  return `約${rounded(value / scale, 1)}${unit}`;
};
const usable = value => value && value.status !== 'stale' && value.status !== 'unavailable';
const onDate = (value, date) => day(date) && usable(value) && value.date === date;
const overnight = (value, date) => day(date) && usable(value) && day(value.date) &&
  value.date < date && (Date.parse(date) - Date.parse(value.date)) <= 4 * 86400000;
const beforeCutoff = (value, date) => !value?.quotedAt ||
  Number.isFinite(Date.parse(value.quotedAt)) && Date.parse(value.quotedAt) <= Date.parse(`${date}T08:30:00+08:00`);

// Explicit inputs: target date; dated sox/adr/us changePct; completed night
// close/change; strongSectors[{us,tw,changePct,date}]; prior Taiwan session date
// plus foreignShort.change in contracts; fx.pair='USD/TWD' and its changePct.
export function buildPremarketBriefing(input = {}) {
  const date = day(input.date) ? input.date : null;
  const missing = [];
  if (!date) missing.push('報告日期');
  const usDate = day(input.usSessionDate) ? input.usSessionDate : [input.sox, input.adr, input.us, ...(input.strongSectors || [])]
    .filter(value => overnight(value, date)).map(value => value.date).sort().at(-1);
  const previous = (value, label) => {
    if (overnight(value, date) && value.date === usDate && beforeCutoff(value, date) && finite(value.changePct)) return value;
    missing.push(label); return null;
  };
  const sox = previous(input.sox, '費城半導體');
  const adr = previous(input.adr, '台積電 ADR');
  const us = previous(input.us, '美股大盤');
  const night = onDate(input.night, date) && beforeCutoff(input.night, date) &&
    finite(input.night.change) && finite(input.night.close) ? input.night : null;
  if (!night) missing.push('當日已完成夜盤');
  const sector = (input.strongSectors || []).find(value => overnight(value, date) && value.date === usDate &&
    beforeCutoff(value, date) && finite(value.changePct) && value.changePct > 0 && clean(value.us) && clean(value.tw));
  if (!sector) missing.push('美股強勢族群與台股對應');
  // Futures positions are previous Taiwan session data, not overnight quotes.
  // An explicit session date is required; the formatter never guesses holidays.
  const shorts = day(input.previousSessionDate) && input.previousSessionDate < date &&
    onDate(input.foreignShort, input.previousSessionDate) && Number.isSafeInteger(input.foreignShort.change) ? input.foreignShort : null;
  if (!shorts) missing.push('外資期貨空單增減');
  const fx = onDate(input.fx, date) && input.fx.pair === 'USD/TWD' && beforeCutoff(input.fx, date) && finite(input.fx.changePct) && input.fx.changePct > -100 ? input.fx : null;
  if (!fx) missing.push('08:30 前台幣匯率');
  const direction = us && night ? us.changePct > 0 && night.change > 0 ? '偏開高' :
    us.changePct < 0 && night.change < 0 ? '偏開低' : '開盤方向分歧' : '開盤方向待確認';
  const market = `費半${sox ? signed(sox.changePct) + '%' : '待補'}、ADR${adr ? signed(adr.changePct) + '%' : '待補'}；`;
  const futures = night ? `夜盤${night.change > 0 ? '+' : ''}${compact(night.change)}點收${compact(night.close)}。` : '夜盤待補。';
  const theme = sector ? `美股${short(sector.us)}強，留意台股${short(sector.tw)}；` : '強勢族群待補；';
  const positions = shorts ? `空單${shorts.change > 0 ? '增' : shorts.change < 0 ? '減' : '持平'}${shorts.change ? compact(Math.abs(shorts.change)) + '口' : ''}。` : '外資空單待補。';
  const twdChange = fx ? (1 / (1 + fx.changePct / 100) - 1) * 100 : null;
  const currency = fx ? `台幣${twdChange > 0 ? '升' : twdChange < 0 ? '貶' : '持平'}${twdChange ? rounded(Math.abs(twdChange), 2) + '%' : ''}；` : '';
  const action = '前15分鐘先看量，未高於昨同期不追價。';
  let text = `${market}${futures}${theme}${positions}${currency}${direction}；${action}`;
  // Currency is supplementary to the required three axes. Keep all mandatory
  // fields and the measurable action intact when long supplied names exceed 100.
  if ([...text].length > 100) text = `${market}${futures}${theme}${positions}${direction}；${action}`;
  if ([...text].length > 100) text = `${market}${futures}${sector ? `美股${short(sector.us, 4)}→台股${short(sector.tw, 4)}；` : theme}${positions}${direction}；前15分鐘量未高於昨同期不追價。`;
  if ([...text].length > 100) {
    missing.push('超長數值的可讀格式');
    text = '費半、ADR與夜盤數值格式待確認；強勢族群及外資空單請見明確輸入。開盤方向待確認；前15分鐘先看量，未高於昨同期不追價。';
  }
  return { title: '08:30 盤前快訊', date, text, missing, complete: Boolean(date) && missing.length === 0,
    basis: `${usDate ? `美股 ${usDate}；` : ''}方向：美股大盤＋已完成夜盤推估` };
}

export function buildAftermarketBriefing(input = {}) {
  const date = day(input.date) ? input.date : null;
  const missing = [];
  if (!date) missing.push('報告日期');
  const index = onDate(input.index, date) && finite(input.index.changePct) ? input.index : null;
  if (!index) missing.push('當日大盤漲跌幅');
  const sectors = (input.sectors || []).filter(value => onDate(value, date) && clean(value.name) && finite(value.netTwd));
  const buys = [...sectors].filter(value => value.netTwd > 0).sort((a, b) => b.netTwd - a.netTwd).slice(0, 3);
  const sells = [...sectors].filter(value => value.netTwd < 0).sort((a, b) => a.netTwd - b.netTwd).slice(0, 3);
  const amount = value => `${value.estimated ? '估算' : ''}${rounded(Math.abs(value.netTwd) / 1e8, 2)}億`;
  const theme = onDate(input.buyTheme, date) && clean(input.buyTheme.name) ? clean(input.buyTheme.name) : null;
  let text = index ? `大盤${signed(index.changePct, 2)}%。` : '當日大盤漲跌幅待補。';
  if (buys.length) {
    text += `${theme ? `法人主要掃貨${theme}，` : '法人主要掃貨'}${buys.map(value => clean(value.name)).join('、')}，分別買超${buys.map(amount).join('、')}。`;
    const strength = onDate(input.buyStrength, date) && finite(input.buyStrength.baselineTwd) && input.buyStrength.baselineTwd > 0 && clean(input.buyStrength.baselineLabel) ? input.buyStrength : null;
    const strengthRatio = strength ? buys.reduce((sum, value) => sum + value.netTwd, 0) / strength.baselineTwd : null;
    if (finite(strengthRatio) && strengthRatio >= 1.5) text += `力道明顯（買超合計為${clean(strength.baselineLabel)}${rounded(strengthRatio, 1)}倍）。`;
  } else if (sectors.length) text += '已收錄族群未見淨買超。';
  else { missing.push('當日法人產業買超'); text += '法人買賣主軸尚待同日資料。'; }
  if (sells.length) text += `同時從${sells.map(value => `${clean(value.name)}賣超${amount(value)}`).join('、')}。`;
  else if (sectors.length) text += '已收錄族群未見淨賣超。';
  else { missing.push('當日法人產業賣超'); }
  const anomalies = onDate(input.chipAnomalies, date) && Number.isInteger(input.chipAnomalies.count) &&
    input.chipAnomalies.count >= 0 && clean(input.chipAnomalies.rule) ? input.chipAnomalies : null;
  if (anomalies) text += `籌碼異常股數${anomalies.count}檔（${clean(anomalies.rule)}）。`;
  else { missing.push('有明確規則的籌碼異常股數'); }
  const rotation = onDate(input.rotation, date) && ['積極', '保守', '劇烈'].includes(input.rotation.label) &&
    clean(input.rotation.basis) ? input.rotation : null;
  if (rotation) text += `${!anomalies ? '籌碼異常股數待確認。' : ''}轉向相當${rotation.label}（${clean(rotation.basis)}）。`;
  else { missing.push('轉向程度依據'); text += anomalies ? '轉向程度待確認。' : '籌碼異常與轉向待確認。'; }
  return { title: 'AI 盤後總結', date, text, missing, complete: Boolean(date) && missing.length === 0,
    basis: sectors.some(value => value.estimated) ? '法人金額：淨股數×收盤價估算' : '' };
}

// Adapter for today's available snapshots. ADR, futures positioning, US sector
// rankings and anomaly rules are intentionally absent until a verified source
// supplies them; a broad US index is not relabelled as a strong sector.
export function homeBriefingInput(home = {}, phase = 'after', research = null) {
  if (phase === 'before') {
    const date = home.briefingStatus?.reportDate || home.briefing?.date;
    const rows = home.briefing?.rows || [];
    const quote = id => { const row = rows.find(value => value.id === id); return row ? { ...row, date: row.marketDate } : null; };
    const night = home.night ? { ...home.night, date: home.night.sessionEnd?.slice(0, 10),
      quotedAt: home.night.sessionEnd, status: home.nightStatus?.error ? 'stale' : home.night.status } : null;
    const fx = quote('TWD=X');
    return { date, sox: quote('^SOX'), adr: quote('TSM'), us: quote('^GSPC'), night, fx: fx ? { ...fx, pair: 'USD/TWD' } : null };
  }
  const date = home.coreStatus?.reportDate || home.core?.date;
  const index = home.core?.index ? { ...home.core.index, date: home.core.date, status: home.coreStatus?.error ? 'stale' : 'ok' } : null;
  const sectors = research?.date === date && research?.methodology === 'net-shares-times-daily-close-v1' ?
    (research.sectors || []).map(value => ({ name: value.name, netTwd: value.flow, date: research.date, estimated: true,
      status: research.sourceHealth && Object.values(research.sourceHealth).some(source => !source.ok) ? 'stale' : 'ok' })) : [];
  return { date, index, sectors };
}
