import type { RankedResult, QaResult, ItemRow, DescriptionBlock } from '../engine/types';
import type { GuardrailResponse } from '../engine/guardrail';
import { STOP_WORDS } from '../engine/stopwords';

// ── Safety helpers ────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Term highlighting ─────────────────────────────────────────────────────────
// 1. Escape the verbatim text so no raw HTML leaks through.
// 2. Split on non-word characters so trailing punctuation (e.g. "holder?")
//    does not prevent a match in the chunk text.
// 3. Keep only content words: length ≥ 4 AND not in STOP_WORDS.
//    For "what is the definition of a holder?" this leaves only
//    "definition" and "holder" — stop words like "what", "the", "is"
//    are never highlighted.

function highlight(text: string, query: string): string {
  const escaped = esc(text);
  const tokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter(t => t.length >= 4 && !STOP_WORDS.has(t))
    .map(escRe);
  if (tokens.length === 0) return escaped;
  const re = new RegExp(`(${tokens.join('|')})`, 'gi');
  return escaped.replace(re, '<mark>$1</mark>');
}

// ── Score normalisation ───────────────────────────────────────────────────────
// Cosine similarity (semantic):  0 – 1  → multiply by 100 for %
// BM25 (lexical):                0 – ∞  → normalise against 20 as a soft max

function scoreBar(score: number, matchType: 'semantic' | 'lexical'): number {
  const pct = matchType === 'semantic'
    ? Math.abs(score) * 100
    : (score / 20) * 100;
  return Math.min(Math.max(pct, 0), 100);
}

function scoreLabel(score: number, matchType: 'semantic' | 'lexical'): string {
  const displayScore = Math.min(score, 1.0);
  return matchType === 'semantic'
    ? `${(displayScore * 100).toFixed(0)}%`
    : score.toFixed(1);
}

// ── Public API ────────────────────────────────────────────────────────────────

export class ResultCard {
  /** Render one RankedResult as an <article> element. */
  static render(result: RankedResult, query: string): HTMLElement {
    const { chunk, score, matchType } = result;
    const pct     = scoreBar(score, matchType);
    const label   = scoreLabel(score, matchType);

    // Citation string: WCA 2030, §Section (p.N): first 80 chars…
    const citationText =
      `WCA 2030, ${chunk.sectionTitle} (p.${chunk.pageRef}): ` +
      `${chunk.text.slice(0, 80)}…`;

    const card = document.createElement('article');
    card.className = 'result-card';

    card.innerHTML = `
      <header class="card-header">
        <span class="card-section" title="${esc(chunk.sectionTitle)}">
          § ${esc(chunk.sectionTitle)}
        </span>
        <span class="card-page">Page ${chunk.pageRef}</span>
      </header>
      <div class="card-body">
        <p class="card-text">${highlight(chunk.text, query)}</p>
      </div>
      <footer class="card-footer">
        <div class="card-score">
          <div class="score-bar-track"
               role="progressbar"
               aria-valuenow="${pct.toFixed(0)}"
               aria-valuemin="0"
               aria-valuemax="100">
            <div class="score-bar-fill" style="width:${pct.toFixed(1)}%"></div>
          </div>
          <span class="score-label">${label}</span>
        </div>
        <span class="match-badge match-badge--${matchType}">${matchType}</span>
        <button class="copy-btn" type="button"
                data-citation="${esc(citationText)}">
          Copy citation
        </button>
      </footer>
    `;

    // Wire the copy button after innerHTML is set
    card
      .querySelector<HTMLButtonElement>('.copy-btn')!
      .addEventListener('click', ResultCard.handleCopy);

    return card;
  }

