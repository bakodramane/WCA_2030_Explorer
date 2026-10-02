import { extractPdfLines } from '../lib/pdf-lines';
import { stripPageFurniture } from '../lib/strip-furniture';
import { splitIntoUnits } from '../lib/units';
import { SOURCE_PDF_FILE } from '../../src/engine/source-pdf';
const [from, to, step, offset] = process.argv.slice(2).map(Number);
const lines = stripPageFurniture(await extractPdfLines(`source/${SOURCE_PDF_FILE}`));
const units = splitIntoUnits(lines).filter(u => u.paragraphNumber && Number(u.paragraphNumber.split('.')[0]) >= from && Number(u.paragraphNumber.split('.')[0]) <= to);
let k = 0;
for (const u of units) { if (k++ % step !== offset) continue; console.log(`${u.paragraphNumber} p${u.printedPage} ${u.text.slice(u.paragraphNumber!.length + 1, u.paragraphNumber!.length + 190)}`); }
