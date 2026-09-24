import { FOREX_SESSION } from "./config.js";

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short", hour: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  return {
    day: parts.find(part => part.type === "weekday")?.value,
    hour: Number(parts.find(part => part.type === "hour")?.value)
  };
}

// Session windows are indicative, not a broker's liquidity or volume feed.
// Local clocks account for London / New York daylight saving time.
export function getForexSession(now = new Date()) {
  const ny = localParts(now, "America/New_York");
  const london = localParts(now, "Europe/London");
  const tokyo = localParts(now, "Asia/Tokyo");
  const closed = ny.day === "Sat" || (ny.day === "Fri" && ny.hour >= 17) || (ny.day === "Sun" && ny.hour < 17);
  if (closed) return { id: FOREX_SESSION.CLOSED, label: "市場休市", activity: "closed" };

  const londonOpen = london.hour >= 8 && london.hour < 17;
  const nyOpen = ny.hour >= 8 && ny.hour < 17;
  const tokyoOpen = tokyo.hour >= 9 && tokyo.hour < 18;
  if (londonOpen && nyOpen) return { id: FOREX_SESSION.OVERLAP, label: "倫敦 × 紐約重疊", activity: "high" };
  if (londonOpen) return { id: FOREX_SESSION.LONDON, label: "倫敦時段", activity: "high" };
  if (nyOpen) return { id: FOREX_SESSION.NEW_YORK, label: "紐約時段", activity: "high" };
  if (tokyoOpen) return { id: FOREX_SESSION.ASIA, label: "亞洲時段", activity: "medium" };
  return { id: FOREX_SESSION.LOW_LIQUIDITY, label: "主要時段交接", activity: "low" };
}
