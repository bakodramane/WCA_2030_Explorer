// D2: the single citation line of a result card, and the match band that replaces the percentage bar.
import { ENUM_CONFIDENCE_THRESHOLD, QA_THRESHOLD } from '../engine/config';
import type { Chunk } from '../engine/types';

/** Phrases that keep their capitals when a Title Case outline title is turned into sentence case. */
const PROPER = ['Cape Town Global Action Plan', 'Global Strategy to Improve Agricultural and Rural Statistics', '50x2030 Initiative',
  'Sustainable Development Goals', 'System of National Accounts', 'Indicative Crop Classification', 'World Programme', 'Small Area Estimation'];

/**
 * "Complementary Tools to Data Collection (georeferencing, GIS, EO)" → "Complementary tools to data collection".
 * Drops a trailing parenthetical (the full title stays in the tooltip), lower-cases Title Case words except
 * the first word, the word after a colon, acronyms, and the proper-name phrases above.
 */
export function displayTitle(title: string): string {
  const short = title.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const kept: string[] = [];
  let text = short;
  PROPER.forEach((phrase, i) => {
    if (text.includes(phrase)) { kept.push(phrase); text = text.replace(phrase, `\u0001${i}\u0001`); }
  });
  text = text.split(/(\s+)/).map((part, i, parts) => {
    if (/^\s+$/.test(part) || part.includes('\u0001')) return part;
    const previous = parts.slice(0, i).filter(p => !/^\s+$/.test(p)).pop() ?? '';
    const startsSentence = previous === '' || previous === '\u00b7' || previous.endsWith(':');
    if (startsSentence || /^[A-Z0-9]{2,}/.test(part) || !/^[A-Z][a-z]/.test(part)) return part;
    return part.charAt(0).toLowerCase() + part.slice(1);
  }).join('');
  return text.replace(/\u0001(\d+)\u0001/g, (_, i) => PROPER[Number(i)]);
}

export function pagesText(printedPage: number, printedPageEnd: number): string {
  if (printedPage < 1) return 'front matter';
  return printedPage === printedPageEnd ? `p. ${printedPage}` : `pp. ${printedPage}–${printedPageEnd}`;
}

/** `§7.2.13 · Theme 2: Land · p. 81` (no paragraph number: `Theme 2: Land · p. 81`). */
export function citationLine(chunk: Pick<Chunk, 'paragraphs' | 'sectionTitle' | 'printedPage' | 'printedPageEnd'>): string {
  const paragraph = chunk.paragraphs[0];
  const parts = [paragraph ? `§${paragraph}` : '', displayTitle(chunk.sectionTitle), pagesText(chunk.printedPage, chunk.printedPageEnd)];
  return parts.filter(Boolean).join(' · ');
}

export interface Band {
  label: string;
  className: 'strong' | 'good' | 'partial';
  tooltip: string;
}

/** Strong match: raw cosine at least 0.15 above the threshold; keyword results are "Partial match (keyword)". */
export function matchBand(result: { rawScore: number; matchType: 'semantic' | 'lexical' }, threshold = ENUM_CONFIDENCE_THRESHOLD): Band {
  if (result.matchType === 'lexical') {
    return { label: 'Partial match (keyword)', className: 'partial', tooltip: `Keyword (BM25) score ${result.rawScore.toFixed(1)}` };
  }
  const strong = result.rawScore >= threshold + 0.15;
  return { label: strong ? 'Strong match' : 'Good match', className: strong ? 'strong' : 'good', tooltip: `Raw similarity ${result.rawScore.toFixed(3)} (threshold ${threshold})` };
}

/** Curated-question band: strong when the question similarity is at least 0.10 above the Q&A threshold. */
export function qaBand(score: number): Band {
  const strong = score >= QA_THRESHOLD + 0.10;
  return { label: strong ? 'Strong match' : 'Good match', className: strong ? 'strong' : 'good', tooltip: `Question similarity ${score.toFixed(3)} (threshold ${QA_THRESHOLD})` };
}

/** D3: link to a page of the official PDF (bundled, precached, same origin). PDF page = printed page + 14. */
export const PDF_PAGE_OFFSET = 14;
const BASE_URL: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export function pdfPageUrl(pdfPage: number): string {
  return `${BASE_URL}source/Census-2030_EN-DTP-9.pdf#page=${pdfPage}`;
}

/** The "View page in PDF" anchor shared by every card type. */
export function pdfLinkHtml(pdfPage: number): string {
  return `<a class="pdf-link" href="${pdfPageUrl(pdfPage)}" target="_blank" rel="noopener" aria-label="View page ${pdfPage - PDF_PAGE_OFFSET} in the official PDF">View page in PDF</a>`;
}
