import type { SourceUnit } from './units';

export interface ChunkOutlineEntry {
  id: string;
  kind: 'chapter' | 'section' | 'annex' | 'glossary' | 'theme' | 'references';
  number: number;
  title: string;
  printedStart: number;
  printedEnd: number;
  parentId: string | null;
  /** Paragraph range covered by a section, e.g. "2.8–2.10". */
  paragraphs?: string;
}

export interface AssignedUnit extends SourceUnit {
  sectionId: string;
  sectionTitle: string;
  chapterLabel: string;
  priority: 'high' | 'normal';
}

const TOP_LEVEL_KINDS = new Set(['chapter', 'annex', 'glossary', 'references']);
const HIGH_PRIORITY_IDS = new Set(['ch4', 'ch7', 'annex4', 'glossary']);

function compareParts(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function paragraphParts(paragraph: string): number[] {
  return paragraph.replace(/^A/, '').split('.').map(Number);
}

function topLevelForUnit(
  unit: SourceUnit,
  outline: readonly ChunkOutlineEntry[],
): ChunkOutlineEntry | undefined {
  const paragraph = unit.paragraphNumber;
  const directId = paragraph?.startsWith('A')
    ? `annex${paragraphParts(paragraph)[0]}`
    : paragraph ? `ch${paragraphParts(paragraph)[0]}` : null;
  const direct = directId ? outline.find(entry => entry.id === directId) : undefined;
  if (
    direct &&
    unit.printedPage >= direct.printedStart &&
    unit.printedPage <= direct.printedEnd
  ) return direct;

  return outline
    .filter(entry => TOP_LEVEL_KINDS.has(entry.kind))
    .filter(entry => unit.printedPage >= entry.printedStart && unit.printedPage <= entry.printedEnd)
    .sort((a, b) => b.printedStart - a.printedStart)[0];
}

/** Section whose `paragraphs` hint (or numeric id, e.g. ch4-4.21) covers a numbered paragraph. */
function sectionForParagraph(
  paragraph: string,
  topLevel: ChunkOutlineEntry,
  outline: readonly ChunkOutlineEntry[],
): ChunkOutlineEntry | undefined {
  const parts = paragraphParts(paragraph);
  if (topLevel.id === 'ch7' && parts.length >= 2) {
    return outline.find(entry => entry.id === `ch7-theme${parts[1]}`);
  }

  const children = outline.filter(entry => entry.parentId === topLevel.id && entry.kind === 'section');
  const hinted = children.find(entry => {
    if (!entry.paragraphs) return false;
    const [from, to] = entry.paragraphs.split('–').map(paragraphParts);
    return compareParts(from, parts) <= 0 && compareParts(parts, to) <= 0;
  });
  if (hinted) return hinted;

  return children
    .map(entry => ({ entry, match: entry.id.match(/^ch\d+-(\d+(?:\.\d+)?)/)?.[1] }))
    .filter((item): item is { entry: ChunkOutlineEntry; match: string } => Boolean(item.match))
    .map(item => ({ entry: item.entry, parts: paragraphParts(item.match) }))
    .filter(item => compareParts(item.parts, parts) <= 0)
    .sort((a, b) => compareParts(b.parts, a.parts))[0]?.entry;
}

/** The latest section that starts on or before the page (document order), if the page is inside it. */
function sectionForPage(
  unit: SourceUnit,
  topLevel: ChunkOutlineEntry,
  outline: readonly ChunkOutlineEntry[],
): ChunkOutlineEntry | undefined {
  return outline
    .filter(entry =>
      entry.parentId === topLevel.id &&
      unit.printedPage >= entry.printedStart &&
      unit.printedPage <= entry.printedEnd,
    )
    .sort((a, b) => b.printedStart - a.printedStart)[0];
}

function chapterLabel(entry: ChunkOutlineEntry): string {
  if (entry.kind === 'chapter') return `Chapter ${entry.number}`;
  if (entry.kind === 'annex') return `Annex ${entry.number}`;
  if (entry.kind === 'glossary') return 'Glossary';
  return 'References';
}

/**
 * Assign every unit to its most specific outline entry. Order of evidence:
 * a recognised heading, the paragraph number (hint range or numeric id), the
 * section of the previous unit when the page still lies inside it (headings
 * and tables carry no number), then the page range. Chapter intros that match
 * none of these keep the chapter title.
 */
export function assignUnitsToSections(
  units: readonly SourceUnit[],
  outline: readonly ChunkOutlineEntry[],
): AssignedUnit[] {
  const byId = new Map(outline.map(entry => [entry.id, entry]));
  let carried: ChunkOutlineEntry | undefined;

  return units.map(unit => {
    const topLevel = topLevelForUnit(unit, outline);
    if (!topLevel) throw new Error(`No outline entry covers printed page ${unit.printedPage}`);

    let section: ChunkOutlineEntry | undefined;
    if (unit.headingSectionId) section = byId.get(unit.headingSectionId);
    else if (unit.paragraphNumber && topLevel.kind === 'chapter') {
      section = sectionForParagraph(unit.paragraphNumber, topLevel, outline);
    } else if (
      carried?.parentId === topLevel.id &&
      unit.printedPage >= carried.printedStart &&
      unit.printedPage <= carried.printedEnd
    ) section = carried;
    else if (!unit.paragraphNumber) section = sectionForPage(unit, topLevel, outline);

    carried = section;
    const entry = section ?? topLevel;
    // Dotted numbers inside annexes are classification codes (1.90 Other cereals), not paragraphs.
    const isCode = topLevel.kind === 'annex' && !unit.paragraphNumber?.startsWith('A');
    return {
      ...unit,
      paragraphNumber: isCode ? null : unit.paragraphNumber,
      sectionId: entry.id,
      sectionTitle: entry.title,
      chapterLabel: chapterLabel(topLevel),
      priority: HIGH_PRIORITY_IDS.has(topLevel.id) ? 'high' : 'normal',
    };
  });
}
