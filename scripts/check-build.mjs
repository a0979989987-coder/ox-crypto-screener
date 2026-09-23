import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const errors = [];

const localRefs = [...html.matchAll(/(?:src|href)="(src\/[^"]+)"/g)].map(match => match[1]);
for (const ref of localRefs) {
  if (!existsSync(resolve(root, ref))) errors.push(`Missing local asset: ${ref}`);
}

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) errors.push(`Duplicate HTML ids: ${duplicateIds.join(", ")}`);
if (/<style(?:\s|>)/i.test(html)) errors.push("Inline style blocks remain in index.html");
if (/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html)) errors.push("Inline script blocks remain in index.html");
if (!html.includes("v4.0-modular-classified-rc2")) errors.push("Build marker is missing");
if (!html.includes('data-market-choice="forex"')) errors.push("Forex market switch is missing");
if (!html.includes('type="module" src="src/app/app.js"')) errors.push("Modular entry is missing");
if (/src\/(?:legacy\/|styles\/legacy\.css)/.test(html)) errors.push("Legacy bundle references remain");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Build check passed: ${localRefs.length} local assets, ${ids.length} unique ids`);
