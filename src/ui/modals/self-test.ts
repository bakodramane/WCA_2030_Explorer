// Self-test modal (E3).
import type { UiContext } from '../context';
import { fillAnswerBlock } from './reveal';
import { setupModalA11y } from '../modal';

export function openTestModal(ctx: UiContext): void  {
  const triggerEl = document.activeElement;
  const allRows = ctx.engine.getAllQa();
  if (allRows.length === 0) return;

  // ── Session state (closure-local, never persisted) ───────────────────
  let knownCount  = 0;
  let reviewCount = 0;
  const reviewPool = new Set<number>(); // indices of rows marked 'review again'

  /** Weighted random draw: 60 % chance from reviewPool when non-empty. */
  const draw = (): number => {
    if (reviewPool.size > 0 && Math.random() < 0.6) {
      const pool = [...reviewPool];
      return pool[Math.floor(Math.random() * pool.length)];
    }
    return Math.floor(Math.random() * allRows.length);
  };

  // ── Modal scaffold ───────────────────────────────────────────────────
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Test yourself');

  const panel = document.createElement('div');
  panel.className = 'modal-panel learn-modal-panel';

  // Header: title + tally + close
  const modalHeader = document.createElement('div');
  modalHeader.className = 'modal-header test-modal-header';

  const titleEl = document.createElement('h2');
  titleEl.className = 'modal-title';
  titleEl.textContent = 'Test yourself';

  const tallyEl = document.createElement('span');
  tallyEl.className = 'test-tally';
  tallyEl.setAttribute('aria-live', 'polite');

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';

  modalHeader.appendChild(titleEl);
  modalHeader.appendChild(tallyEl);
  modalHeader.appendChild(closeBtn);

  // Disclaimer banner
  const disclaimer = document.createElement('p');
  disclaimer.className = 'test-disclaimer';
  disclaimer.textContent = 'Self-check only — not a graded test.';

  const body = document.createElement('div');
  body.className = 'learn-modal-body';

  // ── Tally renderer ───────────────────────────────────────────────────
  const refreshTally = () => {
    const total = knownCount + reviewCount;
    tallyEl.innerHTML =
      `<span class="test-tally-known">✓ ${knownCount}</span>` +
      `<span class="test-tally-sep"> · </span>` +
      `<span class="test-tally-review">↻ ${reviewCount}</span>` +
      (total > 0
        ? `<span class="test-tally-total"> of ${total}</span>`
        : '');
  };
  refreshTally();

  // ── Card renderer ────────────────────────────────────────────────────
  const showCard = (rowIndex: number) => {
    const row = allRows[rowIndex];
    body.innerHTML = '';
    body.scrollTop = 0;

    // Question
    const qEl = document.createElement('p');
    qEl.className = 'learn-question test-question';
    qEl.textContent = row.question;

    // Reveal button
    const revealBtn = document.createElement('button');
    revealBtn.type = 'button';
    revealBtn.className = 'learn-show-btn';
    revealBtn.textContent = 'Reveal answer';

    // Answer block (hidden until revealed)
    const answerBlock = document.createElement('div');
    answerBlock.className = 'learn-answer-block';
    answerBlock.hidden = true;
    void fillAnswerBlock(ctx.engine, answerBlock, row);

    // Mark buttons (appear after reveal)
    const markRow = document.createElement('div');
    markRow.className = 'test-mark-row';
    markRow.hidden = true;

    const knownBtn = document.createElement('button');
    knownBtn.type = 'button';
    knownBtn.className = 'test-mark-btn test-mark-btn--known';
    knownBtn.textContent = '✓  I knew this';

    const reviewBtn = document.createElement('button');
    reviewBtn.type = 'button';
    reviewBtn.className = 'test-mark-btn test-mark-btn--review';
    reviewBtn.textContent = '↻  Review again';

    markRow.appendChild(knownBtn);
    markRow.appendChild(reviewBtn);

    revealBtn.addEventListener('click', () => {
      answerBlock.hidden = false;
      revealBtn.hidden = true;
      markRow.hidden = false;
    });

    knownBtn.addEventListener('click', () => {
      knownCount++;
      reviewPool.delete(rowIndex);
      refreshTally();
      showCard(draw());
    });

    reviewBtn.addEventListener('click', () => {
      reviewCount++;
      reviewPool.add(rowIndex);
      refreshTally();
      showCard(draw());
    });

    body.appendChild(qEl);
    body.appendChild(revealBtn);
    body.appendChild(answerBlock);
    body.appendChild(markRow);
  };

  showCard(draw());

  panel.appendChild(modalHeader);
  panel.appendChild(disclaimer);
  panel.appendChild(body);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  const closeModal = setupModalA11y(backdrop, panel, triggerEl);
  closeBtn.addEventListener('click', closeModal);
}
