// The same implementation runs in classic scripts, ES modules, workers and Node.
import './classic-engine.js?v=20261001-classic5';
export const { CLASSIC_VERSION, CLASSIC_TIER_LIMITS, CLASSIC_RULES, evaluateClassic, evaluateFrames, qualifyClassicRow, compareClassic, compactClassic, rankClassicTiers } = globalThis.OXClassic;
