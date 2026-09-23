import { twProvider } from "./api.js";
export function createTWMarketState() { return Object.freeze({ market: "tw", status: "placeholder", provider: twProvider.id, data: null }); }
