// scripts/outline.ts
// Parse data/source-outline.md into src/data/outline.json — a machine-readable,
// ordered list of document-structure entries with printed page ranges.
// Shared source of truth for deriveGroup() (A1) and the Phase B chunker (B2).
import fs from 'node:fs';
import path from 'node:path';

interface OutlineEntry {
  id: string;
  kind: 'chapter' | 'annex' | 'glossary' | 'references';
  number: number;      // 0 for glossary / references
  title: string;
  printedStart: number;
  printedEnd: number;
  parentId: string | null;
}

function parseOutline(md: string): OutlineEntry[] {
  const entries: OutlineEntry[] = [];

  // "### Chapter 4: Concepts and Definitions (pp. 37–46)"
  const chapterRe = /^### Chapter (\d+): (.+?) \(pp\. (\d+)–(\d+)\)\s*$/gm;
  for (const m of md.matchAll(chapterRe)) {
    entries.push({
      id: `ch${m[1]}`,
      kind: 'chapter',
      number: parseInt(m[1], 10),
      title: m[2].trim(),
      printedStart: parseInt(m[3], 10),
      printedEnd: parseInt(m[4], 10),
      parentId: parseInt(m[1], 10) <= 3 ? 'part-one' : 'part-two',
    });
  }

  // "| Annex 4 | Additional Items of the WCA 2030 (by theme, Themes 1–12) | 134–172 |"
  const annexRe = /^\| Annex (\d+) \| (.+?) \| (\d+)(?:–(\d+))? \|\s*$/gm;
  for (const m of md.matchAll(annexRe)) {
    const start = parseInt(m[3], 10);
    entries.push({
      id: `annex${m[1]}`,
      kind: 'annex',
      number: parseInt(m[1], 10),
      title: m[2].trim(),
      printedStart: start,
      printedEnd: m[4] ? parseInt(m[4], 10) : start,
      parentId: 'annexes',
    });
  }

  // "## GLOSSARY OF TERMS (pp. 201–207)"
  const glossaryRe = /^## GLOSSARY OF TERMS \(pp\. (\d+)–(\d+)\)\s*$/m;
  const gm = md.match(glossaryRe);
  if (gm) {
    entries.push({
      id: 'glossary',
      kind: 'glossary',
      number: 0,
      title: 'Glossary of Terms',
      printedStart: parseInt(gm[1], 10),
      printedEnd: parseInt(gm[2], 10),
      parentId: null,
    });
  }

  // "## REFERENCES AND FURTHER READING (pp. 208–216)"
  const refsRe = /^## REFERENCES AND FURTHER READING \(pp\. (\d+)–(\d+)\)\s*$/m;
  const rm = md.match(refsRe);
  if (rm) {
    entries.push({
      id: 'references',
      kind: 'references',
      number: 0,
      title: 'References and Further Reading',
      printedStart: parseInt(rm[1], 10),
      printedEnd: parseInt(rm[2], 10),
      parentId: null,
    });
  }

  return entries.sort((a, b) => a.printedStart - b.printedStart);
}

function validate(entries: OutlineEntry[]): void {
  const chapters = entries.filter(e => e.kind === 'chapter');
  const annexes  = entries.filter(e => e.kind === 'annex');
  if (chapters.length !== 10) {
    throw new Error(`Expected 10 chapters, found ${chapters.length}`);
  }
  if (annexes.length !== 11) {
    throw new Error(`Expected 11 annexes, found ${annexes.length}`);
  }
  if (!entries.some(e => e.kind === 'glossary'))  throw new Error('Glossary entry not found');
  if (!entries.some(e => e.kind === 'references')) throw new Error('References entry not found');

  // Ordered, non-inverting ranges. Adjacent ranges may share a boundary page
  // (a new annex can start on the page where the previous one ends — e.g.
  // Annex 6/7 share printed page 181 in this document); B1 will verify the
  // exact split against the PDF's own table of contents.
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].printedStart < entries[i - 1].printedEnd) {
      throw new Error(
        `Ranges are unordered: ${entries[i - 1].id} ends at ` +
        `${entries[i - 1].printedEnd} but ${entries[i].id} starts at ${entries[i].printedStart}`,
      );
    }
    if (entries[i].printedStart === entries[i - 1].printedEnd) {
      console.warn(
        `Note: ${entries[i - 1].id} and ${entries[i].id} share printed page ${entries[i].printedStart}`,
      );
    }
  }
}

function main(): void {
  const srcPath = path.join(process.cwd(), 'data', 'source-outline.md');
  if (!fs.existsSync(srcPath)) throw new Error(`Outline source not found: ${srcPath}`);

  const md = fs.readFileSync(srcPath, 'utf-8');
  const entries = parseOutline(md);
  validate(entries);

  const outPath = path.join(process.cwd(), 'src', 'data', 'outline.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(entries, null, 2) + '\n', 'utf-8');

  console.log(`Parsed ${entries.length} outline entries → ${outPath}`);
  for (const e of entries) {
    console.log(`  ${e.id.padEnd(10)} pp. ${e.printedStart}–${e.printedEnd}  ${e.title}`);
  }
}

try { main(); } catch (err) { console.error('Fatal:', err); process.exit(1); }
