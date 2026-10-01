// Starter question chips shown on the home view (E3: split out of the search controller).
import type { UiContext } from './context';

function randomSample<T>(arr: T[], n: number): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

/** Three fixed examples plus six random curated questions; on mobile only the first three show until "More examples". */
export function populateChips(ctx: UiContext, chipsEl: HTMLElement): void {
  const CURATED = [
    'What is an agricultural holding?',
    'What are the essential items?',
    'How should livestock be counted?',
  ];
  const questions = ctx.engine.getQaQuestions();
  const pool  = questions.filter(q => !CURATED.includes(q));
  const picks = randomSample(pool, 6);
  chipsEl.innerHTML = '';
  const all = [...CURATED, ...picks];
  for (let i = 0; i < all.length; i++) {
    const label = all[i];
    const btn = document.createElement('button');
    btn.type = 'button';
    // On mobile, chips beyond the first 3 are hidden until "More examples" is tapped
    btn.className = i >= 3 ? 'chip chip--overflow' : 'chip';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      ctx.searchBar.setValue(label);
      void ctx.runSearch(label);
    });
    chipsEl.appendChild(btn);
  }

  // "More examples" control — CSS hides it on desktop; shown on mobile until expanded
  const moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  moreBtn.className = 'chip chip--more-toggle';
  moreBtn.textContent = 'More examples…';
  moreBtn.addEventListener('click', () => {
    chipsEl.classList.add('chips--expanded');
  });
  chipsEl.appendChild(moreBtn);
}
