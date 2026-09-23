import { TW_MODULE_CONFIG } from "./config.js";
// Taiwan equity data requires a selected, compliant server-side source before activation.
export const twProvider = Object.freeze({ id: TW_MODULE_CONFIG.provider, secretRequired: true, available: false });
