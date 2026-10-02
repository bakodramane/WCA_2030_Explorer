// Dev tool: carry data/source-outline.md over to a new edition of the guidelines PDF.
// Every printed page number in the outline is remapped by locating the old page's opening text
// (for range starts) or closing text (for range ends) in the new PDF.
// Usage: npx tsx scripts/dev/remap-outline.ts <old.pdf> [--write]
import fs from 'node:fs';
import path from 'node:path';
import { extractPdfLines } from '../lib/pdf-lines';
import { stripPageFurniture } from '../lib/strip-furniture';
import { SOURCE_PDF_FILE } from '../../src/engine/source-pdf';

const SHINGLE = 8;
const words = (s: string): string[] =>
  s.toLowerCase().replace(/is(e|ed|es|ing|ation)\b/g, 'iz$1').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

async function pageWords(pdf: string): Promise<Map<number, string[]>> {
  const pages = new Map<number, string[]>();
  for (const l of stripPageFurniture(await extractPdfLines(pdf))) {
    if (l.printedPage < 1) continue;
    if (!pages.has(l.printedPage)) pages.set(l.printedPage, []);
    pages.get(l.printedPage)!.push(...words(l.text));
  }
  return pages;
}

async function main(): Promise<void> {
  const [oldPdf] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!oldPdf) throw new Error('usage: remap-outline.ts <old.pdf> [--write]');
  const oldPages = await pageWords(oldPdf);
  const newPages = await pageWords(path.join(process.cwd(), 'source', SOURCE_PDF_FILE));

  // Index the new edition: shingle -> every printed page it occurs on. A re-typeset edition only moves
  // text forward by a few pages, so a match must fall within MAX_SHIFT pages of the old page; this stops
  // repeated phrases (running text quoted elsewhere, item boilerplate) from matching the wrong page.
  const MAX_SHIFT = 4;
  const where = new Map<string, number[]>();
  for (const [p, ws] of newPages) {
    for (let i = 0; i + SHINGLE <= ws.length; i++) {
      const key = ws.slice(i, i + SHINGLE).join(' ');
      (where.get(key) ?? where.set(key, []).get(key)!).push(p);
    }
  }
  const locate = (ws: string[], fromEnd: boolean, oldPage: number): number | null => {
    const n = ws.length - SHINGLE;
    for (let k = 0; k <= n; k++) {
      const i = fromEnd ? n - k : k;
      const hits = (where.get(ws.slice(i, i + SHINGLE).join(' ')) ?? []).filter(q => q >= oldPage && q <= oldPage + MAX_SHIFT);
      if (hits.length) return fromEnd ? Math.max(...hits) : Math.min(...hits);
    }
    return null;
  };

  const lastOld = Math.max(...oldPages.keys());
  const cache = new Map<string, number>();
  const map = (p: number, role: 'start' | 'end'): number => {
    const key = `${p}:${role}`;
    if (cache.has(key)) return cache.get(key)!;
    // Pages without locatable text (dividers, figures) borrow the nearest locatable neighbour's shift.
    for (let d = 0; d <= 6; d++) {
      for (const q of role === 'start' ? [p + d, p - d] : [p - d, p + d]) {
        if (q < 1 || q > lastOld) continue;
        const hit = locate(oldPages.get(q) ?? [], role === 'end', q);
        if (hit !== null) { const r = hit - (q - p); cache.set(key, r); return r; }
      }
    }
    throw new Error(`cannot locate old page ${p}`);
  };

  const mdPath = path.join(process.cwd(), 'data', 'source-outline.md');
  const out = fs.readFileSync(mdPath, 'utf-8').split('\n').map(line => {
    // "(p. N)" / "(pp. N–M)" in headings and bullets; trailing "| N |" / "| N–M |" in tables.
    let l = line.replace(/\((pp?)\. (\d+)(?:–(\d+))?\)/g, (_m, pp: string, a: string, b?: string) => {
      const s = map(+a, 'start'), e = b ? map(+b, 'end') : null;
      return e !== null && e !== s ? `(pp. ${s}–${e})` : `(${pp === 'pp' && e === null ? 'pp' : 'p'}. ${s})`;
    });
    l = l.replace(/\| (\d+)(?:–(\d+))? \|\s*$/, (_m, a: string, b?: string) => {
      const s = map(+a, 'start'), e = b ? map(+b, 'end') : null;
      return e !== null && e !== s ? `| ${s}–${e} |` : `| ${s} |`;
    });
    return l;
  });
  const result = out.join('\n');
  if (process.argv.includes('--write')) { fs.writeFileSync(mdPath, result, 'utf-8'); console.log(`rewrote ${mdPath}`); }
  else process.stdout.write(result);
}

main().catch(err => { console.error(err); process.exit(1); });
