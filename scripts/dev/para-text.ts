// Dev tool: print the full text of the numbered paragraphs given as arguments.
import { extractPdfLines } from '../lib/pdf-lines';
import { stripPageFurniture } from '../lib/strip-furniture';
import { splitIntoUnits } from '../lib/units';
import { SOURCE_PDF_FILE } from '../../src/engine/source-pdf';
const wanted = new Set(process.argv.slice(2));
const lines = stripPageFurniture(await extractPdfLines(`source/${SOURCE_PDF_FILE}`));
for (const u of splitIntoUnits(lines)) if (u.paragraphNumber && wanted.has(u.paragraphNumber)) console.log(`[${u.paragraphNumber} p${u.printedPage}] ${u.text.slice(0, 520)}\n`);
