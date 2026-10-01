// Header intro panel and the compact header after the first search (D1; E3: split out of App.ts).
export class IntroPanel {
  private introBody!: HTMLElement;
  private introToggle!: HTMLButtonElement;
  private introCollapsed = false;

  constructor(private chipsEl: HTMLElement) {}

  buildIntroPanel(): HTMLElement {
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

    // Collapse by default on mobile so the search bar is immediately visible
    if (window.matchMedia('(max-width: 600px)').matches) {
      this.introCollapsed = true;
      this.introBody.classList.add('intro-body--collapsed');
      this.introToggle.textContent = '▸ About this Explorer';
      this.introToggle.setAttribute('aria-expanded', 'false');
    }

    panel.appendChild(this.introBody);
    panel.appendChild(this.introToggle);
    return panel;
  }

  /**
   * D1: after the first search the header shrinks to a compact bar (title + search box) so the first
   * result is above the fold. Subtitle, trust strip, About panel, Learn/Browse groups, and chips
   * stay available behind the "Browse & learn" toggle.
   */
  enterCompactMode(): void {
    const header = document.querySelector<HTMLElement>('.app-header');
    this.chipsEl.style.display = 'none';
    this.collapseIntro();
    if (!header || header.classList.contains('app-header--compact')) return;
    header.classList.add('app-header--compact');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'browse-learn-toggle';
    toggle.textContent = 'Browse & learn';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      const open = header.classList.toggle('app-header--expanded');
      toggle.setAttribute('aria-expanded', String(open));
      if (open) this.chipsEl.style.display = '';
      else this.chipsEl.style.display = 'none';
    });
    header.querySelector('.app-title')!.after(toggle);
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
}
