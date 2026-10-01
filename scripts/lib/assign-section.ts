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

function sectionForUnit(
  unit: SourceUnit,
  topLevel: ChunkOutlineEntry,
  outline: readonly ChunkOutlineEntry[],
): ChunkOutlineEntry {
  const paragraph = unit.paragraphNumber;
  if (!paragraph || topLevel.kind !== 'chapter') {
    const byPage = outline.filter(entry =>
      entry.parentId === topLevel.id &&
      unit.printedPage >= entry.printedStart &&
      unit.printedPage <= entry.printedEnd,
    );
    return byPage[0] ?? topLevel;
  }

  const parts = paragraphParts(paragraph);
  if (topLevel.id === 'ch7' && parts.length >= 2) {
    return outline.find(entry => entry.id === `ch7-theme${parts[1]}`) ?? topLevel;
  }

  const candidates = outline
    .filter(entry => entry.parentId === topLevel.id && entry.kind === 'section')
    .map(entry => ({ entry, match: entry.id.match(/^ch\d+-(\d+(?:\.\d+)?)/)?.[1] }))
    .filter((item): item is { entry: ChunkOutlineEntry; match: string } => Boolean(item.match))
    .map(item => ({ entry: item.entry, parts: paragraphParts(item.match) }))
    .filter(item => compareParts(item.parts, parts) <= 0)
    .sort((a, b) => compareParts(b.parts, a.parts));

  return candidates[0]?.entry ?? topLevel;
}

function chapterLabel(entry: ChunkOutlineEntry): string {
  if (entry.kind === 'chapter') return `Chapter ${entry.number}`;
  if (entry.kind === 'annex') return `Annex ${entry.number}`;
  if (entry.kind === 'glossary') return 'Glossary';
  return 'References';
}

export function assignUnitsToSections(
  units: readonly SourceUnit[],
  outline: readonly ChunkOutlineEntry[],
): AssignedUnit[] {
  return units.map(unit => {
    const topLevel = topLevelForUnit(unit, outline);
    if (!topLevel) throw new Error(`No outline entry covers printed page ${unit.printedPage}`);
    const section = sectionForUnit(unit, topLevel, outline);
    return {
      ...unit,
      sectionId: section.id,
      sectionTitle: section.title,
      chapterLabel: chapterLabel(topLevel),
      priority: HIGH_PRIORITY_IDS.has(topLevel.id) ? 'high' : 'normal',
    };
  });
}
