import { extractPdfLines } from '../lib/pdf-lines';
import { stripPageFurniture } from '../lib/strip-furniture';
import { splitIntoUnits } from '../lib/units';
const [from, to, step, offset] = process.argv.slice(2).map(Number);
const lines = stripPageFurniture(await extractPdfLines('source/Census-2030_EN-DTP-9.pdf'));
const units = splitIntoUnits(lines).filter(u => u.paragraphNumber && Number(u.paragraphNumber.split('.')[0]) >= from && Number(u.paragraphNumber.split('.')[0]) <= to);
let k = 0;
for (const u of units) { if (k++ % step !== offset) continue; console.log(`${u.paragraphNumber} p${u.printedPage} ${u.text.slice(u.paragraphNumber!.length + 1, u.paragraphNumber!.length + 190)}`); }
