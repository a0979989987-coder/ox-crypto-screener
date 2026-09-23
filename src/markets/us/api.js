import { US_MODULE_CONFIG } from "./config.js";
// A production US market feed needs a licensed server-side provider or proxy.
export const usProvider = Object.freeze({ id: US_MODULE_CONFIG.provider, secretRequired: true, available: false });
