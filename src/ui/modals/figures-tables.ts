// Figures and tables modal (E3).
import type { UiContext } from '../context';
import type { FigureTableEntry } from '../../engine/types';
import { esc } from '../text';
import { setupModalA11y } from '../modal';

export function openFiguresTablesModal(ctx: UiContext): void  {
  const triggerEl = document.activeElement;
  const entries = ctx.engine.getFiguresTables();
  const figures = entries.filter(e => e.kind === 'figure');
  const tables  = entries.filter(e => e.kind === 'table');

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Figures and tables');

  const panel = document.createElement('div');
  panel.className = 'modal-panel';

  const modalHeader = document.createElement('div');
  modalHeader.className = 'modal-header';
  const titleEl = document.createElement('h2');
  titleEl.className = 'modal-title';
  titleEl.textContent = 'Figures and tables';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  modalHeader.appendChild(titleEl);
  modalHeader.appendChild(closeBtn);

  const listEl = document.createElement('div');
  listEl.className = 'modal-list';

  // Note at top
  const note = document.createElement('p');
  note.className = 'ft-modal-note';
  note.textContent =
    'Figures and tables are on the cited pages of the official WCA 2030 guidelines.';
  listEl.appendChild(note);

  const buildGroup = (label: string, items: FigureTableEntry[]) => {
    if (items.length === 0) return;
    const heading = document.createElement('h3');
    heading.className = 'ft-modal-group-heading';
    heading.textContent = label;
    listEl.appendChild(heading);

    for (const entry of items) {
      const kindLabel = entry.kind === 'figure' ? 'Figure' : 'Table';
      const citationText = `WCA 2030, ${kindLabel} ${entry.ref} (p.${entry.page})`;

      const row = document.createElement('div');
      row.className = 'ft-modal-row';
      row.innerHTML =
        `<span class="ft-modal-ref">${kindLabel} ${esc(entry.ref)}</span>` +
        `<span class="ft-modal-title">${esc(entry.title)}</span>` +
        `<span class="ft-modal-page">Page ${entry.page} (printed)</span>`;

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'copy-btn ft-modal-copy';
      copyBtn.dataset.citation = citationText;
      copyBtn.textContent = 'Copy citation';
      copyBtn.addEventListener('click', async function(this: HTMLButtonElement) {
        try {
          await navigator.clipboard.writeText(this.dataset.citation ?? '');
          this.textContent = 'Copied!';
        } catch {
          this.textContent = 'Copy failed';
        }
        setTimeout(() => { this.textContent = 'Copy citation'; }, 2000);
      });

      row.appendChild(copyBtn);
      listEl.appendChild(row);
    }
  };

  buildGroup('Figures', figures);
  buildGroup('Tables', tables);

  panel.appendChild(modalHeader);
  panel.appendChild(listEl);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  const closeModal = setupModalA11y(backdrop, panel, triggerEl);
  closeBtn.addEventListener('click', closeModal);
}
