// Glossary modal (E3).
import type { UiContext } from '../context';
import type { GlossaryEntry } from '../../engine/types';
import { esc } from '../text';
import { setupModalA11y } from '../modal';

export function openGlossaryModal(ctx: UiContext): void  {
  const triggerEl = document.activeElement;
  const allEntries: GlossaryEntry[] = ctx.engine.getGlossary();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'WCA 2030 Glossary');

  const panel = document.createElement('div');
  panel.className = 'modal-panel';

  // Header
  const modalHeader = document.createElement('div');
  modalHeader.className = 'modal-header';
  modalHeader.innerHTML = `<h2 class="modal-title">WCA 2030 Glossary</h2>`;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  modalHeader.appendChild(closeBtn);

  // Filter input
  const filterWrap = document.createElement('div');
  filterWrap.className = 'modal-filter-wrap';
  const filterInput = document.createElement('input');
  filterInput.type = 'search';
  filterInput.className = 'modal-filter-input';
  filterInput.placeholder = 'Filter terms…';
  filterInput.setAttribute('aria-label', 'Filter glossary terms');
  filterWrap.appendChild(filterInput);

  // List
  const listEl = document.createElement('div');
  listEl.className = 'modal-list glossary-modal-list';

  // Track which entry is expanded
  let expandedTerm: string | null = null;

  const renderList = (filter: string) => {
    const needle = filter.trim().toLowerCase();
    const visible = needle
      ? allEntries.filter(e => e.term.toLowerCase().includes(needle))
      : allEntries;

    listEl.innerHTML = '';
    for (const entry of visible) {
      const row = document.createElement('div');
      row.className = 'glossary-row';

      const termBtn = document.createElement('button');
      termBtn.type = 'button';
      termBtn.className = 'glossary-term-btn';
      termBtn.textContent = entry.term;

      const detail = document.createElement('div');
      detail.className = 'glossary-detail';
      detail.hidden = expandedTerm !== entry.term;
      detail.innerHTML =
        `<p class="glossary-definition">${esc(entry.definition)}</p>` +
        (entry.reference
          ? `<p class="glossary-reference">${esc(entry.reference)}</p>`
          : '');

      termBtn.addEventListener('click', () => {
        const isOpen = !detail.hidden;
        // Collapse all others
        listEl.querySelectorAll<HTMLElement>('.glossary-detail').forEach(d => {
          d.hidden = true;
        });
        listEl.querySelectorAll('.glossary-term-btn').forEach(b => {
          b.classList.remove('glossary-term-btn--open');
        });
        if (!isOpen) {
          detail.hidden = false;
          termBtn.classList.add('glossary-term-btn--open');
          expandedTerm = entry.term;
        } else {
          expandedTerm = null;
        }
      });

      row.appendChild(termBtn);
      row.appendChild(detail);
      listEl.appendChild(row);
    }

    if (visible.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'glossary-empty';
      empty.textContent = 'No terms match your filter.';
      listEl.appendChild(empty);
    }
  };

  renderList('');
  filterInput.addEventListener('input', () => {
    expandedTerm = null;
    renderList(filterInput.value);
  });

  panel.appendChild(modalHeader);
  panel.appendChild(filterWrap);
  panel.appendChild(listEl);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  const closeModal = setupModalA11y(backdrop, panel, triggerEl);
  closeBtn.addEventListener('click', closeModal);
  // Override title focus with filter input after screen-reader announcement
  setTimeout(() => filterInput.focus(), 50);
}
