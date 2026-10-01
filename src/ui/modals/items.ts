// Essential / additional items modal (E3).
import type { UiContext } from '../context';
import { esc } from '../text';
import { setupModalA11y } from '../modal';

export function openItemsModal(ctx: UiContext, category: 'essential' | 'additional'): void  {
  const triggerEl = document.activeElement;
  const allItems = ctx.engine.getItems(category).slice().sort((a, b) => a.code.localeCompare(b.code));
  const title = category === 'essential' ? 'Essential Items' : 'Additional Items';

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', title);

  const panel = document.createElement('div');
  panel.className = 'modal-panel';

  const modalHeader = document.createElement('div');
  modalHeader.className = 'modal-header';
  modalHeader.innerHTML = `<h2 class="modal-title">${esc(title)}</h2>`;
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
  filterInput.placeholder = 'Filter by code or name…';
  filterInput.setAttribute('aria-label', `Filter ${title.toLowerCase()}`);
  filterWrap.appendChild(filterInput);

  const listEl = document.createElement('div');
  listEl.className = 'modal-list';

  const renderItems = (filter: string) => {
    const needle = filter.trim().toLowerCase();
    const visible = needle
      ? allItems.filter(i =>
          i.code.toLowerCase().includes(needle) ||
          i.name.toLowerCase().includes(needle))
      : allItems;

    listEl.innerHTML = '';
    for (const item of visible) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'modal-item-row';
      row.innerHTML =
        `<span class="modal-item-code">${esc(item.code)}</span>` +
        `<span class="modal-item-sep"> — </span>` +
        `<span class="modal-item-name">${esc(item.name)}</span>`;
      row.addEventListener('click', () => {
        ctx.showItemCard(item);
        closeModal();
      });
      listEl.appendChild(row);
    }

    if (visible.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'glossary-empty';
      empty.textContent = 'No items match your filter.';
      listEl.appendChild(empty);
    }
  };

  filterInput.addEventListener('input', () => renderItems(filterInput.value));
  renderItems('');

  panel.appendChild(modalHeader);
  panel.appendChild(filterWrap);
  panel.appendChild(listEl);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  const closeModal = setupModalA11y(backdrop, panel, triggerEl);
  closeBtn.addEventListener('click', closeModal);
  setTimeout(() => filterInput.focus(), 50);
}