  /**
   * Tier-1 verified-answer card.
   *
   * Layout:
   *   VERIFIED ANSWER badge (forest green)
   *   answer text (prominent)
   *   excerpt in a blockquote
   *   section_title + page_number citation
   *   Copy citation button
   *
   * Never shown without its excerpt and page citation.
   */
  static renderQA(result: QaResult, query: string): HTMLElement {
    const { row, score } = result;
    const pct = Math.min(score * 100, 100).toFixed(0);

    const citationText =
      `WCA 2030, ${row.section_title} (p.${row.page_number}): ` +
      `${row.excerpt.slice(0, 80)}…`;

    const card = document.createElement('article');
    card.className = 'result-card result-card--verified';

    card.innerHTML = `
      <header class="card-header">
        <span class="verified-badge">ANSWER</span>
        <span class="card-page">Page ${esc(row.page_number)}</span>
      </header>
      <div class="card-body">
        <p class="qa-answer">${highlight(esc(row.answer), query)}</p>
        <p class="qa-excerpt-label">WCA 2030 excerpt (Page ${esc(String(row.page_number))})</p>
        <blockquote class="qa-excerpt">
          <p>${highlight(esc(row.excerpt), query)}</p>
        </blockquote>
        <p class="qa-citation">
          <span class="card-section">§ ${esc(row.section_title)}</span>
        </p>
      </div>
      <footer class="card-footer">
        <div class="card-score">
          <div class="score-bar-track"
               role="progressbar"
               aria-valuenow="${pct}"
               aria-valuemin="0"
               aria-valuemax="100">
            <div class="score-bar-fill" style="width:${pct}%"></div>
          </div>
          <span class="score-label">${pct}%</span>
        </div>
        <span class="match-badge match-badge--verified">verified</span>
        <button class="copy-btn" type="button"
                data-citation="${esc(citationText)}">
          Copy citation
        </button>
      </footer>
    `;

    card
      .querySelector<HTMLButtonElement>('.copy-btn')!
      .addEventListener('click', ResultCard.handleCopy);

    return card;
  }

  /** Render the guardrail "not found" card. */
  static renderNotFound(response: GuardrailResponse): HTMLElement {
    const card = document.createElement('div');
    card.className = 'not-found-card';
    card.setAttribute('role', 'alert');

    const sections = response.sectionsSearched ?? [];
    const listHtml = sections.length
      ? `<p class="not-found-searched">Sections searched:</p>
         <ul class="not-found-list">
           ${sections.map(s => `<li>${esc(s)}</li>`).join('')}
         </ul>`
      : '';

    const msg = response.message ??
      'This question could not be answered from the WCA 2030 guidelines.';

    card.innerHTML = `
      <p class="not-found-message">
        <span aria-hidden="true">⚠&nbsp;</span>${esc(msg)}
      </p>
      ${listHtml}
    `;

    return card;
  }

  /** Render an item-catalogue entry as a detail card. */
  static renderItem(item: ItemRow): HTMLElement {
    const citationText = `WCA 2030, Item ${item.code} ${item.name} (p.${item.page})`;
    const badgeClass   = item.category === 'essential' ? 'item-badge--essential' : 'item-badge--additional';
    const badgeLabel   = item.category === 'essential' ? 'Essential' : 'Additional';

    const card = document.createElement('article');
    card.className = 'result-card result-card--item';

    card.innerHTML = `
      <header class="card-header">
        <span class="item-badge ${badgeClass}">${badgeLabel}</span>
        <span class="card-page">Page ${item.page} (printed)</span>
      </header>
      <div class="card-body">
        <h3 class="item-heading">
          <span class="item-code">${esc(item.code)}</span><span class="item-name">${esc(item.name)}</span>
        </h3>
        <div class="item-fields">
          <div class="item-field">
            <span class="item-field-label">Description</span>
            <div class="item-desc-blocks">${renderDescBlocks(item.descriptionBlocks)}</div>
          </div>
          <div class="item-field">
            <span class="item-field-label">Reference period</span>
            <p class="item-field-value">${esc(item.referencePeriod)}</p>
          </div>
          <div class="item-field">
            <span class="item-field-label">Theme</span>
            <p class="item-field-value">${esc(item.theme)}</p>
          </div>
          <div class="item-field">
            <span class="item-field-label">Page</span>
            <p class="item-field-value">Page ${item.page} (printed)</p>
          </div>
        </div>
      </div>
      <footer class="card-footer">
        <span class="match-badge match-badge--item">item</span>
        <button class="copy-btn" type="button"
                data-citation="${esc(citationText)}">
          Copy citation
        </button>
      </footer>
    `;

    card.querySelector<HTMLButtonElement>('.copy-btn')!
      .addEventListener('click', ResultCard.handleCopy);

    return card;
  }

  private static async handleCopy(this: HTMLButtonElement): Promise<void> {
    const citation = this.dataset.citation ?? '';
    try {
      await navigator.clipboard.writeText(citation);
      this.textContent = 'Copied!';
    } catch {
      this.textContent = 'Copy failed';
    }
    setTimeout(() => { this.textContent = 'Copy citation'; }, 2000);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderDescBlocks(blocks: DescriptionBlock[]): string {
  return blocks.map(block => {
    if (block.type === 'paragraph') {
      return `<p class="item-desc-para">${esc(block.text)}</p>`;
    }
    const lis = block.items.map(it => `<li class="item-desc-li">${esc(it)}</li>`).join('');
    return `<ul class="item-desc-bullets">${lis}</ul>`;
  }).join('');
}
