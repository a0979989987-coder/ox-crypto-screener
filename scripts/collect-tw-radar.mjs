import {writeFile} from 'node:fs/promises';
import {getOfficialTWRadar} from '../api/v1/tw/providers/radar.js';
import {validRadarSnapshot} from '../src/markets/tw/radar-snapshot.js';
const data=await getOfficialTWRadar({includeSurveillance:true,market:'ALL',limit:2000});
const saved={savedAt:Date.now(),data};
if(!validRadarSnapshot(saved))throw Error('Official membership incomplete; retain previous radar snapshot');
await writeFile(new URL('../data/tw-radar.json',import.meta.url),JSON.stringify(saved));
console.log(JSON.stringify({date:data.dataDate,rows:data.radar.length,risk:data.modes.risk.length,disposal:data.modes.disposal.length,release:data.modes.release.length}));
