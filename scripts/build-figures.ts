import fs from 'node:fs';
import path from 'node:path';
import { extractPdfLines } from './lib/pdf-lines';
import { stripPageFurniture } from './lib/strip-furniture';
import { SOURCE_PDF_FILE } from '../src/engine/source-pdf';

interface FigureTableRow {
  ref: string;
  title: string;
  page: number;
  kind: 'figure' | 'table';
}

const CAPTION = /^(FIGURE|TABLE)\s+([A-Z]?\d+\.\d+)\s+(.+)$/;
const CONTINUED = /\(Continued\)$/i;
const ACRONYMS = ['WCA', 'SDG'];

function sentenceCase(title: string): string {
  let result = title.toLowerCase().replace(/^[a-z]/, letter => letter.toUpperCase());
  for (const acronym of ACRONYMS) {
    result = result.replace(new RegExp(`\\b${acronym.toLowerCase()}\\b`, 'g'), acronym);
  }
  return result.replace(/’/g, "'");
}

export async function extractFiguresTables(pdfPath: string): Promise<FigureTableRow[]> {
  const lines = stripPageFurniture(await extractPdfLines(pdfPath));
  const rows: FigureTableRow[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].text.match(CAPTION);
    if (!match || CONTINUED.test(lines[index].text)) continue;
    const kind = match[1].toLowerCase() as 'figure' | 'table';
    const ref = match[2];
    const key = `${kind}:${ref}`;
    if (seen.has(key)) continue;

    let title = match[3];
    const next = lines[index + 1];
    if (
      next?.printedPage === lines[index].printedPage &&
      /^AND\s+/.test(next.text) &&
      /^[A-Z][A-Z\s'’–-]+$/.test(next.text) &&
      !/^(SOURCE|NOTE):/.test(next.text)
    ) title += ` ${next.text}`;

    seen.add(key);
    rows.push({ ref, title: sentenceCase(title), page: lines[index].printedPage, kind });
  }

  return rows.sort((a, b) =>
    (a.kind === b.kind ? a.page - b.page : a.kind === 'figure' ? -1 : 1));
}

async function main(): Promise<void> {
  const pdfPath = path.join(process.cwd(), 'source', SOURCE_PDF_FILE);
  const outPath = path.join(process.cwd(), 'public', 'data', 'figures-tables.json');
  const rows = await extractFiguresTables(pdfPath);
  fs.writeFileSync(outPath, `${JSON.stringify(rows, null, 2)}\n`, 'utf-8');
  console.log(`Extracted ${rows.length} figure/table captions → ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => { console.error('Fatal:', error); process.exitCode = 1; });
}
