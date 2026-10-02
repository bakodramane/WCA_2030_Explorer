import fs from 'node:fs';
import path from 'node:path';
import { extractPdfLines } from './lib/pdf-lines';
import { stripPageFurniture } from './lib/strip-furniture';
import { SOURCE_PDF_FILE } from '../src/engine/source-pdf';
import OUTLINE_JSON from '../src/data/outline.json';

// The glossary's printed page range comes from the outline, so a re-typeset edition only needs
// data/source-outline.md updated.
const GLOSSARY = (OUTLINE_JSON as Array<{ id: string; kind: string; printedStart: number; printedEnd: number }>)
  .find(e => e.kind === 'glossary')!;

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
    .filter(line => line.printedPage >= GLOSSARY.printedStart && line.printedPage <= GLOSSARY.printedEnd)
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
      term = match[1].replace(/\s+/g, ' ').trim();
      parts = [match[2]];
    } else if (term) {
      parts.push(line.text);
    }
  }
  flush();
  return rows.sort((left, right) => left.term.localeCompare(right.term, 'en'));
}

async function main(): Promise<void> {
  const pdfPath = path.join(process.cwd(), 'source', SOURCE_PDF_FILE);
  const outPath = path.join(process.cwd(), 'public', 'data', 'glossary.json');
  const rows = await extractGlossary(pdfPath);
  fs.writeFileSync(outPath, `${JSON.stringify(rows, null, 2)}\n`, 'utf-8');
  console.log(`Extracted ${rows.length} glossary entries → ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => { console.error('Fatal:', error); process.exitCode = 1; });
}
