import type { RankedResult, QaResult, ItemRow, DescriptionBlock, GlossaryEntry, FigureTableEntry } from '../engine/types';
import type { GuardrailResponse } from '../engine/guardrail';
import { STOP_WORDS } from '../engine/stopwords';
import { linkifyItems } from './linkify';
import { excerptCitation, pagesLabel, parseExcerpts } from '../engine/excerpts';
import { citationLine, displayTitle, matchBand, pagesText, qaBand } from './citation';
import { passagesHtml } from './qa-block';

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
// A6: whole-word matching with simple suffix tolerance, applied to the RAW
// text BEFORE escaping:
//   1. Split matches out of the raw text, escape each segment, and wrap the
//      matched words in <mark> — so a term is never highlighted inside an
//      HTML entity (&quot; etc.) and nothing is double-escaped.
//   2. Keep only content words: length ≥ 4 AND not in STOP_WORDS.
//   3. Match whole words with suffix tolerance — \b(term)(s|es|ed|ing)?\b —
//      so "land" does not light up inside "inland", while the query "holder"
//      still highlights "holders".

export function highlight(text: string, query: string): string {
  const tokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter(t => t.length >= 4 && !STOP_WORDS.has(t));
  if (tokens.length === 0) return esc(text);

  // Longest first so longer query words win over their shorter prefixes.
  const terms = [...new Set(tokens)].sort((a, b) => b.length - a.length);
  const re = new RegExp(`\\b(${terms.map(escRe).join('|')})(s|es|ed|ing)?\\b`, 'gi');

  let out  = '';
  let last = 0;
  for (const m of text.matchAll(re)) {
    out += esc(text.slice(last, m.index!));
    out += `<mark>${esc(m[0])}</mark>`;
    last = m.index! + m[0].length;
  }
  return out + esc(text.slice(last));
}

// ── Score normalisation ───────────────────────────────────────────────────────
// Cosine similarity (semantic):  0 – 1  → multiply by 100 for %
// BM25 (lexical):                0 – ∞  → normalise against 20 as a soft max

// ── Public API ────────────────────────────────────────────────────────────────

export class ResultCard {
  /** Render one RankedResult as an <article> element. */
  static render(result: RankedResult, query: string): HTMLElement {
    const { chunk, matchType } = result;
    const band = matchBand(result);

    const paragraph = chunk.paragraphs[0] ?? null;
    const citationLead = paragraph
      ? `§${paragraph}, ${displayTitle(chunk.sectionTitle)}`
      : displayTitle(chunk.sectionTitle);

    // B2: paragraph-aware citation, quoting only the verbatim chunk text.
    const citationText =
      `WCA 2030, ${citationLead} (${pagesText(chunk.printedPage, chunk.printedPageEnd)}): ` +
      `"${chunk.text.slice(0, 80)}…"`;

    const card = document.createElement('article');
    card.className = 'result-card';

    // D2: one citation line (§ · section · page); the full outline title is in the tooltip.
    card.innerHTML = `
      <header class="card-header">
        <span class="card-citation" title="${esc(chunk.sectionTitle)}">${esc(citationLine(chunk))}</span>
      </header>
      <div class="card-body">
        <p class="card-text">${highlight(chunk.text, query)}</p>
      </div>
      <footer class="card-footer">
        <span class="match-band match-band--${band.className}" title="${esc(band.tooltip)}">${band.label}</span>
        <span class="match-badge match-badge--${matchType}">${matchType === 'semantic' ? 'meaning' : 'keyword'}</span>
        <button class="copy-btn" type="button"
                data-citation="${esc(citationText)}">
          Copy citation
        </button>
      </footer>
    `;

    // Excerpt toggle for long chunks on mobile
    if (window.matchMedia('(max-width: 600px)').matches && chunk.text.length > 350) {
      const textEl = card.querySelector<HTMLElement>('.card-text')!;
      textEl.classList.add('card-text--truncated');
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'excerpt-toggle';
      toggle.textContent = 'Show full excerpt';
      toggle.addEventListener('click', () => {
        const nowTruncated = textEl.classList.toggle('card-text--truncated');
        toggle.textContent = nowTruncated ? 'Show full excerpt' : 'Show less';
      });
      card.querySelector('.card-body')!.appendChild(toggle);
    }

    // Wire the copy button after innerHTML is set
    card
      .querySelector<HTMLButtonElement>('.copy-btn')!
      .addEventListener('click', ResultCard.handleCopy);

    return card;
  }

