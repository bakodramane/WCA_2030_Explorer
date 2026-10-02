import type { HeadingMatcher } from './headings';
import type { PdfLine } from './pdf-lines';

export interface SourceUnit {
  paragraphNumber: string | null;
  glossaryTerm: string | null;
  /** Outline entry whose heading opens this unit (B2.1), if any. */
  headingSectionId: string | null;
  lines: PdfLine[];
  text: string;
  pdfPage: number;
  printedPage: number;
  printedPageEnd: number;
}

export interface UnitSplitOptions {
  isGlossaryPage?: (printedPage: number) => boolean;
  /** Recognises outline headings so a section's heading starts its own unit. */
  matchHeading?: HeadingMatcher;
}

// A paragraph number is followed by a capital letter, quote, bracket, bullet, or digit.
// A wrapped cross-reference such as "4.16 for more information" is not a paragraph start.
const PARAGRAPH_START = /^((?:[1-9]\d*\.\d+(?:\.\d+)?)|(?:A[1-9]\d*\.\d+))\s+(?=[A-Z0-9"'(\u2018\u201c\u2022\u008b\u00bf])/;
const GLOSSARY_START = /^([A-Z][^:]{1,80}):\s+\S/;
const TOP_LEVEL_START = /^(?:CHAPTER|ANNEX)\s+\d+\b|^GLOSSARY OF TERMS$|^REFERENCES AND FURTHER READING$/i;

function makeUnit(
  lines: PdfLine[],
  paragraphNumber: string | null,
  glossaryTerm: string | null,
  headingSectionId: string | null,
): SourceUnit {
  const first = lines[0];
  const last = lines[lines.length - 1];
  return {
    paragraphNumber,
    glossaryTerm,
    headingSectionId,
    lines,
    text: lines.map(line => line.text).join(' ').replace(/\s+/g, ' ').trim(),
    pdfPage: first.pdfPage,
    printedPage: first.printedPage,
    printedPageEnd: last.printedPage,
  };
}

/** Split cleaned lines into numbered paragraphs, annex paragraphs, and terms. */
export function splitIntoUnits(
  lines: PdfLine[],
  options: UnitSplitOptions = {},
): SourceUnit[] {
  const units: SourceUnit[] = [];
  let current: PdfLine[] = [];
  let paragraphNumber: string | null = null;
  let glossaryTerm: string | null = null;
  let headingSectionId: string | null = null;

  const flush = (): void => {
    if (current.length > 0) {
      units.push(makeUnit(current, paragraphNumber, glossaryTerm, headingSectionId));
    }
    current = [];
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const heading = options.matchHeading?.(lines, index) ?? null;
    const paragraph = line.text.match(PARAGRAPH_START)?.[1] ?? null;
    const glossary = options.isGlossaryPage?.(line.printedPage)
      ? line.text.match(GLOSSARY_START)?.[1] ?? null
      : null;
    const topLevel = TOP_LEVEL_START.test(line.text);

    if (heading) {
      flush();
      paragraphNumber = null;
      glossaryTerm = null;
      headingSectionId = heading.entryId;
      current.push(...lines.slice(index, index + heading.span));
      index += heading.span - 1;
      continue;
    }
    if (paragraph || glossary || topLevel) {
      flush();
      paragraphNumber = paragraph;
      glossaryTerm = glossary;
      headingSectionId = null;
    }
    current.push(line);
  }

  flush();
  return units;
}
