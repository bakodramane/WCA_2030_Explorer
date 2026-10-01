// scripts/outline.ts
// Parse data/source-outline.md into src/data/outline.json — a machine-readable,
// ordered list of document-structure entries with printed page ranges:
// chapters, their sections and themes, annexes, the glossary, and references.
// Shared source of truth for deriveGroup() (A1) and the Phase B chunker (B2).
import fs from 'node:fs';
import path from 'node:path';

interface OutlineEntry {
  id: string;
  kind: 'chapter' | 'section' | 'annex' | 'glossary' | 'theme' | 'references';
  number: number;      // 0 for glossary / references / unnumbered sections
  title: string;
  printedStart: number;
  printedEnd: number;
  parentId: string | null;
  /** Paragraph range covered by a section, e.g. "2.8–2.10" (read from the Markdown hint). */
  paragraphs?: string;
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function parseTopLevel(md: string, entries: OutlineEntry[]): void {
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

  // "| Annex 4 | Additional Items of the WCA 2030 … | 134–172 |"
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

  const gm = md.match(/^## GLOSSARY OF TERMS \(pp\. (\d+)–(\d+)\)\s*$/m);
  if (gm) {
    entries.push({
      id: 'glossary', kind: 'glossary', number: 0, title: 'Glossary of Terms',
      printedStart: parseInt(gm[1], 10), printedEnd: parseInt(gm[2], 10),
      parentId: null,
    });
  }

  const rm = md.match(/^## REFERENCES AND FURTHER READING \(pp\. (\d+)–(\d+)\)\s*$/m);
  if (rm) {
    entries.push({
      id: 'references', kind: 'references', number: 0,
      title: 'References and Further Reading',
      printedStart: parseInt(rm[1], 10), printedEnd: parseInt(rm[2], 10),
      parentId: null,
    });
  }
}

/** Bullet sections given as a single "(p. N)" — their end is the next sibling's start (see extendBulletEnds). */
const singlePageBullets = new Set<string>();

function parseSections(md: string, entries: OutlineEntry[]): void {
  // Sections and themes, walked in document order under each chapter.
  // Two shapes occur inside "### Chapter N:" blocks:
  //   bullet lists:  "- Stakeholders' needs (p. 13)" / "… (pp. 17–21)"
  //   tables:       "| 4.3–4.5 | The Agricultural Holding … | 37–39 |"
  //                 "| Theme 2 | Land (total area, …) | 79–86 |"
  const bulletRe = /^- (.+?) \(pp?\. (\d+)(?:–(\d+))?\)(?: paragraphs: (\d+\.\d+–\d+\.\d+))?\s*$/;
  const rowRe    = /^\| ([^|]+?) \| ([^|]+?) \| (\d+)(?:–(\d+))? \|\s*$/;
  const numCellRe   = /^(\d+(?:\.\d+)?)(?:–(\d+(?:\.\d+)?))?$/;
  const themeCellRe = /^Theme (\d+)$/;

  let currentChapter: string | null = null;
  for (const line of md.split('\n')) {
    const cm = line.match(/^### Chapter (\d+):/);
    if (cm) { currentChapter = `ch${cm[1]}`; continue; }
    if (/^## /.test(line)) { currentChapter = null; continue; } // left the chapter blocks
    if (!currentChapter) continue;

    const bm = line.match(bulletRe);
    if (bm) {
      entries.push({
        id: `${currentChapter}-${slug(bm[1])}`,
        kind: 'section',
        number: 0,
        title: bm[1].trim(),
        printedStart: parseInt(bm[2], 10),
        printedEnd: bm[3] ? parseInt(bm[3], 10) : parseInt(bm[2], 10),
        parentId: currentChapter,
        ...(bm[4] ? { paragraphs: bm[4] } : {}),
      });
      if (!bm[3]) singlePageBullets.add(entries[entries.length - 1].id);
      continue;
    }

    const rm2 = line.match(rowRe);
    if (!rm2) continue;
    const left = rm2[1].trim();
    // Skip table header/separator rows and the Part One chapter summary table.
    if (/^-+$/.test(left) || /^Section$/i.test(left) || /^Chapter$/i.test(left)) continue;

    const start = parseInt(rm2[3], 10);
    const end = rm2[4] ? parseInt(rm2[4], 10) : start;

    const tm = left.match(themeCellRe);
    if (tm) {
      entries.push({
        id: `${currentChapter}-theme${tm[1]}`,
        kind: 'theme',
        number: parseInt(tm[1], 10),
        title: `Theme ${tm[1]}: ${rm2[2].trim()}`,
        printedStart: start,
        printedEnd: end,
        parentId: currentChapter,
      });
      continue;
    }

    const nm = left.match(numCellRe);
    if (nm) {
      entries.push({
        id: `${currentChapter}-${nm[1]}`,
        kind: 'section',
        number: parseFloat(nm[1]),
        title: rm2[2].trim(),
        printedStart: start,
        printedEnd: end,
        parentId: currentChapter,
      });
    }
    // Any other left cell (non-numeric, non-theme) is ignored.
  }
}

/** Themes of Annex 4 ("### Annex 4: themes" table), titled "Annex 4 · Theme n: …". */
function parseAnnexThemes(md: string, entries: OutlineEntry[]): void {
  const block = md.match(/^### Annex 4: themes[\s\S]*?(?=^---|^### |^## )/m)?.[0] ?? '';
  const rowRe = /^\| Theme (\d+) \| (.+?) \| (\d+)(?:–(\d+))? \|\s*$/gm;
  for (const m of block.matchAll(rowRe)) {
    const start = parseInt(m[3], 10);
    entries.push({
      id: `annex4-theme${m[1]}`,
      kind: 'theme',
      number: parseInt(m[1], 10),
      title: `Annex 4 · Theme ${m[1]}: ${m[2].trim()}`,
      printedStart: start,
      printedEnd: m[4] ? parseInt(m[4], 10) : start,
      parentId: 'annex4',
    });
  }
}

/** A bullet section's page ends where the next sibling begins (the heading may share that page). */
function extendBulletEnds(entries: OutlineEntry[]): void {
  for (const entry of entries) {
    if (!singlePageBullets.has(entry.id)) continue;
    const siblings = entries.filter(e => e.parentId === entry.parentId && (e.kind === 'section' || e.kind === 'theme'));
    const next = siblings[siblings.indexOf(entry) + 1];
    const chapter = entries.find(e => e.id === entry.parentId)!;
    entry.printedEnd = Math.max(entry.printedStart, next ? next.printedStart : chapter.printedEnd);
  }
}

function parseOutline(md: string): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  singlePageBullets.clear();
  parseTopLevel(md, entries);
  parseSections(md, entries);
  parseAnnexThemes(md, entries);
  extendBulletEnds(entries);
  return entries;
}


/** Check ordered, non-inverting ranges; siblings may share at most one
 *  boundary page (annexes and consecutive sections genuinely start on the
 *  page where the previous one ends). */
function checkOrderedSiblings(label: string, siblings: OutlineEntry[]): void {
  for (let i = 1; i < siblings.length; i++) {
    const prev = siblings[i - 1];
    const cur  = siblings[i];
    if (cur.printedStart < prev.printedStart) {
      throw new Error(`${label}: ${cur.id} starts (${cur.printedStart}) before ${prev.id} (${prev.printedStart})`);
    }
    if (cur.printedStart <= prev.printedEnd && cur.printedStart !== prev.printedEnd) {
      throw new Error(
        `${label}: ${cur.id} overlaps ${prev.id} by more than a shared boundary page ` +
        `(${cur.printedStart} ≤ ${prev.printedEnd})`,
      );
    }
  }
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
  for (const parent of ['ch7', 'annex4']) {
    const themes = entries.filter(e => e.kind === 'theme' && e.parentId === parent);
    if (themes.length !== 12) {
      throw new Error(`Expected 12 themes under ${parent}, found ${themes.length}`);
    }
  }

  // Top-level (chapters, annexes, glossary, references) must cover printed
  // pages 1..lastBodyPage contiguously.
  const top = entries
    .filter(e => ['chapter', 'annex', 'glossary', 'references'].includes(e.kind))
    .sort((a, b) => a.printedStart - b.printedStart);
  checkOrderedSiblings('top-level', top);
  if (top[0].printedStart !== 1) {
    throw new Error(`Top-level outline must start at printed page 1, starts at ${top[0].printedStart}`);
  }
  const lastPage = top[top.length - 1].printedEnd;
  for (let p = 1; p <= lastPage; p++) {
    const covered = top.some(e => p >= e.printedStart && p <= e.printedEnd);
    if (!covered) throw new Error(`Printed page ${p} is not covered by any top-level outline entry`);
  }

  // Sections/themes grouped by parent, in document order, must be ordered
  // and share at most a boundary page.
  const byParent = new Map<string, OutlineEntry[]>();
  for (const e of entries) {
    if (e.kind !== 'section' && e.kind !== 'theme') continue;
    if (!byParent.has(e.parentId!)) byParent.set(e.parentId!, []);
    byParent.get(e.parentId!)!.push(e);
  }
  for (const [parent, siblings] of byParent) {
    checkOrderedSiblings(`sections of ${parent}`, siblings);
  }

  // Section/theme parent ids must reference existing chapters or annexes.
  const chapterIds = new Set([...chapters, ...annexes].map(c => c.id));
  for (const e of entries) {
    if ((e.kind === 'section' || e.kind === 'theme') && !chapterIds.has(e.parentId!)) {
      throw new Error(`${e.id} has unknown parent ${e.parentId}`);
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

  const byKind = new Map<string, number>();
  for (const e of entries) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1);
  console.log(`Parsed ${entries.length} outline entries → ${outPath}`);
  for (const [kind, n] of byKind) console.log(`  ${kind.padEnd(10)} ${n}`);
}

try { main(); } catch (err) { console.error('Fatal:', err); process.exit(1); }
