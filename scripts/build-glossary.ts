import fs from 'node:fs';
import path from 'node:path';
import { extractPdfLines } from './lib/pdf-lines';
import { stripPageFurniture } from './lib/strip-furniture';

interface GlossaryRow {
  term: string;
  definition: string;
  reference: string;
}

const ENTRY_START = /^([A-Z][^:]{1,80}):\s+(.+)/;
const REFERENCE = /\((paragraphs? [^)]+|Annex [^)]+)\)\.?$/i;

function referenceFromDefinition(definition: string): string {
  return definition.match(REFERENCE)?.[1] ?? '';
}

export async function extractGlossary(pdfPath: string): Promise<GlossaryRow[]> {
  const lines = stripPageFurniture(await extractPdfLines(pdfPath))
    .filter(line => line.printedPage >= 201 && line.printedPage <= 207)
    .filter(line => line.text !== 'GLOSSARY OF TERMS');
  const rows: GlossaryRow[] = [];
  let term = '';
  let parts: string[] = [];

  const flush = (): void => {
    if (!term) return;
    const definition = parts.join(' ').replace(/\s+/g, ' ').trim();
    rows.push({ term, definition, reference: referenceFromDefinition(definition) });
  };

  for (const line of lines) {
    const match = line.text.match(ENTRY_START);
    if (match) {
      flush();
      term = match[1];
      parts = [match[2]];
    } else if (term) {
      parts.push(line.text);
    }
  }
  flush();
  return rows.sort((left, right) => left.term.localeCompare(right.term, 'en'));
}

async function main(): Promise<void> {
  const pdfPath = path.join(process.cwd(), 'source', 'Census-2030_EN-DTP-9.pdf');
  const outPath = path.join(process.cwd(), 'public', 'data', 'glossary.json');
  const rows = await extractGlossary(pdfPath);
  fs.writeFileSync(outPath, `${JSON.stringify(rows, null, 2)}\n`, 'utf-8');
  console.log(`Extracted ${rows.length} glossary entries → ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => { console.error('Fatal:', error); process.exitCode = 1; });
}
