// OD.3: a curated excerpt is an ordered list of verbatim passages, each with its own printed page.
// In data/wca-qa.csv the passages are separated by a line holding only ` [...] ` and
// `page_number` lists one page per passage ("34; 36"). A single-passage row is unchanged.

export interface Passage {
  text: string;
  printedPage: number;
}

/** The separator line between passages in the CSV `excerpt` column. */
export const PASSAGE_SEPARATOR = '\n [...] \n';
const SEPARATOR_PATTERN = /\r?\n[ \t]*\[\.\.\.\][ \t]*\r?\n/;

export function splitPassages(excerpt: string): string[] {
  return excerpt.split(SEPARATOR_PATTERN).map(p => p.trim()).filter(Boolean);
}

export function splitPages(pageNumber: string): number[] {
  return String(pageNumber).split(/[;,]/).map(p => Number(p.trim())).filter(n => Number.isFinite(n) && n > 0);
}

/** Passages with their pages. If the page list is shorter than the passage list the last page is reused. */
export function parseExcerpts(excerpt: string, pageNumber: string): Passage[] {
  const pages = splitPages(pageNumber);
  return splitPassages(excerpt).map((text, i) => ({ text, printedPage: pages[i] ?? pages[pages.length - 1] ?? 0 }));
}

export function joinPassages(passages: readonly string[]): string {
  return passages.join(PASSAGE_SEPARATOR);
}

/** "Page 34", "Pages 34, 36" (distinct pages, in passage order). */
export function pagesLabel(passages: readonly Passage[]): string {
  const pages = [...new Set(passages.map(p => p.printedPage))];
  return `${pages.length > 1 ? 'Pages' : 'Page'} ${pages.join(', ')}`;
}

/** Citation text for the copy button: every page is listed (`pp. 79, 81`). */
export function excerptCitation(sectionTitle: string, passages: readonly Passage[]): string {
  const pages = [...new Set(passages.map(p => p.printedPage))];
  const label = pages.length > 1 ? `pp. ${pages.join(', ')}` : `p. ${pages[0]}`;
  return `WCA 2030, ${sectionTitle} (${label}): "${(passages[0]?.text ?? '').slice(0, 80)}…"`;
}
