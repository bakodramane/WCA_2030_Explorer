import type { PdfLine } from './pdf-lines';

export interface SourceUnit {
  paragraphNumber: string | null;
  glossaryTerm: string | null;
  lines: PdfLine[];
  text: string;
  pdfPage: number;
  printedPage: number;
  printedPageEnd: number;
}

export interface UnitSplitOptions {
  isGlossaryPage?: (printedPage: number) => boolean;
}

const PARAGRAPH_START = /^((?:\d+\.\d+(?:\.\d+)?)|(?:A\d+\.\d+))\s+/;
const GLOSSARY_START = /^([A-Z][^:]{1,80}):\s+\S/;

function makeUnit(
  lines: PdfLine[],
  paragraphNumber: string | null,
  glossaryTerm: string | null,
): SourceUnit {
  const first = lines[0];
  const last = lines[lines.length - 1];
  return {
    paragraphNumber,
    glossaryTerm,
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

  const flush = (): void => {
    if (current.length > 0) {
      units.push(makeUnit(current, paragraphNumber, glossaryTerm));
    }
    current = [];
  };

  for (const line of lines) {
    const paragraph = line.text.match(PARAGRAPH_START)?.[1] ?? null;
    const glossary = options.isGlossaryPage?.(line.printedPage)
      ? line.text.match(GLOSSARY_START)?.[1] ?? null
      : null;

    if (paragraph || glossary) {
      flush();
      paragraphNumber = paragraph;
      glossaryTerm = glossary;
    }
    current.push(line);
  }

  flush();
  return units;
}
