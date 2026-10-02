// Answer reveal block shared by the Learn and self-test modals (E3). OD.2: a row awaiting owner
// approval shows a document-search passage instead of its held excerpt.
import { answerQuery } from '../../engine/answer';
import type { RetrievalEngine } from '../../engine/retrieval';
import type { QaRow } from '../../engine/types';
import { documentPassageBlockHtml, qaAnswerBlockHtml } from '../qa-block';

/** Fill a reveal block; a row awaiting owner approval (OD.2) shows a document-search passage instead. */
export async function fillAnswerBlock(engine: RetrievalEngine, block: HTMLElement, row: QaRow): Promise<void> {
  if (row.servable !== false) { block.innerHTML = qaAnswerBlockHtml(row); return; }
  const outcome = await answerQuery(engine, row.question, { documentOnly: true });
  block.innerHTML = documentPassageBlockHtml(outcome.tier === 'document' ? outcome.results[0].chunk : null);
}
