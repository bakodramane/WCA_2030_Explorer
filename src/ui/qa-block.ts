// src/ui/qa-block.ts
// A4: the answer block shown after revealing a curated Q&A in the Learn and
// self-test views. The VERBATIM excerpt is the primary answer; the paraphrased
// curated `answer` field is rendered beneath it, visually subordinate and
// always labelled "Curated summary (not verbatim)".
import type { Chunk, QaRow } from '../engine/types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The label that must accompany any display of the paraphrased `answer`. */
export const CURATED_SUMMARY_LABEL = 'Curated summary (not verbatim)';

/** Excerpt-first answer block for the Learn / self-test reveal panels. */
export function qaAnswerBlockHtml(row: QaRow): string {
  return (
    `<p class="qa-excerpt-label">WCA 2030 excerpt · Page ${esc(String(row.page_number))}</p>` +
    `<blockquote class="qa-excerpt"><p>${esc(row.excerpt)}</p></blockquote>` +
    `<p class="qa-summary-label">${CURATED_SUMMARY_LABEL}</p>` +
    `<p class="learn-answer-text qa-summary">${esc(row.answer)}</p>` +
    `<p class="learn-citation">§ ${esc(row.section_title)}</p>`
  );
}

/**
 * OD.2: a curated row whose excerpt awaits owner approval is never shown. The reveal shows the
 * best passage found by document search instead (verbatim, cited), or says that none was found.
 */
export function documentPassageBlockHtml(chunk: Chunk | null): string {
  if (!chunk) {
    return '<p class="qa-excerpt-label">No passage in the WCA 2030 guidelines answers this question with enough confidence.</p>';
  }
  const paragraph = chunk.paragraphs[0] ? `§${esc(chunk.paragraphs[0])} · ` : '';
  const pages = chunk.printedPageEnd > chunk.printedPage ? `pp. ${chunk.printedPage}–${chunk.printedPageEnd}` : `p. ${chunk.printedPage}`;
  return (
    `<p class="qa-excerpt-label">Passage found by search · ${paragraph}${esc(chunk.sectionTitle)} · ${pages}</p>` +
    `<blockquote class="qa-excerpt"><p>${esc(chunk.text)}</p></blockquote>`
  );
}
