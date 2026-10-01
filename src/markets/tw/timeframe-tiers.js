// Reuse Taiwan's validated, closed-candle pattern stages; never inherit a
// daily quote grade for a missing weekly/monthly classification.
const LONG=new Set(['horizontal-resistance','trend-up','w','ascending','ihs','triple-bottom','falling-wedge','channel-up','flag-up','pennant-up','v-bottom','round-bottom','cup','retest-up','stairs-up']);
const SHORT=new Set(['horizontal-support','trend-down','m','descending','hs','triple-top','rising-wedge','channel-down','flag-down','pennant-down','v-top','round-top','cup-down','retest-down','stairs-down']);
const BOTH=new Set(['triangle','range','broadening']);
export function patternFrameTier(entry,side='long') {
 if(!entry?.data?.candles?.length||!entry.matches)return null;
 const ids=side==='long'?LONG:SHORT,suffix=side==='long'?'-bull':'-bear';
 const matches=Object.entries(entry.matches).filter(([id,m])=>(ids.has(id)||BOTH.has(id)||id.endsWith(suffix))&&[1,2,3].includes(m?.tier));
 matches.sort(([,a],[,b])=>a.tier-b.tier||b.similarity-a.similarity);
 const best=matches[0]?.[1];return best?{tier:'T'+best.tier,setup:best.label,stage:best.stage}:null;
}
