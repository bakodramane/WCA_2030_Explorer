import { PDFParse } from 'pdf-parse';
import fs from 'node:fs';
import path from 'node:path';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Chunk {
  id: string;
  sectionTitle: string;
  /** Page in the source PDF file (1-based). */
  pdfPage: number;
  /** Printed page as shown in the document's own running footer (pdfPage − 14). */
  printedPage: number;
  /** @deprecated Alias of `printedPage`. Kept until Phase B retires it. */
  pageRef: number;
  text: string;
  priority: 'high' | 'normal';
}

// ── Page numbering ─────────────────────────────────────────────────────────────
// The document has two page systems: PDF pages (1–230) and the printed pages
// shown in the running footer, which are what the document itself cites and
// what every UI citation must display. Verified by sampling the main body,
// annexes, and glossary (§0.3 of the improvement brief): the offset is
// uniform, printed = PDF − 14 everywhere.

const PAGE_OFFSET = 14;

// ── High-priority page regions (approximate; Glossary set dynamically) ────────
// NOTE: these ranges are in PDF pages. Phase B (B2) replaces them with
// outline-driven priority; until then keep them on the PDF scale so the
// behaviour is unchanged.

const STATIC_HIGH_RANGES: Array<[number, number]> = [
  [55, 70],   // Chapter 4 — Concepts & Definitions
  [100, 140], // Chapter 7 — Essential Items
  [168, 185], // Annex 4 — Additional Items
];

function isHighPriority(pdfPage: number, totalPages: number): boolean {
  const glossaryStart = Math.max(1, totalPages - 30);
  return (
    STATIC_HIGH_RANGES.some(([lo, hi]) => pdfPage >= lo && pdfPage <= hi) ||
    pdfPage >= glossaryStart
  );
}

// ── Heading detection ──────────────────────────────────────────────────────────
// This PDF has virtually no blank lines (4 in 10 053 lines), so the
// blank-line context rule cannot be applied.  Instead:
//
//  (1) Pattern: CHAPTER/ANNEX/GLOSSARY keywords, or an ALL-CAPS-only line.
//      Numbered paragraph openers (4.24 Countries need to…) are NOT treated
//      as headings because they always exceed 80 chars in this document.
//  (2) Under 80 characters — already blocks all paragraph openers.
//  (3) For ALL-CAPS lines: the *next* line must NOT also be ALL-CAPS.
//      This rejects multi-line title fragments (WORLD PROGRAMME / FOR THE
//      CENSUS / OF AGRICULTURE 2030) while accepting standalone headings
//      whose following line is always body text or a paragraph number.
//      CHAPTER/ANNEX/GLOSSARY are unambiguous and skip this guard.
//
// Running headers that survive (1)-(3) are removed by the frequency filter.

