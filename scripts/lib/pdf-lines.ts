import fs from 'node:fs';
import { PDFParse } from 'pdf-parse';

export const PRINTED_PAGE_OFFSET = 14;

export interface PdfTextPage {
  num: number;
  text: string;
}

export interface PdfLine {
  text: string;
  pdfPage: number;
  printedPage: number;
  lineIndexFromTop: number;
  lineIndexFromBottom: number;
}

/** Convert pdf-parse pages into non-empty, positioned lines. */
export function linesFromPages(pages: PdfTextPage[]): PdfLine[] {
  return pages.flatMap(page => {
    const textLines = page.text
      .split('\n')
      .map(text => text.trim())
      .filter(Boolean);

    return textLines.map((text, index) => ({
      text,
      pdfPage: page.num,
      printedPage: page.num - PRINTED_PAGE_OFFSET,
      lineIndexFromTop: index,
      lineIndexFromBottom: textLines.length - index - 1,
    }));
  });
}

/** Extract all positioned lines from the source PDF. */
export async function extractPdfLines(pdfPath: string): Promise<PdfLine[]> {
  if (!fs.existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`);

  const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
  try {
    const result = await parser.getText();
    return linesFromPages(result.pages);
  } finally {
    await parser.destroy();
  }
}
