// Guided-learning progress, kept in localStorage (E3: split out of learn.ts).

export function readLearnProgress(): Record<string, number[]> {
  try {
    const stored = localStorage.getItem('wca_learn_progress');
    return stored ? JSON.parse(stored) : {};
  } catch { return {}; }
}

export function saveLearnProgress(progress: Record<string, number[]>): void {
  try { localStorage.setItem('wca_learn_progress', JSON.stringify(progress)); } catch { /* ignore */ }
}

export function markQuestionDone(moduleId: string, idx: number, progress: Record<string, number[]>): void {
  if (!progress[moduleId]) progress[moduleId] = [];
  if (!progress[moduleId].includes(idx)) {
    progress[moduleId].push(idx);
    saveLearnProgress(progress);
  }
}

/** "Reset all progress" with an inline confirm/cancel (no native dialog); `onChange` re-renders the module list. */
export function buildResetRow(onChange: () => void): HTMLElement {
  const resetRow = document.createElement('div');
  resetRow.className = 'learn-reset-row';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'learn-reset-btn';
  resetBtn.textContent = 'Reset all progress';
  resetBtn.addEventListener('click', () => {
    // Replace button with inline confirm/cancel to avoid native dialog
    resetRow.innerHTML = '';
    const msg = document.createElement('span');
    msg.className = 'learn-reset-confirm-msg';
    msg.textContent = 'This will erase all module progress. Continue?';
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'learn-reset-confirm-btn';
    confirmBtn.textContent = 'Yes, reset';
    confirmBtn.addEventListener('click', () => {
      try { localStorage.removeItem('wca_learn_progress'); } catch { /* ignore */ }
      onChange();
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'learn-reset-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', onChange);
    resetRow.appendChild(msg);
    resetRow.appendChild(confirmBtn);
    resetRow.appendChild(cancelBtn);
    confirmBtn.focus();
  });
  resetRow.appendChild(resetBtn);
  return resetRow;
}
