import { RetrievalEngine } from '../engine/retrieval';
import { evaluate } from '../engine/guardrail';
import { SearchBar } from './SearchBar';
import { ResultCard } from './ResultCard';
const SUGGESTION_CHIPS = [
    'What is an agricultural holding?',
    'What are the agricultural census modalities?',
    'List of essential items',
    'What is the cut-off threshold for agricultural holdings?',
    'How is land classified in the WCA 2030?',
    'What is the census reference period?',
    'What are the themes of the WCA 2030?',
];
export class App {
    constructor() {
        this.engine = new RetrievalEngine();
        this.searchBar = new SearchBar();
        this.firstSearchDone = false;
    }
    async mount(selector) {
        const root = document.querySelector(selector);
        if (!root)
            throw new Error(`Mount target '${selector}' not found`);
        root.innerHTML = '';
        // ── Loading overlay ──────────────────────────────────────────────────
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
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
        // Mount search bar into header
        const header = layout.querySelector('.app-header');
        header.appendChild(this.searchBar.element);
        // Suggestion chips — hidden after first search
        this.chipsEl = document.createElement('div');
        this.chipsEl.className = 'suggestion-chips';
        for (const label of SUGGESTION_CHIPS) {
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
        header.appendChild(this.chipsEl);
        this.resultsArea = layout.querySelector('#wca-results');
        // Offline status indicator
        this.initOfflineDot(layout.querySelector('#sw-dot'));
        // Service-worker update banner
        this.initSWUpdateBanner(root);
        // Search handler
        document.addEventListener('wca-search', (e) => {
            const { query } = e.detail;
            void this.runSearch(query);
        });
        // ── Engine initialisation ────────────────────────────────────────────
        try {
            await this.engine.init();
        }
        catch (err) {
            const box = overlay.querySelector('.loading-box');
            box.className = 'loading-box loading-error';
            box.innerHTML = `<p>⚠ Failed to load index.<br><small>${String(err)}</small></p>`;
            return;
        }
        // Hide overlay and hand control to the search bar
        overlay.style.display = 'none';
        this.searchBar.focus();
    }
    // ── Search cascade ───────────────────────────────────────────────────────
    async runSearch(query) {
        if (!this.firstSearchDone) {
            this.firstSearchDone = true;
            this.chipsEl.style.display = 'none';
        }
        this.searchBar.setLoading(true);
        this.clearResults();
        try {
            // sectionSearch averages the top-3 chunk scores per section (Fix 1),
            // excludes artefact sections spanning > 40 pages (Fix 2), and boosts
            // sections whose title contains query content words (Fix 3).
            // We take the top chunk from each section result as the display unit
            // so the guardrail and ResultCard APIs remain unchanged.
            const sectionResults = await this.engine.sectionSearch(query, 10);
            const semanticResults = sectionResults
                .filter(s => s.topChunks.length > 0)
                .map(s => ({
                chunk: s.topChunks[0].chunk,
                score: s.score,
                matchType: 'semantic',
            }));
            const response = evaluate(semanticResults, () => this.engine.lexicalSearch(query, 10), 'enum');
            if (response.answered && response.results) {
                for (const r of response.results) {
                    this.resultsArea.appendChild(ResultCard.render(r, query));
                }
            }
            else {
                this.resultsArea.appendChild(ResultCard.renderNotFound(response));
            }
        }
        catch (err) {
            console.error('[WCA Explorer] search error:', err);
            const p = document.createElement('p');
            p.className = 'search-error';
            p.textContent = 'An error occurred during search. Please try again.';
            this.resultsArea.appendChild(p);
        }
        finally {
            this.searchBar.setLoading(false);
        }
    }
    clearResults() {
        this.resultsArea.innerHTML = '';
    }
    // ── Offline status dot ───────────────────────────────────────────────────
    initOfflineDot(dot) {
        const refresh = () => {
            const active = !!(navigator.serviceWorker?.controller);
            dot.className = `status-dot status-dot--${active ? 'online' : 'loading'}`;
            dot.title = active ? 'Offline ready' : 'Service worker not yet active';
        };
        refresh();
        navigator.serviceWorker?.addEventListener('controllerchange', refresh);
    }
    // ── Service-worker update banner ─────────────────────────────────────────
    initSWUpdateBanner(root) {
        if (!navigator.serviceWorker)
            return;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            // A new SW has taken control — prompt the user to reload
            if (root.querySelector('.sw-banner'))
                return; // already shown
            const banner = document.createElement('div');
            banner.className = 'sw-banner';
            banner.innerHTML = `
        <span>Guidelines index updated. Reload to apply.</span>
        <button type="button" id="sw-reload-btn">Reload</button>
        <button type="button" id="sw-dismiss-btn">✕</button>`;
            root.appendChild(banner);
            banner.querySelector('#sw-reload-btn')
                .addEventListener('click', () => location.reload());
            banner.querySelector('#sw-dismiss-btn')
                .addEventListener('click', () => banner.remove());
        });
    }
}
