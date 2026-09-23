import { usProvider } from "./api.js";
export const createUSMarketState = () => Object.freeze({ status: "placeholder", provider: usProvider.id, data: null });
