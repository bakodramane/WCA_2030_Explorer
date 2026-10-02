// Guided learning path modal and its progress storage (E3).
import type { UiContext } from '../context';
import type { LearningModule } from '../../engine/types';
import { fillAnswerBlock } from './reveal';
import { buildResetRow, markQuestionDone, readLearnProgress } from './learn-progress';
import { esc } from '../text';
import { setupModalA11y } from '../modal';

export function openLearnModal(ctx: UiContext): void  {
  const triggerEl = document.activeElement;
  const modules = ctx.engine.getLearningModules();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Learn the WCA 2030');

  const panel = document.createElement('div');
  panel.className = 'modal-panel learn-modal-panel';

  const modalHeader = document.createElement('div');
  modalHeader.className = 'modal-header';
  const titleEl = document.createElement('h2');
  titleEl.className = 'modal-title';
  titleEl.textContent = 'Learn the WCA 2030';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  modalHeader.appendChild(titleEl);
  modalHeader.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'learn-modal-body';

  // ── Module list view ─────────────────────────────────────────────────
  const showModuleList = () => {
    const progress = readLearnProgress();
    titleEl.textContent = 'Learn the WCA 2030';
    body.innerHTML = '';

    body.appendChild(buildResetRow(showModuleList));

    // Module cards
    for (const mod of modules) {
      const doneSet  = new Set(progress[mod.id] ?? []);
      const total    = mod.questions.length;
      const done     = Math.min(doneSet.size, total);
      const pct      = total > 0 ? (done / total) * 100 : 0;
      const allDone  = done === total && total > 0;

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'learn-module-card' + (allDone ? ' learn-module-card--done' : '');

      card.innerHTML =
        `<div class="learn-module-header">` +
          (allDone ? `<span class="learn-tick" aria-hidden="true">✓</span>` : '') +
          `<span class="learn-module-title">${esc(mod.title)}</span>` +
          `<span class="learn-module-count">${done}/${total}</span>` +
        `</div>` +
        `<p class="learn-module-desc">${esc(mod.description)}</p>` +
        `<div class="learn-prog-track" role="progressbar" aria-label="${esc(mod.title)} progress" aria-valuemin="0" aria-valuenow="${done}" aria-valuemax="${total}">` +
          `<div class="learn-prog-fill" style="width:${pct.toFixed(1)}%"></div>` +
        `</div>`;

      card.addEventListener('click', () => {
        const fresh = readLearnProgress();
        showQuestionStep(mod, 0, fresh);
      });
      body.appendChild(card);
    }
  };

  // ── Question step view ───────────────────────────────────────────────
  const showQuestionStep = (mod: LearningModule, idx: number, progress: Record<string, number[]>) => {
    const total  = mod.questions.length;
    const row    = mod.questions[idx];
    const doneSet = new Set(progress[mod.id] ?? []);

    titleEl.textContent = mod.title;
    body.innerHTML = '';

    // Back + counter
    const topBar = document.createElement('div');
    topBar.className = 'learn-step-topbar';
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'theme-back-btn';
    backBtn.textContent = '← All modules';
    backBtn.addEventListener('click', showModuleList);
    const counter = document.createElement('span');
    counter.className = 'learn-step-counter';
    counter.textContent = `${idx + 1} / ${total}`;
    topBar.appendChild(backBtn);
    topBar.appendChild(counter);

    // Step progress bar
    const stepTrack = document.createElement('div');
    stepTrack.className = 'learn-step-track';
    stepTrack.setAttribute('role', 'progressbar');
    stepTrack.setAttribute('aria-label', 'Question progress');
    stepTrack.setAttribute('aria-valuemin', '0');
    stepTrack.setAttribute('aria-valuenow', String(idx + 1));
    stepTrack.setAttribute('aria-valuemax', String(total));
    const stepFill = document.createElement('div');
    stepFill.className = 'learn-step-fill';
    stepFill.style.width = `${((idx + 1) / total * 100).toFixed(1)}%`;
    stepTrack.appendChild(stepFill);

    // Question
    const qEl = document.createElement('p');
    qEl.className = 'learn-question';
    qEl.textContent = row.question;

    // Show-answer button
    const showBtn = document.createElement('button');
    showBtn.type = 'button';
    showBtn.className = 'learn-show-btn';
    showBtn.textContent = 'Show answer';

    // Answer block (hidden until revealed)
    const answerBlock = document.createElement('div');
    answerBlock.className = 'learn-answer-block';
    answerBlock.hidden = true;
    void fillAnswerBlock(ctx.engine, answerBlock, row);

    showBtn.addEventListener('click', () => {
      answerBlock.hidden = false;
      showBtn.hidden = true;
      markQuestionDone(mod.id, idx, progress);
    });

    // If already completed, show the answer straight away
    if (doneSet.has(idx)) {
      answerBlock.hidden = false;
      showBtn.hidden = true;
    }

    // Prev / Next
    const controls = document.createElement('div');
    controls.className = 'learn-controls';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'learn-nav-btn';
    prevBtn.textContent = '← Previous';
    prevBtn.disabled = idx === 0;
    prevBtn.addEventListener('click', () => showQuestionStep(mod, idx - 1, progress));

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'learn-nav-btn learn-nav-btn--primary';
    nextBtn.textContent = idx === total - 1 ? 'Finish module' : 'Next →';
    nextBtn.addEventListener('click', () => {
      if (idx === total - 1) showModuleList();
      else showQuestionStep(mod, idx + 1, progress);
    });

    controls.appendChild(prevBtn);
    controls.appendChild(nextBtn);

    body.appendChild(topBar);
    body.appendChild(stepTrack);
    body.appendChild(qEl);
    body.appendChild(showBtn);
    body.appendChild(answerBlock);
    body.appendChild(controls);

    // Scroll to top of body on each step change
    body.scrollTop = 0;
  };

  showModuleList();

  panel.appendChild(modalHeader);
  panel.appendChild(body);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  const closeModal = setupModalA11y(backdrop, panel, triggerEl);
  closeBtn.addEventListener('click', closeModal);
}
