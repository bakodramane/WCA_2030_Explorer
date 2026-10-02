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

function dividerPages(lines: PdfLine[]): Set<number> {
  const byPage = new Map<number, PdfLine[]>();
  for (const line of lines) {
    const page = byPage.get(line.pdfPage) ?? [];
    page.push(line);
    byPage.set(line.pdfPage, page);
  }

  return new Set([...byPage.entries()]
    .filter(([, page]) =>
      page.length <= 6 &&
      page.some(line => /^PART (ONE|TWO)$/i.test(line.text)) &&
      page.every(line => line.text === line.text.toUpperCase()),
    )
    .map(([pdfPage]) => pdfPage));
}

/**
 * Remove front matter, page numbers, and repeated edge furniture. Repeated
 * content in the page body is retained, as are item reference-period lines.
 */
export function stripPageFurniture(lines: PdfLine[]): PdfLine[] {
  const edgePagesByText = new Map<string, Set<number>>();
  const structuralDividers = dividerPages(lines);

  for (const line of lines) {
    if (line.printedPage < 1 || !isEdgeLine(line)) continue;
    const key = lineKey(line.text);
    const pages = edgePagesByText.get(key) ?? new Set<number>();
    pages.add(line.pdfPage);
    edgePagesByText.set(key, pages);
  }

  return lines.filter(line => {
    if (line.printedPage < 1) return false;
    if (structuralDividers.has(line.pdfPage)) return false;
    if (isPageNumberLine(line)) return false;
    if (isProtectedMetadata(line.text)) return true;
    if (!isEdgeLine(line)) return true;

    return (edgePagesByText.get(lineKey(line.text))?.size ?? 0) < MIN_REPEAT_PAGES;
  });
}
