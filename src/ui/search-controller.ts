// The search cascade's UI: runs a query through answerQuery, renders the outcome, and keeps the URL,
// results area, filter pills, and live region in step (E3: split out of App.ts).
import { answerQuery } from '../engine/answer';
import { logQuery } from '../engine/logger';
import { deriveResultGroups } from '../engine/outline';
import type { RetrievalEngine } from '../engine/retrieval';
import type { ItemRow } from '../engine/types';
import type { IntroPanel } from './intro';
import type { LogControls } from './log-controls';
import { openGlossaryModal } from './modals/glossary';
import { openQaModal } from './modals/questions-bank';
import { ResultCard } from './ResultCard';
import type { SearchBar } from './SearchBar';
import { populateChips } from './chips';
import type { UiContext } from './context';
import { writeQueryParam } from './url-query';

export interface SearchParts {
  resultsArea: HTMLElement;
  liveRegion: HTMLElement;
  chipsEl: HTMLElement;
  intro: IntroPanel;
  logs: LogControls;
}

export class SearchController implements UiContext {
  private firstSearchDone = false;
  private resultsArea: HTMLElement;
  private liveRegion: HTMLElement;
  private chipsEl: HTMLElement;
  private intro: IntroPanel;
  private logs: LogControls;

  constructor(public engine: RetrievalEngine, public searchBar: SearchBar, parts: SearchParts) {
    ({ resultsArea: this.resultsArea, liveRegion: this.liveRegion, chipsEl: this.chipsEl, intro: this.intro, logs: this.logs } = parts);
  }


  async runSearch(query: string): Promise<void> {
    if (!query.trim()) return;

    if (!this.firstSearchDone) {
      this.firstSearchDone = true;
      this.intro.enterCompactMode();
    }
    this.searchBar.setLoading(true);
    writeQueryParam(query);
    this.clearResults();

    try {
      // The cascade itself lives in src/engine/answer.ts (shared with the eval script).
      const outcome = await answerQuery(this.engine, query);
      const now = (): string => new Date().toISOString();

      switch (outcome.tier) {
        case 'item':
          logQuery({ timestamp: now(), query, tier: 'item', score: 1, matched: `${outcome.item.code} ${outcome.item.name}` });
          this.showItemCard(outcome.item);
          break;

        case 'glossary':
          logQuery({ timestamp: now(), query, tier: 'glossary', score: 1, matched: outcome.entry.term });
          this.resultsArea.appendChild(ResultCard.renderGlossary(outcome.entry));
          break;

        case 'figure-table':
          logQuery({ timestamp: now(), query, tier: 'figure-table', score: 1, matched: `${outcome.entry.kind} ${outcome.entry.ref}` });
          this.resultsArea.appendChild(ResultCard.renderFigureTable(outcome.entry));
          break;

        case 'verified':
          logQuery({ timestamp: now(), query, tier: 'verified', score: outcome.qa.score, matched: outcome.qa.row.question });
          this.resultsArea.appendChild(ResultCard.renderQA(outcome.qa, query));
          break;

        case 'document': {
          const best = outcome.results[0];
          logQuery({ timestamp: now(), query, tier: 'document', score: best.score, matched: best.chunk.sectionTitle });
          const groups = deriveResultGroups(outcome.results);
          if (groups.length > 1) {
            this.resultsArea.appendChild(this.buildFilterBar(groups));
          }
          for (const r of outcome.results) {
            const card = ResultCard.render(r, query);
            card.dataset.group = r.chunk.chapterLabel;
            this.resultsArea.appendChild(card);
          }
          this.resultsArea.appendChild(this.buildEncouragementNote());
          break;
        }

        case 'not-found':
          logQuery({ timestamp: now(), query, tier: 'not-found', score: 0, matched: '' });
          this.resultsArea.appendChild(ResultCard.renderNotFound(outcome.guardrail, {
            onGlossary: () => openGlossaryModal(this),
            onQaBank:   () => openQaModal(this),
            onClear:    () => { this.searchBar.setValue(''); this.clearResults(); },
          }));
          this.resultsArea.appendChild(this.buildEncouragementNote());
          break;
      }
      this.logs.refresh();

    } catch (err) {
      console.error('[WCA Explorer] search error:', err);
      const p = document.createElement('p');
      p.className   = 'search-error';
      p.textContent = 'An error occurred during search. Please try again.';
      this.resultsArea.appendChild(p);
    } finally {
      this.searchBar.setLoading(false);
      this.announceResults();
    }
  }

  private announceResults(): void {
    const cards = this.resultsArea.querySelectorAll('.result-card');
    const notFound = this.resultsArea.querySelector('.not-found-card');
    if (notFound) {
      this.liveRegion.textContent =
        'No results found in WCA 2030 guidelines.';
    } else if (cards.length === 1) {
      this.liveRegion.textContent = '1 result found.';
    } else if (cards.length > 1) {
      this.liveRegion.textContent = `${cards.length} results found.`;
    } else {
      this.liveRegion.textContent = '';
    }
  }

  private clearResults(): void {
    this.resultsArea.innerHTML = '';
  }

  private buildFilterBar(groups: string[]): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'filter-bar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Filter results by chapter or section');

    const applyFilter = (selected: string) => {
      bar.querySelectorAll<HTMLButtonElement>('.filter-pill').forEach(pill => {
        const active = pill.dataset.group === selected;
        pill.classList.toggle('filter-pill--active', active);
        pill.setAttribute('aria-pressed', String(active));
      });
      this.resultsArea.querySelectorAll<HTMLElement>('[data-group]').forEach(card => {
        card.style.display =
          (selected === 'All' || card.dataset.group === selected) ? '' : 'none';
      });
    };

    for (const group of ['All', ...groups]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-pill' + (group === 'All' ? ' filter-pill--active' : '');
      btn.dataset.group = group;
      btn.setAttribute('aria-pressed', String(group === 'All'));
      btn.textContent = group;
      btn.addEventListener('click', () => applyFilter(group));
      bar.appendChild(btn);
    }

    return bar;
  }

  private buildEncouragementNote(): HTMLElement {
    const p = document.createElement('p');
    p.className = 'encouragement-note';
    p.textContent =
      'Not finding what you need? Please share your query log to help improve the app — use the button in the footer below.';
    return p;
  }

  showItemCard(item: ItemRow): void {
    if (!this.firstSearchDone) {
      this.firstSearchDone = true;
      this.intro.enterCompactMode();
    }
    this.clearResults();
    this.resultsArea.appendChild(ResultCard.renderItem(item));
  }

  /** Fill the starter chips from the curated questions. */
  populateChips(): void { populateChips(this, this.chipsEl); }
}
