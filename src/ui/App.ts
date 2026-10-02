// Application shell: builds the layout and wires the controllers and modals together (E3: the
// modals, search controller, intro panel, log controls, and service-worker code live in their own files).
import { RetrievalEngine } from '../engine/retrieval';
import { IntroPanel } from './intro';
import { GUIDELINES_URL } from './links';
import { setKnownItemCodes } from './linkify';
import { LogControls } from './log-controls';
import { buildActionGroups, buildBrowseHubButton, buildLearnHubButton } from './modals/hubs';
import { SearchController } from './search-controller';
import { readQueryParam } from './url-query';
import { SearchBar } from './SearchBar';
import { checkIndexVersion, initOfflineStatus, initSWUpdateBanner } from './sw';

export class App {
  private engine    = new RetrievalEngine();
  private searchBar = new SearchBar();

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
        <p class="loading-text">Preparing offline WCA 2030 index. First visit may take longer; future visits work offline.</p>
        <p class="loading-subtext">Downloading the search index and model for offline use.</p>
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
        <p class="app-subtitle">Find official WCA 2030 guidance with page-cited excerpts.</p>
        <p class="trust-strip">Official WCA 2030 source · Answers are verbatim excerpts · Curated summaries are clearly labelled · Page citations · Works offline · No tracking</p>
      </header>
      <main class="app-main" id="wca-results" aria-live="polite" aria-label="Search results"></main>
      <footer class="app-footer">
        <span class="footer-note">
          Answers are drawn exclusively from WCA 2030 official guidelines. No data leaves this device.
          <a class="footer-link"
             href="${GUIDELINES_URL}"
             target="_blank"
             rel="noopener noreferrer">Official guidelines ↗</a>
        </span>
        <span class="status-indicator" id="sw-status" aria-live="polite" aria-atomic="true">
          <span class="status-dot" aria-hidden="true"></span>
          <span class="status-label"></span>
        </span>
      </footer>`;
    root.appendChild(layout);

    // Mount intro panel, then search bar into header
    const header = layout.querySelector('.app-header')!;
    const chipsEl = document.createElement('div');
    chipsEl.className = 'suggestion-chips';
    const intro = new IntroPanel(chipsEl);
    const logs = new LogControls();

    // Visually-hidden live region — screen readers announce result count
    const liveRegion = document.createElement('p');
    liveRegion.className = 'sr-only';
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    root.appendChild(liveRegion);

    const search = new SearchController(this.engine, this.searchBar, {
      resultsArea: layout.querySelector<HTMLElement>('#wca-results')!, liveRegion, chipsEl, intro, logs,
    });

    header.appendChild(intro.buildIntroPanel());

    // Search bar row: input + (on mobile) compact hub buttons
    const searchRow = document.createElement('div');
    searchRow.className = 'search-row';
    searchRow.appendChild(this.searchBar.element);

    // Mobile (≤600px): two hub buttons that open the Learn/Browse hub modals.
    // Hidden on wide screens via CSS in favour of the flat action groups below.
    const hubButtons = document.createElement('div');
    hubButtons.className = 'hub-buttons';
    hubButtons.appendChild(buildLearnHubButton(search));
    hubButtons.appendChild(buildBrowseHubButton(search));
    searchRow.appendChild(hubButtons);
    header.appendChild(searchRow);

    // Wide screens (>600px): flat Learn/Browse groups shown directly on the
    // home page. Hidden on mobile via CSS to save vertical space.
    header.appendChild(buildActionGroups(search));

    // Suggestion chips — populated after engine loads; hidden after first search
    header.appendChild(chipsEl);

    // Delegated handler for cross-reference item links inserted by linkifyItems()
    layout.querySelector<HTMLElement>('#wca-results')!.addEventListener('click', (e: Event) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-item-ref]');
      if (!a) return;
      e.preventDefault();
      const item = this.engine.lookupItem(a.dataset.itemRef!);
      if (item) search.showItemCard(item);
    });

    // Offline status indicator (returns fn to call after engine init)
    const refreshStatus = initOfflineStatus(layout.querySelector<HTMLElement>('#sw-status')!);

    // Query-log export controls (appended to footer, hidden when log empty)
    logs.init(layout.querySelector<HTMLElement>('.app-footer')!);

    // Service-worker update banner
    initSWUpdateBanner(root);

    // Search handler
    document.addEventListener('wca-search', (e: Event) => {
      const { query } = (e as CustomEvent<{ query: string }>).detail;
      void search.runSearch(query);
    });

    // ── Engine initialisation ────────────────────────────────────────────
    try {
      await this.engine.init();
      setKnownItemCodes(new Set(this.engine.getItems().map(i => i.code)));
      refreshStatus(); // update dot from 'Preparing' to ready/pending
      void checkIndexVersion(root);
    } catch (err) {
      const box = overlay.querySelector('.loading-box')!;
      box.className = 'loading-box loading-error';
      box.innerHTML = `<p>⚠ Failed to load index.<br><small>${String(err)}</small></p>`;
      return;
    }

    // Populate chips with 6 random questions from the Q&A bank
    search.populateChips();

    // Hide overlay and hand control to the search bar
    overlay.style.display = 'none';
    this.searchBar.focus();

    // D3: ?q=<query> deep link runs the query on load.
    const deepLinked = readQueryParam();
    if (deepLinked) {
      this.searchBar.setValue(deepLinked);
      void search.runSearch(deepLinked);
    }
  }
}
