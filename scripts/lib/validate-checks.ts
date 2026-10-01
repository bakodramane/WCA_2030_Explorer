import { findStartPages, type SourceText } from './source-text';
import { compactKey } from './normalise';

export interface Failure {
  dataset: 'qa' | 'qa-json' | 'item' | 'glossary' | 'chunk';
  id: string;
  check: string;
  page: number;
  suggestedPage: number | '';
  detail: string;
}

export const QA_PAGE_TOLERANCE = 1;
const GLOSSARY_FIRST_PAGE = 201;
const GLOSSARY_LAST_PAGE = 207;

function nearest(hits: number[], page: number): number {
  return hits.reduce((best, hit) => Math.abs(hit - page) < Math.abs(best - page) ? hit : best, hits[0]);
}

function clip(text: string): string {
  return text.replace(/\s+/g, ' ').slice(0, 90);
}

export interface QaCsvRow {
  question: string;
  page_number: string;
  excerpt: string;
}

/** A curated excerpt must occur verbatim and start within ±1 of its stated printed page. */
export function checkQaRows(source: SourceText, rows: QaCsvRow[]): Failure[] {
  const failures: Failure[] = [];
  rows.forEach((row, index) => {
    const id = `row ${index + 2}: ${clip(row.question)}`;
    const page = Number(row.page_number);
    const hits = findStartPages(source, row.excerpt);
    if (hits.length === 0) {
      failures.push({ dataset: 'qa', id, check: 'excerpt-not-verbatim', page, suggestedPage: '', detail: clip(row.excerpt) });
    } else if (!hits.some(hit => Math.abs(hit - page) <= QA_PAGE_TOLERANCE)) {
      failures.push({ dataset: 'qa', id, check: 'page-mismatch', page, suggestedPage: nearest(hits, page), detail: `excerpt starts on p. ${hits.join(', ')}` });
    }
  });
  return failures;
}

/** The runtime qa.json must carry the same question, excerpt, and page as the CSV. */
export function checkQaJsonSync(csv: QaCsvRow[], json: QaCsvRow[]): Failure[] {
  if (csv.length !== json.length) {
    return [{ dataset: 'qa-json', id: 'qa.json', check: 'row-count', page: 0, suggestedPage: '', detail: `csv ${csv.length} vs json ${json.length}` }];
  }
  const failures: Failure[] = [];
  csv.forEach((row, index) => {
    const other = json[index];
    if (row.question !== other.question || row.excerpt !== other.excerpt || String(row.page_number) !== String(other.page_number)) {
      failures.push({ dataset: 'qa-json', id: `row ${index + 2}: ${clip(row.question)}`, check: 'stale-qa-json', page: Number(row.page_number), suggestedPage: '', detail: 'qa.json differs from data/wca-qa.csv; run npm run build-qa' });
    }
  });
  return failures;
}

export interface ItemLike { code: string; name: string; description: string; page: number }

/** Item descriptions must be verbatim and begin within two pages of the item's header page. */
export function checkItems(source: SourceText, items: ItemLike[]): Failure[] {
  const failures: Failure[] = [];
  for (const item of items) {
    const id = `${item.code} ${clip(item.name)}`;
    const hits = findStartPages(source, item.description, true);
    if (hits.length === 0) {
      failures.push({ dataset: 'item', id, check: 'text-not-verbatim', page: item.page, suggestedPage: '', detail: clip(item.description) });
    } else if (!hits.some(hit => hit >= item.page - 2 && hit <= item.page + 2)) {
      failures.push({ dataset: 'item', id, check: 'page-mismatch', page: item.page, suggestedPage: nearest(hits, item.page), detail: `description starts on p. ${hits.join(', ')}` });
    }
  }
  return failures;
}

export interface GlossaryLike { term: string; definition: string }

/** Glossary entries must appear verbatim, as "Term: definition", on the glossary pages. */
export function checkGlossary(source: SourceText, rows: GlossaryLike[]): Failure[] {
  const failures: Failure[] = [];
  for (const row of rows) {
    const hits = findStartPages(source, `${row.term}: ${row.definition}`);
    if (hits.length === 0) {
      failures.push({ dataset: 'glossary', id: row.term, check: 'text-not-verbatim', page: 0, suggestedPage: '', detail: clip(row.definition) });
    } else if (!hits.some(hit => hit >= GLOSSARY_FIRST_PAGE && hit <= GLOSSARY_LAST_PAGE)) {
      failures.push({ dataset: 'glossary', id: row.term, check: 'page-mismatch', page: 0, suggestedPage: hits[0], detail: `entry starts on p. ${hits.join(', ')}` });
    }
  }
  return failures;
}

export interface ChunkLike { id: string; text: string; printedPage: number }

/** Chunk text must be verbatim and begin on the page it cites. */
export function checkChunks(source: SourceText, chunks: ChunkLike[]): Failure[] {
  const failures: Failure[] = [];
  for (const chunk of chunks) {
    if (!compactKey(chunk.text)) continue;
    const hits = findStartPages(source, chunk.text);
    if (hits.length === 0) {
      failures.push({ dataset: 'chunk', id: chunk.id, check: 'text-not-verbatim', page: chunk.printedPage, suggestedPage: '', detail: clip(chunk.text) });
    } else if (!hits.includes(chunk.printedPage)) {
      failures.push({ dataset: 'chunk', id: chunk.id, check: 'page-mismatch', page: chunk.printedPage, suggestedPage: nearest(hits, chunk.printedPage), detail: `text starts on p. ${hits.join(', ')}` });
    }
  }
  return failures;
}
