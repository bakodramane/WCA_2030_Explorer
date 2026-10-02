// Learn / Browse hubs, the flat action groups, and the generic hub modal (E3).
import type { UiContext } from '../context';
import { openHubModal } from '../modal';
import { openFiguresTablesModal } from './figures-tables';
import { openGlossaryModal } from './glossary';
import { openItemsModal } from './items';
import { openLearnModal } from './learn';
import { openQaModal } from './questions-bank';
import { openTestModal } from './self-test';
import { openThemeModal } from './themes';

/**
 * Builds the Learn and Browse groups shown directly on the home page on wide
 * screens. Each button reuses the same modal-opening method the hub modals
 * trigger, so nothing diverges between the mobile and desktop entry points.
 */
export function buildActionGroups(ctx: UiContext): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'action-groups';
  wrap.setAttribute('aria-label', 'Learn and browse WCA 2030 content');

  wrap.appendChild(buildActionGroup('Learn', [
    ['Guided learning path', () => openLearnModal(ctx)],
    ['Test yourself',        () => openTestModal(ctx)],
    ['Glossary',             () => openGlossaryModal(ctx)],
  ]));

  wrap.appendChild(buildActionGroup('Browse', [
    ['Questions bank',   () => openQaModal(ctx)],
    ['Essential items',  () => openItemsModal(ctx, 'essential')],
    ['Additional items', () => openItemsModal(ctx, 'additional')],
    ['Explore by theme', () => openThemeModal(ctx)],
  ]));

  return wrap;
}

function buildActionGroup(heading: string, actions: Array<[string, () => void]>): HTMLElement {
  const group = document.createElement('div');
  group.className = 'action-group';

  const headingEl = document.createElement('p');
  headingEl.className = 'action-group-heading';
  headingEl.id = `action-group-${heading.toLowerCase()}`;
  headingEl.textContent = heading;
  group.appendChild(headingEl);

  const row = document.createElement('div');
  row.className = 'action-group-buttons';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-labelledby', headingEl.id);
  for (const [label, action] of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'action-btn';
    btn.textContent = label;
    btn.addEventListener('click', action);
    row.appendChild(btn);
  }
  group.appendChild(row);
  return group;
}

export function buildLearnHubButton(ctx: UiContext): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'browse-btn';
  btn.textContent = 'Learn';
  btn.setAttribute('aria-label', 'Learn the WCA 2030');
  btn.addEventListener('click', () => openLearnHubModal(ctx));
  return btn;
}

export function buildBrowseHubButton(ctx: UiContext): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'browse-btn';
  btn.textContent = 'Browse';
  btn.setAttribute('aria-label', 'Browse WCA 2030 content');
  btn.addEventListener('click', () => openBrowseHubModal(ctx));
  return btn;
}

export function openLearnHubModal(ctx: UiContext): void  {
  openHubModal('Learn', 'Learn the WCA 2030', [
    {
      label:       'Guided learning path',
      description: 'Work through the WCA 2030 module by module with questions and verified answers.',
      action:      (close) => { close(); openLearnModal(ctx); },
    },
    {
      label:       'Test yourself',
      description: 'Flashcard self-check — draw random questions and mark what you know.',
      action:      (close) => { close(); openTestModal(ctx); },
    },
    {
      label:       'Glossary',
      description: 'Browse and search WCA 2030 terms with verbatim definitions.',
      action:      (close) => { close(); openGlossaryModal(ctx); },
    },
  ], 'All content is drawn verbatim from the WCA 2030 guidelines. Progress is stored locally on this device only.');
}

export function openBrowseHubModal(ctx: UiContext): void  {
  openHubModal('Browse', 'Browse WCA 2030 content', [
    {
      label:       'Questions bank',
      description: 'Browse all curated questions drawn from the WCA 2030 guidelines.',
      action:      (close) => { close(); openQaModal(ctx); },
    },
    {
      label:       'Items catalogue',
      description: 'Essential and additional census items with descriptions and reference periods.',
      action:      (close) => { close(); openItemsSubHubModal(ctx); },
    },
    {
      label:       'Explore by theme',
      description: 'Items grouped by the twelve WCA 2030 data themes.',
      action:      (close) => { close(); openThemeModal(ctx); },
    },
    {
      label:       'Figures and tables',
      description: 'All figures and tables from the WCA 2030 guidelines, with page references.',
      action:      (close) => { close(); openFiguresTablesModal(ctx); },
    },
  ]);
}

export function openItemsSubHubModal(ctx: UiContext): void  {
  openHubModal('Items catalogue', 'Items catalogue', [
    {
      label:       'Essential items',
      description: 'The core set of items that all countries are expected to collect.',
      action:      (close) => { close(); openItemsModal(ctx, 'essential'); },
    },
    {
      label:       'Additional items',
      description: 'Supplementary items for countries wishing to collect more in-depth data.',
      action:      (close) => { close(); openItemsModal(ctx, 'additional'); },
    },
  ]);
}
