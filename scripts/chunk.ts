import fs from 'node:fs';
import path from 'node:path';
import OUTLINE_JSON from '../src/data/outline.json';
import {
  assignUnitsToSections,
  type ChunkOutlineEntry,
} from './lib/assign-section';
import { packUnits } from './lib/pack';
import { extractPdfLines } from './lib/pdf-lines';
import { stripPageFurniture } from './lib/strip-furniture';
import { splitIntoUnits } from './lib/units';

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

async function main(): Promise<void> {
  const pdfPath = path.join(process.cwd(), 'source', 'Census-2030_EN-DTP-9.pdf');
  const outPath = path.join(process.cwd(), 'src', 'data', 'chunks-raw.json');
  const outline = OUTLINE_JSON as ChunkOutlineEntry[];
  const glossary = outline.find(entry => entry.kind === 'glossary');
  if (!glossary) throw new Error('Glossary range is missing from outline.json');

  console.log(`Reading: ${pdfPath}`);
  const extracted = await extractPdfLines(pdfPath);
  const cleaned = stripPageFurniture(extracted);
  const units = splitIntoUnits(cleaned, {
    isGlossaryPage: page => page >= glossary.printedStart && page <= glossary.printedEnd,
  });
  const assigned = assignUnitsToSections(units, outline);
  const chunks = packUnits(assigned);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(chunks, null, 2)}\n`, 'utf-8');

  const counts = chunks.map(chunk => wordCount(chunk.text));
  const inTarget = counts.filter(count => count >= 150 && count <= 350).length;
  const titles = new Set(chunks.map(chunk => chunk.sectionTitle));
  const withParagraph = chunks.filter(chunk => chunk.paragraphs.length > 0).length;
  const high = chunks.filter(chunk => chunk.priority === 'high').length;
  console.log(`Extracted lines : ${extracted.length}`);
  console.log(`Cleaned lines   : ${cleaned.length}`);
  console.log(`Units           : ${units.length}`);
  console.log(`Chunks          : ${chunks.length}`);
  console.log(`150–350 words   : ${inTarget}/${chunks.length} (${(inTarget / chunks.length * 100).toFixed(1)}%)`);
  console.log(`Maximum words   : ${Math.max(...counts)}`);
  console.log(`Distinct titles : ${titles.size}`);
  console.log(`With paragraph  : ${withParagraph}/${chunks.length} (${(withParagraph / chunks.length * 100).toFixed(1)}%)`);
  console.log(`High priority   : ${high}/${chunks.length} (${(high / chunks.length * 100).toFixed(1)}%)`);
  console.log(`Written → ${outPath}`);
}

main().catch(error => {
  console.error('Fatal:', error);
  process.exitCode = 1;
});