  /**
   * Tier-1 curated-question card (A4).
   *
   * Layout:
   *   "Curated question" badge (forest green)
   *   VERBATIM excerpt as the primary answer (blockquote)
   *   paraphrased curated summary beneath it, subordinate, labelled
   *     "Curated summary (not verbatim)"
   *   section_title + page_number citation
   *   Copy citation button (citation text uses the excerpt only)
   *
   * Never shown without its excerpt and page citation.
   */
  static renderQA(result: QaResult, query: string): HTMLElement {
    const { row, score } = result;
    const band = qaBand(score);

    // A4: the citation must quote the VERBATIM excerpt, never the paraphrase.
    const passages = parseExcerpts(row.excerpt, row.page_number);
    const citationText = excerptCitation(row.section_title, passages);

    const card = document.createElement('article');
    card.className = 'result-card result-card--verified';

    card.innerHTML = `
      <header class="card-header">
        <span class="verified-badge">Curated question</span>
        <span class="card-page">${esc(pagesLabel(passages))}</span>
      </header>
      <div class="card-body">
        <p class="qa-excerpt-label">WCA 2030 excerpt (${esc(pagesLabel(passages))})</p>
        ${passagesHtml(passages, text => linkifyItems(highlight(text, query)))}
        <p class="qa-summary-label">Curated summary (not verbatim)</p>
        <p class="qa-summary">${linkifyItems(highlight(row.answer, query))}</p>
        <p class="card-source">Source: §&nbsp;${esc(row.section_title)}&nbsp;·&nbsp;${esc(pagesLabel(passages).replace('Pages', 'pp.').replace('Page', 'p.'))}</p>
      </div>
      <footer class="card-footer">
        <span class="match-band match-band--${band.className}" title="${esc(band.tooltip)}">${band.label}</span>
        <span class="match-badge match-badge--verified">curated</span>
        <button class="copy-btn" type="button"
                data-citation="${esc(citationText)}">
          Copy citation
        </button>
      </footer>
    `;

    // Excerpt toggle for long QA excerpts on mobile
    if (window.matchMedia('(max-width: 600px)').matches && passages.map(p => p.text).join('').length > 350) {
      const excerptPs = [...card.querySelectorAll<HTMLElement>('.qa-excerpt p')];
      excerptPs.forEach(p => p.classList.add('qa-excerpt--truncated'));
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'excerpt-toggle';
      toggle.textContent = 'Show full excerpt';
      toggle.addEventListener('click', () => {
        const nowTruncated = excerptPs.map(p => p.classList.toggle('qa-excerpt--truncated'))[0];
        toggle.textContent = nowTruncated ? 'Show full excerpt' : 'Show less';
      });
      card.querySelector('.card-body')!.appendChild(toggle);
    }

    card
      .querySelector<HTMLButtonElement>('.copy-btn')!
      .addEventListener('click', ResultCard.handleCopy);

    return card;
  }

  /** Render the guardrail "not found" card. */
  static renderNotFound(
    response: GuardrailResponse,
    recovery: { onGlossary: () => void; onQaBank: () => void; onClear: () => void },
  ): HTMLElement {
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
      <p class="not-found-hint">
        Try rephrasing with WCA terms such as
        <em>holding</em>, <em>holder</em>, <em>parcel</em>,
        <em>livestock</em>, or <em>essential item</em>.
      </p>
    `;

    // Recovery buttons — wired after innerHTML so we can use addEventListener
    const actions = document.createElement('div');
    actions.className = 'not-found-actions';

    const makeBtn = (label: string, handler: () => void): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'not-found-action-btn';
      btn.textContent = label;
      btn.addEventListener('click', handler);
      return btn;
    };

    actions.appendChild(makeBtn('Browse glossary',   recovery.onGlossary));
    actions.appendChild(makeBtn('See question bank', recovery.onQaBank));
    actions.appendChild(makeBtn('Clear search',      recovery.onClear));
    card.appendChild(actions);

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

  /** Render a glossary entry as a card in the results area. */
  static renderGlossary(entry: GlossaryEntry): HTMLElement {
    const card = document.createElement('article');
    card.className = 'result-card result-card--glossary';

    const refHtml = entry.reference
      ? `<p class="glossary-reference">${esc(entry.reference)}</p>`
      : '';

    const citationText = entry.reference
      ? `WCA 2030 Glossary — ${entry.term}: ${entry.definition.slice(0, 80)}… (${entry.reference})`
      : `WCA 2030 Glossary — ${entry.term}: ${entry.definition.slice(0, 80)}…`;

    card.innerHTML = `
      <header class="card-header">
        <span class="glossary-badge">Glossary</span>
        <span class="card-section">${esc(entry.term)}</span>
      </header>
      <div class="card-body">
        <p class="glossary-definition">${esc(entry.definition)}</p>
        ${refHtml}
      </div>
      <footer class="card-footer">
        <span class="match-badge match-badge--glossary">glossary</span>
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

  /** Render a figure/table entry as a result card. */
  static renderFigureTable(entry: FigureTableEntry): HTMLElement {
    const kindLabel = entry.kind === 'figure' ? 'Figure' : 'Table';
    const citationText = `WCA 2030, ${kindLabel} ${entry.ref} (p.${entry.page})`;

    const card = document.createElement('article');
    card.className = 'result-card result-card--figure-table';

    card.innerHTML = `
      <header class="card-header">
        <span class="ft-badge ft-badge--${entry.kind}">${kindLabel}</span>
        <span class="card-page">Page ${entry.page} (printed)</span>
      </header>
      <div class="card-body">
        <p class="ft-ref">${kindLabel} ${esc(entry.ref)}</p>
        <p class="ft-title">${esc(entry.title)}</p>
        <p class="ft-note">This ${entry.kind} is on the cited page of the official WCA 2030 guidelines.</p>
      </div>
      <footer class="card-footer">
        <span class="match-badge match-badge--figure-table">${entry.kind}</span>
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
      this.textContent = 'Copied ✓';
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
      return `<p class="item-desc-para">${linkifyItems(esc(block.text))}</p>`;
    }
    const lis = block.items.map(it => `<li class="item-desc-li">${linkifyItems(esc(it))}</li>`).join('');
    return `<ul class="item-desc-bullets">${lis}</ul>`;
  }).join('');
}
