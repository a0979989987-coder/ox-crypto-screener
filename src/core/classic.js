// The same implementation runs in classic scripts, ES modules, workers and Node.
import './classic-engine.js?v=20261001-classic1';
export const { CLASSIC_VERSION, CLASSIC_RULES, evaluateClassic, evaluateFrames, qualifyClassicRow, compareClassic, compactClassic } = globalThis.OXClassic;
