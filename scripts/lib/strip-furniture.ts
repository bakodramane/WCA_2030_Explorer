import type { PdfLine } from './pdf-lines';

const MIN_REPEAT_PAGES = 5;

function lineKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isEdgeLine(line: PdfLine): boolean {
  return line.lineIndexFromTop < 3 || line.lineIndexFromBottom < 2;
}

function isProtectedMetadata(text: string): boolean {
  return /^(Reference period:|Essential item\.)/i.test(text);
}

function isPageNumberLine(line: PdfLine): boolean {
  return lineKey(line.text) === String(line.printedPage);
}

/**
 * Remove front matter, page numbers, and repeated edge furniture. Repeated
 * content in the page body is retained, as are item reference-period lines.
 */
export function stripPageFurniture(lines: PdfLine[]): PdfLine[] {
  const edgePagesByText = new Map<string, Set<number>>();

  for (const line of lines) {
    if (line.printedPage < 1 || !isEdgeLine(line)) continue;
    const key = lineKey(line.text);
    const pages = edgePagesByText.get(key) ?? new Set<number>();
    pages.add(line.pdfPage);
    edgePagesByText.set(key, pages);
  }

  return lines.filter(line => {
    if (line.printedPage < 1) return false;
    if (isPageNumberLine(line)) return false;
    if (isProtectedMetadata(line.text)) return true;
    if (!isEdgeLine(line)) return true;

    return (edgePagesByText.get(lineKey(line.text))?.size ?? 0) < MIN_REPEAT_PAGES;
  });
}
