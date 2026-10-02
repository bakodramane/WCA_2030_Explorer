// Questions bank modal (E3: split out of App.ts).
import type { UiContext } from '../context';
import { setupModalA11y } from '../modal';

export function openQaModal(ctx: UiContext): void  {
  const triggerEl = document.activeElement;
  const allQuestions = ctx.engine.getQaQuestions();
  const PAGE_SIZE = 25;
  let shown = PAGE_SIZE;
  let activeFilter = '';

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Questions bank');

  const panel = document.createElement('div');
  panel.className = 'modal-panel';

  const modalHeader = document.createElement('div');
  modalHeader.className = 'modal-header';
  modalHeader.innerHTML = `<h2 class="modal-title">Questions Bank</h2>`;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  modalHeader.appendChild(closeBtn);

  // Filter input — same pattern as glossary
  const filterWrap = document.createElement('div');
  filterWrap.className = 'modal-filter-wrap';
  const filterInput = document.createElement('input');
  filterInput.type = 'search';
  filterInput.className = 'modal-filter-input';
  filterInput.placeholder = 'Filter questions…';
  filterInput.setAttribute('aria-label', 'Filter questions');
  filterWrap.appendChild(filterInput);

  const listEl = document.createElement('div');
  listEl.className = 'modal-list';

  const renderItems = () => {
    const needle = activeFilter.trim().toLowerCase();
    const visible = needle
      ? allQuestions.filter(q => q.toLowerCase().includes(needle))
      : allQuestions;

    listEl.innerHTML = '';
    const page = visible.slice(0, shown);
    for (const q of page) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'modal-question-row';
      row.textContent = q;
      row.addEventListener('click', () => {
        ctx.searchBar.setValue(q);
        void ctx.runSearch(q);
        closeModal();
      });
      listEl.appendChild(row);
    }

    if (shown < visible.length) {
      const moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'modal-show-more';
      moreBtn.textContent = `Show more (${visible.length - shown} remaining)`;
      moreBtn.addEventListener('click', () => {
        shown = Math.min(shown + PAGE_SIZE, visible.length);
        renderItems();
      });
      listEl.appendChild(moreBtn);
    }

    if (visible.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'glossary-empty';
      empty.textContent = 'No questions match your filter.';
      listEl.appendChild(empty);
    }
  };

  filterInput.addEventListener('input', () => {
    activeFilter = filterInput.value;
    shown = PAGE_SIZE;
    renderItems();
  });

  renderItems();

  panel.appendChild(modalHeader);
  panel.appendChild(filterWrap);
  panel.appendChild(listEl);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  const closeModal = setupModalA11y(backdrop, panel, triggerEl);
  closeBtn.addEventListener('click', closeModal);
  setTimeout(() => filterInput.focus(), 50);
}
