import { FOREX_SESSION } from "./config.js";

// UTC windows are explicit; a DST-aware exchange calendar can replace this adapter later.
export function getForexSession(now = new Date()) {
  const day = now.getUTCDay(), hour = now.getUTCHours();
  if (day === 6 || (day === 0 && hour < 22) || (day === 5 && hour >= 22)) return { id: FOREX_SESSION.CLOSED, label: "市場休市", activity: "closed" };
  if (hour >= 12 && hour < 16) return { id: FOREX_SESSION.OVERLAP, label: "倫敦 × 紐約重疊", activity: "high" };
  if (hour >= 7 && hour < 12) return { id: FOREX_SESSION.LONDON, label: "倫敦時段", activity: "high" };
  if (hour >= 16 && hour < 21) return { id: FOREX_SESSION.NEW_YORK, label: "紐約時段", activity: "high" };
  if (hour < 7) return { id: FOREX_SESSION.ASIA, label: "亞洲時段", activity: "medium" };
  return { id: FOREX_SESSION.LOW_LIQUIDITY, label: "低流動性時段", activity: "low" };
}
