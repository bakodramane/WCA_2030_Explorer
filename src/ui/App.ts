import { RetrievalEngine } from '../engine/retrieval';
import { evaluate }         from '../engine/guardrail';
import { logQuery, getLog, clearLog, toCSV } from '../engine/logger';
import { SearchBar }        from './SearchBar';
import { ResultCard }       from './ResultCard';
import type { ItemRow, GlossaryEntry } from '../engine/types';


export class App {
  private engine      = new RetrievalEngine();
  private searchBar   = new SearchBar();
  private resultsArea!: HTMLElement;
  private chipsEl!: HTMLElement;
  private introBody!: HTMLElement;
  private introToggle!: HTMLButtonElement;
  private introCollapsed  = false;
  private firstSearchDone = false;
  private logCtrlEl!: HTMLSpanElement;

  async mount(selector: string): Promise<void> {
    const root = document.querySelector<HTMLElement>(selector);
    if (!root) throw new Error(`Mount target '${selector}' not found`);
    root.innerHTML = '';

    // ── Loading overlay ──────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className   = 'loading-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.innerHTML = `
      <div class="loading-box">
        <p class="loading-text">Loading WCA 2030 index…</p>
        <div class="progress-track">
          <div class="progress-fill"></div>
        </div>
      </div>`;
    root.appendChild(overlay);

    // ── Main layout ──────────────────────────────────────────────────────
    const layout = document.createElement('div');
    layout.className = 'layout';
    layout.innerHTML = `
      <header class="app-header">
        <h1 class="app-title">WCA 2030 Explorer</h1>
      </header>
      <main class="app-main" id="wca-results" aria-live="polite" aria-label="Search results"></main>
      <footer class="app-footer">
        <span class="footer-note">
          Answers are drawn exclusively from WCA 2030 official guidelines.
          <a class="footer-link"
             href="https://openknowledge.fao.org/items/96f7d26a-f0ed-499c-a658-d2ecb68cdfbd"
             target="_blank"
             rel="noopener noreferrer">Official guidelines ↗</a>
        </span>
        <span class="status-dot" id="sw-dot" title="Offline status"></span>
      </footer>`;
    root.appendChild(layout);

    // Mount intro panel, then search bar into header
    const header = layout.querySelector('.app-header')!;
    header.appendChild(this.buildIntroPanel());

    // Search bar row: input + browse buttons
    const searchRow = document.createElement('div');
    searchRow.className = 'search-row';
    searchRow.appendChild(this.searchBar.element);
    searchRow.appendChild(this.buildBrowseButton());
    searchRow.appendChild(this.buildItemsBrowseButton('essential'));
    searchRow.appendChild(this.buildItemsBrowseButton('additional'));
    searchRow.appendChild(this.buildGlossaryButton());
    header.appendChild(searchRow);

    // Suggestion chips — populated after engine loads; hidden after first search
    this.chipsEl = document.createElement('div');
    this.chipsEl.className = 'suggestion-chips';
    header.appendChild(this.chipsEl);

    this.resultsArea = layout.querySelector<HTMLElement>('#wca-results')!;

    // Offline status indicator
    this.initOfflineDot(layout.querySelector<HTMLElement>('#sw-dot')!);

    // Query-log export controls (appended to footer, hidden when log empty)
    this.initLogControls(layout.querySelector<HTMLElement>('.app-footer')!);

    // Service-worker update banner
    this.initSWUpdateBanner(root);

    // Search handler
    document.addEventListener('wca-search', (e: Event) => {
      const { query } = (e as CustomEvent<{ query: string }>).detail;
      void this.runSearch(query);
    });

    // ── Engine initialisation ────────────────────────────────────────────
    try {
      await this.engine.init();
    } catch (err) {
      const box = overlay.querySelector('.loading-box')!;
      box.className = 'loading-box loading-error';
      box.innerHTML = `<p>⚠ Failed to load index.<br><small>${String(err)}</small></p>`;
      return;
    }

    // Populate chips with 6 random questions from the Q&A bank
    this.populateChips();

    // Hide overlay and hand control to the search bar
    overlay.style.display = 'none';
    this.searchBar.focus();
  }

  // ── Random suggestion chips ──────────────────────────────────────────────

  private populateChips(): void {
    const questions = this.engine.getQaQuestions();
    const picks = randomSample(questions, 6);
    this.chipsEl.innerHTML = '';
    for (const label of picks) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        this.searchBar.setValue(label);
        void this.runSearch(label);
      });
      this.chipsEl.appendChild(btn);
    }
  }

  // ── Questions Bank modal ─────────────────────────────────────────────────

  private buildBrowseButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'browse-btn';
    btn.textContent = 'Browse questions';
    btn.setAttribute('aria-label', 'Browse the questions bank');
    btn.addEventListener('click', () => this.openQaModal());
    return btn;
  }

  private openQaModal(): void {
    const questions = this.engine.getQaQuestions();
    const PAGE_SIZE = 25;
    let shown = PAGE_SIZE;

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', 'Questions bank');

    const panel = document.createElement('div');
    panel.className = 'modal-panel';

    // Header
    const modalHeader = document.createElement('div');
    modalHeader.className = 'modal-header';
    modalHeader.innerHTML = `<h2 class="modal-title">Questions Bank</h2>`;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'modal-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    modalHeader.appendChild(closeBtn);

    // List container (scrollable body)
    const listEl = document.createElement('div');
    listEl.className = 'modal-list';

    const renderItems = () => {
      listEl.innerHTML = '';
      for (let i = 0; i < Math.min(shown, questions.length); i++) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'modal-question-row';
        row.textContent = questions[i];
        row.addEventListener('click', () => {
          const q = questions[i];
          this.searchBar.setValue(q);
          void this.runSearch(q);
          closeModal();
        });
        listEl.appendChild(row);
      }

      if (shown < questions.length) {
        const moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'modal-show-more';
        moreBtn.textContent = `Show more (${questions.length - shown} remaining)`;
        moreBtn.addEventListener('click', () => {
          shown = Math.min(shown + PAGE_SIZE, questions.length);
          renderItems();
        });
        listEl.appendChild(moreBtn);
      }
    };

    renderItems();

    panel.appendChild(modalHeader);
    panel.appendChild(listEl);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    const closeModal = () => backdrop.remove();
    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', onKey); }
    });
  }

  private buildItemsBrowseButton(category: 'essential' | 'additional'): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'browse-btn';
    btn.textContent = category === 'essential' ? 'Discover essential items' : 'Explore additional items';
    btn.setAttribute('aria-label', `Browse ${category} items`);
    btn.addEventListener('click', () => this.openItemsModal(category));
    return btn;
  }

  private openItemsModal(category: 'essential' | 'additional'): void {
    const items = this.engine.getItems(category).slice().sort((a, b) => a.code.localeCompare(b.code));
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
    modalHeader.innerHTML = `<h2 class="modal-title">${escHtml(title)}</h2>`;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'modal-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    modalHeader.appendChild(closeBtn);

    const listEl = document.createElement('div');
    listEl.className = 'modal-list';

    for (const item of items) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'modal-item-row';
      row.innerHTML =
        `<span class="modal-item-code">${escHtml(item.code)}</span>` +
        `<span class="modal-item-sep"> — </span>` +
        `<span class="modal-item-name">${escHtml(item.name)}</span>`;
      row.addEventListener('click', () => {
        this.showItemCard(item);
        closeModal();
      });
      listEl.appendChild(row);
    }

    panel.appendChild(modalHeader);
    panel.appendChild(listEl);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    const closeModal = () => backdrop.remove();
    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', onKey); }
    });
  }

  // ── Glossary modal ───────────────────────────────────────────────────────

  private buildGlossaryButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'browse-btn';
    btn.textContent = 'Glossary';
    btn.setAttribute('aria-label', 'Browse the WCA 2030 glossary');
    btn.addEventListener('click', () => this.openGlossaryModal());
    return btn;
  }

  private openGlossaryModal(): void {
    const allEntries: GlossaryEntry[] = this.engine.getGlossary();

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
          `<p class="glossary-definition">${escHtml(entry.definition)}</p>` +
          (entry.reference
            ? `<p class="glossary-reference">${escHtml(entry.reference)}</p>`
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

    // Focus filter on open
    setTimeout(() => filterInput.focus(), 50);

    const closeModal = () => backdrop.remove();
    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', onKey); }
    });
  }

  private showItemCard(item: ItemRow): void {
    if (!this.firstSearchDone) {
      this.firstSearchDone = true;
      this.chipsEl.style.display = 'none';
      this.collapseIntro();
    }
    this.clearResults();
    this.resultsArea.appendChild(ResultCard.renderItem(item));
  }

  // ── Search cascade ───────────────────────────────────────────────────────

  private async runSearch(query: string): Promise<void> {
    if (!query.trim()) return;

    if (!this.firstSearchDone) {
      this.firstSearchDone = true;
      this.chipsEl.style.display = 'none';
      this.collapseIntro();
    }
    this.searchBar.setLoading(true);
    this.clearResults();

    try {
      // ── Tier 0: exact item-code lookup ─────────────────────────────────────
      const itemCode = extractItemCode(query);
      if (itemCode) {
        const item = this.engine.lookupItem(itemCode);
        if (item) {
          logQuery({
            timestamp: new Date().toISOString(),
            query,
            tier:    'item',
            score:   1,
            matched: `${item.code} ${item.name}`,
          });
          this.showItemCard(item);
          this.refreshLogControls();
          return;
        }
      }

      // ── Tier 0b: glossary exact-match ─────────────────────────────────────
      const glossaryEntry = this.engine.lookupTerm(query.trim());
      if (glossaryEntry) {
        logQuery({
          timestamp: new Date().toISOString(),
          query,
          tier:    'glossary',
          score:   1,
          matched: glossaryEntry.term,
        });
        this.resultsArea.appendChild(ResultCard.renderGlossary(glossaryEntry));
        this.refreshLogControls();
        return;
      }

      // ── Tier 1: curated Q&A match ──────────────────────────────────────────
      const qaResult = await this.engine.qaSearch(query);
      if (qaResult) {
        logQuery({
          timestamp: new Date().toISOString(),
          query,
          tier:    'verified',
          score:   qaResult.score,
          matched: qaResult.row.question,
        });
        this.resultsArea.appendChild(ResultCard.renderQA(qaResult, query));
        this.refreshLogControls();
        return;
      }

      // ── Tier 2: document search ────────────────────────────────────────────
      const sectionResults = await this.engine.sectionSearch(query, 10);
      const semanticResults = sectionResults
        .filter(s => s.topChunks.length > 0)
        .map(s => ({
          chunk:     s.topChunks[0].chunk,
          score:     s.score,
          matchType: 'semantic' as const,
        }));

      // ── Tier 3: guardrail ───────────────────────────────────────────────────
      const response = evaluate(
        semanticResults,
        () => this.engine.lexicalSearch(query, 10),
        'enum',
      );

      if (response.answered && response.results) {
        const best = response.results[0];
        logQuery({
          timestamp: new Date().toISOString(),
          query,
          tier:    'document',
          score:   best.score,
          matched: best.chunk.sectionTitle,
        });
        for (const r of response.results) {
          this.resultsArea.appendChild(ResultCard.render(r, query));
        }
        this.resultsArea.appendChild(this.buildEncouragementNote());
      } else {
        logQuery({
          timestamp: new Date().toISOString(),
          query,
          tier:    'not-found',
          score:   0,
          matched: '',
        });
        this.resultsArea.appendChild(ResultCard.renderNotFound(response));
        this.resultsArea.appendChild(this.buildEncouragementNote());
      }
      this.refreshLogControls();

    } catch (err) {
      console.error('[WCA Explorer] search error:', err);
      const p = document.createElement('p');
      p.className   = 'search-error';
      p.textContent = 'An error occurred during search. Please try again.';
      this.resultsArea.appendChild(p);
    } finally {
      this.searchBar.setLoading(false);
    }
  }

  private clearResults(): void {
    this.resultsArea.innerHTML = '';
  }

  // ── Encouragement note ───────────────────────────────────────────────────

  private buildEncouragementNote(): HTMLElement {
    const p = document.createElement('p');
    p.className = 'encouragement-note';
    p.textContent =
      'Not finding what you need? Please share your query log to help improve the app — use the button in the footer below.';
    return p;
  }

  // ── Intro panel ──────────────────────────────────────────────────────────

  private buildIntroPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'intro-panel';

    this.introBody = document.createElement('div');
    this.introBody.className = 'intro-body';
    this.introBody.innerHTML = `
      <div class="intro-grid">
        <section class="intro-section">
          <h2 class="intro-heading">The WCA 2030</h2>
          <p class="intro-text">The World Programme for the Census of Agriculture (WCA) provides
          guidance to FAO Member Countries for conducting national agricultural censuses. The
          WCA 2030 — the eleventh decennial programme — underpins censuses to be implemented
          worldwide between 2026 and 2035.</p>
        </section>
        <section class="intro-section">
          <h2 class="intro-heading">About this Explorer</h2>
          <p class="intro-text">An offline-first tool grounded strictly in the official WCA 2030
          guidelines. Ask a question; receive the exact paragraph from the source document,
          complete with section title and page reference. Every answer is verbatim extracted
          text — no generation, no guesswork. Designed for national statistical officers, census
          planners, and agricultural data specialists who need authoritative answers anywhere,
          even without internet. No server. No data leaves your device.</p>
        </section>
      </div>`;

    this.introToggle = document.createElement('button');
    this.introToggle.type = 'button';
    this.introToggle.className = 'intro-toggle';
    this.introToggle.textContent = '▾ About this Explorer';
    this.introToggle.setAttribute('aria-expanded', 'true');
    this.introToggle.addEventListener('click', () => this.toggleIntro());

    panel.appendChild(this.introBody);
    panel.appendChild(this.introToggle);
    return panel;
  }

  private collapseIntro(): void {
    if (this.introCollapsed) return;
    this.introCollapsed = true;
    this.introBody.classList.add('intro-body--collapsed');
    this.introToggle.textContent = '▸ About this Explorer';
    this.introToggle.setAttribute('aria-expanded', 'false');
  }

  private toggleIntro(): void {
    if (this.introCollapsed) {
      this.introCollapsed = false;
      this.introBody.classList.remove('intro-body--collapsed');
      this.introToggle.textContent = '▾ About this Explorer';
      this.introToggle.setAttribute('aria-expanded', 'true');
    } else {
      this.collapseIntro();
    }
  }

  // ── Query-log controls ───────────────────────────────────────────────────

  private initLogControls(footer: HTMLElement): void {
    this.logCtrlEl = document.createElement('span');
    this.logCtrlEl.className = 'log-controls';

    const exportBtn = document.createElement('button');
    exportBtn.type      = 'button';
    exportBtn.className = 'log-export-btn';
    exportBtn.addEventListener('click', () => void this.shareLog(exportBtn));

    const clearBtn = document.createElement('button');
    clearBtn.type        = 'button';
    clearBtn.className   = 'log-clear-btn';
    clearBtn.textContent = 'Clear log';
    clearBtn.addEventListener('click', () => {
      clearLog();
      this.refreshLogControls();
    });

    this.logCtrlEl.appendChild(exportBtn);
    this.logCtrlEl.appendChild(clearBtn);
    footer.appendChild(this.logCtrlEl);

    this.refreshLogControls();
  }

  private refreshLogControls(): void {
    const count     = getLog().length;
    const exportBtn = this.logCtrlEl.querySelector<HTMLButtonElement>('.log-export-btn')!;
    exportBtn.textContent      = `Share query log (${count})`;
    this.logCtrlEl.style.display = count === 0 ? 'none' : '';
  }

  private async shareLog(btn: HTMLButtonElement): Promise<void> {
    const log = getLog();
    if (log.length === 0) return;

    // Local CSV download (always happens first)
    const csv      = '﻿' + toCSV(log);
    const date     = new Date().toISOString().slice(0, 10);
    const filename = `wca-query-log-${date}.csv`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Brief confirmation message
    const prev = btn.textContent;
    btn.textContent = 'Thank you — downloaded ✓';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = prev;
      btn.disabled = false;
    }, 3500);
  }

  // ── Offline status dot ───────────────────────────────────────────────────

  private initOfflineDot(dot: HTMLElement): void {
    const refresh = () => {
      const active = !!(navigator.serviceWorker?.controller);
      dot.className = `status-dot status-dot--${active ? 'online' : 'loading'}`;
      dot.title     = active ? 'Offline ready' : 'Service worker not yet active';
    };
    refresh();
    navigator.serviceWorker?.addEventListener('controllerchange', refresh);
  }

  // ── Service-worker update banner ─────────────────────────────────────────

  private initSWUpdateBanner(root: HTMLElement): void {
    if (!navigator.serviceWorker) return;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (root.querySelector('.sw-banner')) return;

      const banner = document.createElement('div');
      banner.className = 'sw-banner';
      banner.innerHTML = `
        <span>Guidelines index updated. Reload to apply.</span>
        <button type="button" id="sw-reload-btn">Reload</button>
        <button type="button" id="sw-dismiss-btn">✕</button>`;
      root.appendChild(banner);

      banner.querySelector('#sw-reload-btn')!
        .addEventListener('click', () => location.reload());
      banner.querySelector('#sw-dismiss-btn')!
        .addEventListener('click', () => banner.remove());
    });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Extract a normalised 4-digit item code from a query string.
 * Accepts: "item 115", "item 0115", "0115", "115" → "0115".
 * Returns null if no 3-to-4-digit number is found or if the number is out of
 * the valid 4-digit range (0001–9999).
 */
function extractItemCode(query: string): string | null {
  const clean = query.trim().replace(/^item\s+/i, '').trim();
  const m = clean.match(/\b(\d{3,4})\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!n || n > 9999) return null;
  return String(n).padStart(4, '0');
}

function randomSample<T>(arr: T[], n: number): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}
