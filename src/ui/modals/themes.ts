// Explore-by-theme modal (E3).
import type { UiContext } from '../context';
import { esc } from '../text';
import { setupModalA11y } from '../modal';

export function openThemeModal(ctx: UiContext): void  {
  const triggerEl = document.activeElement;
  const themes = ctx.engine.getThemes();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Explore by theme');

  const panel = document.createElement('div');
  panel.className = 'modal-panel';

  const modalHeader = document.createElement('div');
  modalHeader.className = 'modal-header';
  const titleEl = document.createElement('h2');
  titleEl.className = 'modal-title';
  titleEl.textContent = 'Explore by Theme';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  modalHeader.appendChild(titleEl);
  modalHeader.appendChild(closeBtn);

  const listEl = document.createElement('div');
  listEl.className = 'modal-list theme-modal-list';

  // Render the theme list view
  const showThemeList = () => {
    listEl.innerHTML = '';
    titleEl.textContent = 'Explore by Theme';

    for (const theme of themes) {
      const items = ctx.engine.getItemsByTheme(theme);
      const count = items.length;

      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'theme-row';
      row.innerHTML =
        `<span class="theme-row-label">${esc(theme)}</span>` +
        `<span class="theme-row-count">${count} item${count !== 1 ? 's' : ''}</span>`;
      row.addEventListener('click', () => showItemsForTheme(theme));
      listEl.appendChild(row);
    }
  };

  // Render the items-within-a-theme view
  const showItemsForTheme = (theme: string) => {
    const items = ctx.engine.getItemsByTheme(theme);
    const essential   = items.filter(i => i.category === 'essential')
                             .sort((a, b) => a.code.localeCompare(b.code));
    const additional  = items.filter(i => i.category === 'additional')
                             .sort((a, b) => a.code.localeCompare(b.code));

    listEl.innerHTML = '';
    titleEl.textContent = theme;

    // Back button
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'theme-back-btn';
    backBtn.textContent = '← All themes';
    backBtn.addEventListener('click', showThemeList);
    listEl.appendChild(backBtn);

    const renderGroup = (label: string, group: typeof essential) => {
      if (group.length === 0) return;
      const heading = document.createElement('p');
      heading.className = 'theme-group-heading';
      heading.textContent = label;
      listEl.appendChild(heading);

      for (const item of group) {
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
    };

    renderGroup('Essential items', essential);
    renderGroup('Additional items', additional);
  };

  showThemeList();

  panel.appendChild(modalHeader);
  panel.appendChild(listEl);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  const closeModal = setupModalA11y(backdrop, panel, triggerEl);
  closeBtn.addEventListener('click', closeModal);
}
