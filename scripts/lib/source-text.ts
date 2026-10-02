import path from 'node:path';
import { extractPdfLines } from './pdf-lines';
import { compactKey, displayText, normaliseForMatch } from './normalise';
import { stripPageFurniture } from './strip-furniture';
import { SOURCE_PDF_FILE } from '../../src/engine/source-pdf';

export const SOURCE_PDF = path.join(process.cwd(), 'source', SOURCE_PDF_FILE);

const BULLET = /•/g;

export interface JoinedText {
  text: string;
  /** [offset, printedPage] for the start of each page, ascending. */
  starts: Array<[number, number]>;
}

export interface SourceText {
  /** Cleaned (furniture-free) text per printed page, whitespace- and quote-normalised. */
  pages: Map<number, string>;
  /** Page text with the PDF's original typography (for quoting). */
  displayPages: Map<number, string>;
  /** Compact (whitespace-free) keys per printed page. */
  keys: Map<number, string>;
  /** All pages as one compact string. */
  joined: JoinedText;
  /** Same with list-bullet markers removed (item descriptions flatten bullet lists). */
  joinedNoBullets: JoinedText;
  firstPage: number;
  lastPage: number;
}

function join(nums: number[], keys: Map<number, string>, stripBullets: boolean): JoinedText {
  let text = '';
  const starts: Array<[number, number]> = [];
  for (const page of nums) {
    starts.push([text.length, page]);
    const key = keys.get(page) ?? '';
    text += stripBullets ? key.replace(BULLET, '') : key;
  }
  return { text, starts };
}

/** Build the lookup structures from per-page text (printed page → page text). */
export function buildSourceText(pageText: Map<number, string>): SourceText {
  const pages = new Map<number, string>();
  const keys = new Map<number, string>();
  const displayPages = new Map<number, string>();
  for (const [page, text] of pageText) {
    displayPages.set(page, displayText(text));
    pages.set(page, normaliseForMatch(text));
    keys.set(page, compactKey(text));
  }
  const nums = [...pages.keys()].sort((a, b) => a - b);
  return {
    pages,
    displayPages,
    keys,
    joined: join(nums, keys, false),
    joinedNoBullets: join(nums, keys, true),
    firstPage: nums[0],
    lastPage: nums[nums.length - 1],
  };
}

export async function loadSourceText(pdfPath = SOURCE_PDF): Promise<SourceText> {
  const lines = stripPageFurniture(await extractPdfLines(pdfPath));
  const raw = new Map<number, string[]>();
  for (const line of lines) {
    const list = raw.get(line.printedPage) ?? [];
    list.push(line.text);
    raw.set(line.printedPage, list);
  }
  return buildSourceText(new Map([...raw].map(([page, parts]) => [page, parts.join(' ')])));
}

export function pageAtOffset(starts: Array<[number, number]>, offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid][0] <= offset) lo = mid; else hi = mid - 1;
  }
  return starts[lo][1];
}

/** Printed pages (ascending) on which a verbatim occurrence of `excerpt` starts. */
export function findStartPages(source: SourceText, excerpt: string, ignoreBullets = false): number[] {
  const key = ignoreBullets ? compactKey(excerpt).replace(BULLET, '') : compactKey(excerpt);
  if (!key) return [];
  const { text, starts } = ignoreBullets ? source.joinedNoBullets : source.joined;
  const hits = new Set<number>();
  for (let at = text.indexOf(key); at !== -1; at = text.indexOf(key, at + 1)) {
    hits.add(pageAtOffset(starts, at));
  }
  return [...hits].sort((a, b) => a - b);
}
