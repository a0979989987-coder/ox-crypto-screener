import { MARKET_IDS } from "../core/config.js";

export function createMarketRouter() {
  const modules = new Map();
  let active = null;

  return Object.freeze({
    register(module) {
      if (!module?.id || !MARKET_IDS.includes(module.id)) throw new Error("Invalid OX market module");
      modules.set(module.id, module);
      return module;
    },
    get(id) { return modules.get(id) || null; },
    list() { return [...modules.values()]; },
    async activate(id, context = {}) {
      const next = modules.get(id);
      if (!next) return false;
      if (active && active !== next) await active.deactivate?.(context);
      active = next;
      await next.activate?.(context);
      return true;
    },
    current() { return active?.id || null; }
  });
}

export const marketRouter = createMarketRouter();
