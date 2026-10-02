import type { AssignedUnit } from './assign-section';

export interface RawChunk {
  id: string;
  sectionId: string;
  sectionTitle: string;
  chapterLabel: string;
  paragraphs: string[];
  pdfPage: number;
  printedPage: number;
  printedPageEnd: number;
  text: string;
  priority: 'high' | 'normal';
}

interface SourceWord {
  text: string;
  pdfPage: number;
  printedPage: number;
}

interface ChunkDraft {
  unit: AssignedUnit;
  words: SourceWord[];
  paragraphs: string[];
}

const MIN_UNIT_WORDS = 5;
const OVERLAP_WORDS = 50;

export interface PackOptions {
  /** Upper bound of a chunk in words; a longer unit is split with OVERLAP_WORDS of overlap. */
  maxWords: number;
  /** A chunk shorter than this counts as "short" when the packer minimises short chunks. */
  minTargetWords: number;
}

/** Shipped sizing: 200–350 words. The eval script also builds 120–180-word variants (C2). */
export const DEFAULT_PACK: PackOptions = { maxWords: 350, minTargetWords: 150 };

function wordsForUnit(unit: AssignedUnit): SourceWord[] {
  return unit.lines.flatMap(line =>
    line.text.split(/\s+/).filter(Boolean).map(text => ({
      text,
      pdfPage: line.pdfPage,
      printedPage: line.printedPage,
    })),
  );
}

function uniqueParagraphs(units: readonly AssignedUnit[]): string[] {
  const seen = new Set<string>();
  const paragraphs: string[] = [];
  for (const unit of units) {
    if (unit.paragraphNumber && !seen.has(unit.paragraphNumber)) {
      seen.add(unit.paragraphNumber);
      paragraphs.push(unit.paragraphNumber);
    }
  }
  return paragraphs;
}

function optimallyPack(units: readonly AssignedUnit[], { maxWords, minTargetWords }: PackOptions): ChunkDraft[] {
  if (units.length === 0) return [];
  const wordSets = units.map(wordsForUnit);
  const best: Array<{ short: number; chunks: number; end: number }> =
    Array.from({ length: units.length + 1 }, () => ({ short: Infinity, chunks: Infinity, end: -1 }));
  best[units.length] = { short: 0, chunks: 0, end: units.length };

  for (let start = units.length - 1; start >= 0; start--) {
    let count = 0;
    for (let end = start; end < units.length; end++) {
      count += wordSets[end].length;
      if (count > maxWords) break;
      const short = (count < minTargetWords ? 1 : 0) + best[end + 1].short;
      const chunks = 1 + best[end + 1].chunks;
      if (short < best[start].short || (short === best[start].short && chunks < best[start].chunks)) {
        best[start] = { short, chunks, end: end + 1 };
      }
    }
  }

  const drafts: ChunkDraft[] = [];
  for (let start = 0; start < units.length;) {
    const end = best[start].end;
    if (end <= start) throw new Error(`Cannot pack unit with ${wordSets[start].length} words`);
    const group = units.slice(start, end);
    drafts.push({
      unit: group[0],
      words: wordSets.slice(start, end).flat(),
      paragraphs: uniqueParagraphs(group),
    });
    start = end;
  }
  return drafts;
}

function draftsForRun(units: readonly AssignedUnit[], options: PackOptions): ChunkDraft[] {
  const { maxWords } = options;
  const splitStep = maxWords - OVERLAP_WORDS;
  const drafts: ChunkDraft[] = [];
  let pending: AssignedUnit[] = [];

  const flush = (): void => {
    // Short units (headings, code-table rows) stay in the stream so chunk text is
    // a contiguous quote of the source; only a run too small to answer anything
    // on its own (a lone heading fragment) is discarded.
    drafts.push(...optimallyPack(pending, options).filter(draft => draft.words.length >= MIN_UNIT_WORDS));
    pending = [];
  };

  for (const unit of units) {
    const words = wordsForUnit(unit);

    if (words.length > maxWords) {
      flush();
      for (let start = 0; start < words.length; start += splitStep) {
        const slice = words.slice(start, start + maxWords);
        drafts.push({
          unit,
          words: slice,
          paragraphs: unit.paragraphNumber ? [unit.paragraphNumber] : [],
        });
        if (start + maxWords >= words.length) break;
      }
      continue;
    }

    pending.push(unit);
  }

  flush();
  return drafts;
}

function toChunk(draft: ChunkDraft, sequence: number): RawChunk {
  const first = draft.words[0];
  const last = draft.words[draft.words.length - 1];
  const firstParagraph = draft.paragraphs[0] ?? 'intro';
  return {
    id: `${draft.unit.sectionId}-${firstParagraph}-${sequence}`,
    sectionId: draft.unit.sectionId,
    sectionTitle: draft.unit.sectionTitle,
    chapterLabel: draft.unit.chapterLabel,
    paragraphs: draft.paragraphs,
    pdfPage: first.pdfPage,
    printedPage: first.printedPage,
    printedPageEnd: last.printedPage,
    text: draft.words.map(word => word.text).join(' '),
    priority: draft.unit.priority,
  };
}

/** Pack consecutive units without crossing section boundaries. */
export function packUnits(units: readonly AssignedUnit[], options: PackOptions = DEFAULT_PACK): RawChunk[] {
  const chunks: RawChunk[] = [];
  const sequenceBySection = new Map<string, number>();

  for (let start = 0; start < units.length;) {
    let end = start + 1;
    while (end < units.length && units[end].sectionId === units[start].sectionId) end++;

    for (const draft of draftsForRun(units.slice(start, end), options)) {
      const sequence = (sequenceBySection.get(draft.unit.sectionId) ?? 0) + 1;
      sequenceBySection.set(draft.unit.sectionId, sequence);
      chunks.push(toChunk(draft, sequence));
    }
    start = end;
  }

  return chunks;
}
