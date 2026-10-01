import type { PdfLine } from './pdf-lines';

/** The outline fields needed to recognise a heading line. */
export interface HeadingEntry {
  id: string;
  kind: string;
  title: string;
  printedStart: number;
  printedEnd: number;
}

export interface HeadingMatch {
  entryId: string;
  /** Number of consecutive lines the heading occupies (long titles wrap). */
  span: number;
}

export type HeadingMatcher = (lines: readonly PdfLine[], index: number) => HeadingMatch | null;

const MAX_SPAN = 4;

function key(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** "Annex 4 · Theme 5: Livestock (notes)" → "theme5livestock". */
function titleKey(title: string): string {
  return key(title.replace(/^Annex \d+ · /, '').replace(/\s*\(.*\)\s*$/, ''));
}

/**
 * Recognise section and theme headings in the line stream by comparing one to
 * four consecutive lines with outline titles. A heading only counts on a page
 * inside its entry's range, so repeated words elsewhere cannot trigger it.
 */
export function buildHeadingMatcher(outline: readonly HeadingEntry[]): HeadingMatcher {
  const byKey = new Map<string, HeadingEntry[]>();
  for (const entry of outline) {
    if (entry.kind !== 'section' && entry.kind !== 'theme') continue;
    const k = titleKey(entry.title);
    byKey.set(k, [...(byKey.get(k) ?? []), entry]);
  }

  return (lines, index) => {
    let joined = '';
    for (let span = 1; span <= MAX_SPAN && index + span <= lines.length; span++) {
      const line = lines[index + span - 1];
      if (line.printedPage !== lines[index].printedPage) break;
      joined += key(line.text);
      const entry = byKey.get(joined)?.find(
        e => lines[index].printedPage >= e.printedStart && lines[index].printedPage <= e.printedEnd,
      );
      if (entry) return { entryId: entry.id, span };
    }
    return null;
  };
}
