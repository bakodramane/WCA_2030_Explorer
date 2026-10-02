import { esc } from './text';

// Modal accessibility: focus trap, Escape and backdrop close, aria-labelledby (E3: split out of App.ts).

/**
 * Attach accessibility behaviour to a modal:
 *   - assigns a unique ID to h2.modal-title and sets aria-labelledby on backdrop
 *   - moves focus to the title (tabindex=-1) for screen-reader announcement
 *   - traps Tab/Shift-Tab within panel
 *   - closes on Escape or backdrop click
 *   - returns focus to triggerEl on close
 *
 * Returns the close function; wire it to every close button.
 */
export function setupModalA11y(
  backdrop: HTMLElement,
  panel: HTMLElement,
  triggerEl: Element | null,
): () => void {
  // aria-labelledby pointing to the modal heading
  const titleEl = panel.querySelector<HTMLElement>('h2.modal-title');
  if (titleEl) {
    if (!titleEl.id) titleEl.id = `wca-modal-${Math.random().toString(36).slice(2, 9)}`;
    backdrop.setAttribute('aria-labelledby', titleEl.id);
    titleEl.setAttribute('tabindex', '-1');
    titleEl.focus();
  } else {
    (getModalFocusable(panel)[0] ?? panel).focus?.();
  }

  // Tab trap
  const onTab = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const els = getModalFocusable(panel);
    if (els.length === 0) return;
    const first = els[0];
    const last  = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  };
  panel.addEventListener('keydown', onTab);

  // Escape closes
  const onEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  };
  panel.addEventListener('keydown', onEsc);

  // Backdrop click closes
  const onBackdrop = (e: MouseEvent) => {
    if (e.target === backdrop) close();
  };
  backdrop.addEventListener('click', onBackdrop);

  const close = () => {
    panel.removeEventListener('keydown', onTab);
    panel.removeEventListener('keydown', onEsc);
    backdrop.removeEventListener('click', onBackdrop);
    backdrop.remove();
    (triggerEl as HTMLElement | null)?.focus();
  };

  return close;
}

/** All naturally-focusable (tab-order) elements inside a container. */
function getModalFocusable(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), ' +
    '[href], [tabindex]:not([tabindex="-1"])',
  )].filter(el => !el.closest('[hidden]'));
}

export function openHubModal(
  title: string,
  ariaLabel: string,
  choices: Array<{ label: string; description: string; action: (close: () => void) => void }>,
  preamble?: string,
): void {
  const triggerEl = document.activeElement;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', ariaLabel);

  const panel = document.createElement('div');
  panel.className = 'modal-panel';

  const modalHeader = document.createElement('div');
  modalHeader.className = 'modal-header';
  const titleEl = document.createElement('h2');
  titleEl.className = 'modal-title';
  titleEl.textContent = title;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  modalHeader.appendChild(titleEl);
  modalHeader.appendChild(closeBtn);

  const listEl = document.createElement('div');
  listEl.className = 'modal-list hub-modal-list';

  if (preamble) {
    const note = document.createElement('p');
    note.className = 'hub-preamble';
    note.textContent = preamble;
    listEl.appendChild(note);
  }

  // Declared with let so closures in the for-loop capture the variable
  // reference; by the time any click fires, setupModalA11y has assigned it.
  let closeModal: () => void = () => {};

  for (const choice of choices) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'hub-choice-row';
    row.innerHTML =
      `<span class="hub-choice-label">${esc(choice.label)}</span>` +
      `<span class="hub-choice-desc">${esc(choice.description)}</span>`;
    row.addEventListener('click', () => choice.action(closeModal));
    listEl.appendChild(row);
  }

  panel.appendChild(modalHeader);
  panel.appendChild(listEl);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  closeModal = setupModalA11y(backdrop, panel, triggerEl);
  closeBtn.addEventListener('click', closeModal);
}
