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

const MAX_WORDS = 350;
const OVERLAP_WORDS = 50;
const SPLIT_STEP = MAX_WORDS - OVERLAP_WORDS;

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

function draftsForRun(units: readonly AssignedUnit[]): ChunkDraft[] {
  const drafts: ChunkDraft[] = [];
  let pending: AssignedUnit[] = [];
  let pendingWords: SourceWord[] = [];

  const flush = (): void => {
    if (pendingWords.length === 0) return;
    drafts.push({
      unit: pending[0],
      words: pendingWords,
      paragraphs: uniqueParagraphs(pending),
    });
    pending = [];
    pendingWords = [];
  };

  for (const unit of units) {
    const words = wordsForUnit(unit);
    if (words.length === 0) continue;

    if (words.length > MAX_WORDS) {
      flush();
      for (let start = 0; start < words.length; start += SPLIT_STEP) {
        const slice = words.slice(start, start + MAX_WORDS);
        drafts.push({
          unit,
          words: slice,
          paragraphs: unit.paragraphNumber ? [unit.paragraphNumber] : [],
        });
        if (start + MAX_WORDS >= words.length) break;
      }
      continue;
    }

    if (pendingWords.length > 0 && pendingWords.length + words.length > MAX_WORDS) {
      flush();
    }
    pending.push(unit);
    pendingWords.push(...words);
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
export function packUnits(units: readonly AssignedUnit[]): RawChunk[] {
  const chunks: RawChunk[] = [];
  const sequenceBySection = new Map<string, number>();

  for (let start = 0; start < units.length;) {
    let end = start + 1;
    while (end < units.length && units[end].sectionId === units[start].sectionId) end++;

    for (const draft of draftsForRun(units.slice(start, end))) {
      const sequence = (sequenceBySection.get(draft.unit.sectionId) ?? 0) + 1;
      sequenceBySection.set(draft.unit.sectionId, sequence);
      chunks.push(toChunk(draft, sequence));
    }
    start = end;
  }

  return chunks;
}
