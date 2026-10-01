// Export a genuine private closing bundle for a user's browser-only workspace.
// Output must stay outside the public repository; never commit market history.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const option = name => { const index=process.argv.indexOf(name); return index<0?null:process.argv[index+1]; };
const input = option('--input'), output = option('--output');
if (!input || !output) throw Error('Usage: node scripts/export-us-device-eod.mjs --input /private/bundle.json --output /private/OX_US_EOD.json');
const root = resolve(new URL('..', import.meta.url).pathname), destination = resolve(output);
if (destination === root || destination.startsWith(root + '/')) throw Error('Personal OHLCV must remain outside the public repository.');
const bundle = JSON.parse(await readFile(input, 'utf8'));
if (bundle.schemaVersion !== 2 || bundle.mode !== 'eod' || !bundle.privateValidation || !bundle.histories?.SPY)
  throw Error('Expected a genuine private closing bundle including SPY history.');
const reference = JSON.parse(await readFile(new URL('../data/us-directory.json', import.meta.url), 'utf8'));
const packet = { format:'ox-us-device-eod', version:1, mode:'eod', provider:'Finance Query / Yahoo · 個人盤後資料',
  sessionDate:bundle.sessionDate, collectedAt:bundle.createdAt,
  directory:reference.items.filter(item => Object.hasOwn(bundle.histories, item.symbol)), histories:bundle.histories };
await writeFile(destination, JSON.stringify(packet));
console.log(JSON.stringify({ output:destination, sessionDate:packet.sessionDate, symbols:Object.keys(packet.histories).length }));