function isHeadingPattern(line: string, nextLine: string): boolean {
  const t = line.trim();

  // (2) hard 80-char ceiling
  if (!t || t.length < 2 || t.length >= 80) return false;

  // CHAPTER / ANNEX: "CHAPTER 4", "ANNEX 4.", "Chapter 4: ..."
  if (/^(CHAPTER|ANNEX)\s+\d+/i.test(t)) return true;

  // Stand-alone structural keywords
  if (/^(GLOSSARY|APPENDIX)\s*(\d*\.?)(\s|$)/i.test(t)) return true;

  // ALL-CAPS line: starts with a letter, contains only uppercase, digits,
  // spaces and common punctuation.
  if (/^[A-Z][A-Z0-9\s\-\/&,.()']+$/.test(t)) {
    // (3) reject if the next non-blank line is ALSO all-caps
    // (this line is a fragment of a multi-line title, not a standalone heading)
    const n = nextLine.trim();
    if (n && /^[A-Z][A-Z0-9\s\-\/&,.()']+$/.test(n) && n.length < 80) return false;
    return true;
  }

  return false;
}

// ── Paragraph boundary detection ──────────────────────────────────────────────
// Lines starting with "N.N " or "N.N.N " are numbered paragraph openers.
// They serve as natural chunk split points but inherit the title of the last
// ALL-CAPS heading rather than becoming new section titles themselves.

function isParaBoundary(line: string): boolean {
  return /^\d+\.\d+(\.\d+)?\s+\S/.test(line);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Sliding-window chunker: 200–350 words, 50-word overlap
function makeChunks(
  bodyText: string,
  pdfPage: number,
  sectionTitle: string,
  priority: 'high' | 'normal',
  sectionIdx: number,
): Chunk[] {
  const printedPage = pdfPage - PAGE_OFFSET;
  const words = bodyText.trim().split(/\s+/).filter(Boolean);
  if (words.length < 8) return [];

  const MAX = 300;
  const OVERLAP = 50;
  const STEP = MAX - OVERLAP; // 250

  const chunks: Chunk[] = [];
  let pos = 0;
  let part = 0;

  while (pos < words.length) {
    const slice = words.slice(pos, pos + MAX);
    chunks.push({
      id: `s${sectionIdx}-p${part}`,
      sectionTitle,
      pdfPage,
      printedPage,
      pageRef: printedPage, // deprecated alias of printedPage
      text: slice.join(' '),
      priority,
    });
    part++;
    if (pos + MAX >= words.length) break;
    pos += STEP;
  }

  return chunks;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const pdfPath = path.join(process.cwd(), 'source', 'Census-2030_EN-DTP-9.pdf');
  if (!fs.existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`);

  console.log(`Reading: ${pdfPath}`);
  const buffer = fs.readFileSync(pdfPath);

  // pdf-parse v2: PDFParse class, getText() returns per-page text with lineEnforce
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();

  const totalPages = result.total;
  console.log(`Pages extracted: ${totalPages} (via pdf-parse v2 getText)`);

  // ── Build sections ────────────────────────────────────────────────────────
  // Walk every line of every page; heading lines start a new section.
  // Body lines accumulate under the current section.

  type Section = { title: string; pdfPage: number; body: string[] };

  const sections: Section[] = [{ title: 'Front Matter', pdfPage: 1, body: [] }];

  // Track heading occurrence counts to skip running headers (appear > 8 pages)
  const headingCounts = new Map<string, number>();

  // First pass: count how often each heading candidate appears across pages.
  // Running headers repeat on many pages; genuine headings appear rarely.
  // Front matter and the table of contents (printed page ≤ 0, i.e. PDF pages
  // 1–14) are excluded outright — see A1/B2 of the improvement brief.
  for (const page of result.pages) {
    if (page.num <= PAGE_OFFSET) continue; // front matter / ToC
    const lines = page.text.split('\n');
    const seen = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const nextLine = (lines[i + 1] ?? '').trim();
      if (line && isHeadingPattern(line, nextLine) && !seen.has(line)) {
        seen.add(line);
        headingCounts.set(line, (headingCounts.get(line) ?? 0) + 1);
      }
    }
  }

  // Second pass: build sections + paragraph sub-sections.
  //
  // ALL-CAPS headings (count ≤ 8) start a new named section and update
  // currentTitle.  Numbered paragraph openers (4.24 …) start a new sub-section
  // under currentTitle — they split the body for chunking without becoming titles
  // themselves.  All other lines are appended to the current section body.
  let currentTitle = 'Front Matter';
  for (const page of result.pages) {
    if (page.num <= PAGE_OFFSET) continue; // front matter / ToC
    const lines = page.text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const nextLine = (lines[i + 1] ?? '').trim();
      if (isHeadingPattern(line, nextLine) && (headingCounts.get(line) ?? 0) <= 8) {
        currentTitle = line;
        sections.push({ title: line, pdfPage: page.num, body: [] });
      } else if (isParaBoundary(line)) {
        // Start a new sub-section under the current ALL-CAPS heading
        sections.push({ title: currentTitle, pdfPage: page.num, body: [line] });
      } else {
        sections[sections.length - 1].body.push(line);
      }
    }
  }

  console.log(`Sections detected: ${sections.length}`);

  // ── Produce chunks ────────────────────────────────────────────────────────
  const allChunks: Chunk[] = [];

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const bodyText = sec.body.join(' ').replace(/\s{2,}/g, ' ').trim();
    if (bodyText.length < 30) continue; // skip near-empty sections

    const priority: 'high' | 'normal' = isHighPriority(sec.pdfPage, totalPages)
      ? 'high'
      : 'normal';

    allChunks.push(...makeChunks(bodyText, sec.pdfPage, sec.title, priority, i));
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const highCount = allChunks.filter(c => c.priority === 'high').length;
  const wcs = allChunks.map(c => wordCount(c.text));
  const avgWC = wcs.reduce((a, b) => a + b, 0) / (wcs.length || 1);
  const maxWC = Math.max(...wcs);
  const pageNums = allChunks.map(c => c.printedPage);

  console.log('\n─── Chunk Summary ───────────────────────────────────────');
  console.log(`Total chunks    : ${allChunks.length}`);
  console.log(`High-priority   : ${highCount} (${((highCount / allChunks.length) * 100).toFixed(1)}%)`);
  console.log(`Avg word count  : ${Math.round(avgWC)} words`);
  console.log(`Max word count  : ${maxWC} words`);
  console.log(`Printed pages   : ${Math.min(...pageNums)}–${Math.max(...pageNums)} of ${totalPages - PAGE_OFFSET}`);
  console.log(`Front matter    : PDF pp. 1–${PAGE_OFFSET} excluded (printed page ≤ 0)`);
  console.log('─────────────────────────────────────────────────────────\n');

  // ── Write output ──────────────────────────────────────────────────────────
  const outPath = path.join(process.cwd(), 'src', 'data', 'chunks-raw.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(allChunks, null, 2), 'utf-8');

  const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(0);
  console.log(`Written → ${outPath} (${sizeKB} KB)`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
