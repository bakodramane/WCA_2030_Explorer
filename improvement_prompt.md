# WCA 2030 Explorer — Improvement Brief for an Implementing Agent

> **Read this whole file before writing any code.** It is the authoritative task
> specification. Where it conflicts with `CLAUDE.md`, this file wins, and you must
> update `CLAUDE.md` to match (see §0.4).

---

## 0. Context and ground rules

### 0.1 What the app is

An offline-first PWA (Vite + TypeScript, `@xenova/transformers`, MiniSearch) that
answers questions from the *World Programme for the Census of Agriculture 2030*
guidelines (`source/Census-2030_EN-DTP-9.pdf`, 230 PDF pages). Every answer must be
verbatim source text with a section and page citation, and off-topic questions must
be refused. See `CLAUDE.md` for the original specification and `README.md` for the
build sequence.

### 0.2 Why this work exists

An audit found that the app is well engineered, but its **citation integrity** —
the core promise — is unreliable. Measured problems (all reproducible):

| ID | Problem | Evidence |
|---|---|---|
| C1 | Two page-numbering systems | Chunks store the **PDF** page in `pageRef`; Q&A, items, figures, and `deriveGroup()` in `src/ui/App.ts` use **printed** pages. Printed = PDF − 14. Paragraph 7.4.18 shows "Page 103"; its printed page is 89, and the filter labels it "Chapter 8". |
| C2 | Each chunk cites the page where its *section* started | `scripts/chunk.ts` passes `sec.pageRef` to every chunk of the section. |
| C3 | Corrupt section titles | 137 titles. A table header `"BASIC LAND USE CLASSES \tAGGREGATE LAND USE CLASSES"` labels 123 chunks (14 %). Fragments such as `"AND ITS INTERNATIONAL CONTEXT"` and a body sentence (`"Chapter 7, Theme 2 should be applied (see paragraph 7.2.14)."`) are titles. 45 chunks come from front matter / ToC (PDF pp. 1–14). |
| C4 | Guardrail admits off-topic questions | "What is the GDP of Nigeria?" returns an Annex 11 excerpt: raw cosine 0.40, then boosts (×1.15 priority, ×1.10 exact-word, ×1.25ⁿ title) clear the 0.35 `enum` threshold in `src/engine/guardrail.ts`. |
| C5 | Curated "answers" are paraphrases | Only 44 / 404 `answer` fields in `public/data/qa.json` appear verbatim in the source, yet they are rendered as the bold **ANSWER** with a **VERIFIED** badge beside a "Verbatim excerpts only" trust strip. |
| C6 | Runtime network dependency | `index.html` loads Lora from Google Fonts; it is not pre-cached, so offline text falls back to Georgia. |

Secondary issues are listed in each phase below.

### 0.3 Facts already established (do not re-derive)

- **Page offset:** printed page = PDF page − 14 throughout the main body. Verify the
  offset holds for the annexes and glossary by sampling 5 pages before relying on it;
  if it varies, derive printed page numbers from the running page footer text instead.
- **The PDF has no bookmark outline** (`PDFParse#getInfo().outline` is empty). Section
  structure must come from `data/source-outline.md` (hand-built, printed page numbers,
  179 lines) plus the numbered-paragraph pattern in body text (`4.24`, `7.2.13`,
  `A4.3`…).
- **Corpus size:** about 108 000 unique words. Chunking at 200–350 words therefore
  yields roughly **430–560 chunks**, which is below the `800–6000` bound in
  `tests/chunking.test.ts` and `CLAUDE.md`. That bound was a guess; replace it with
  `350–1200` and record the reason in `CLAUDE.md`.
- **Baseline retrieval quality:** using each sampled curated question as a query
  against chunk embeddings, the correct page (±1) is in the top 5 for **87 / 101**
  (86 %). Use this as the number to beat.
- Current state: `npx tsc --noEmit` passes; `npx vitest run` passes 66 tests, but
  `tests/chunking.test.ts` fails on a clean checkout because it reads the gitignored
  `src/data/chunks-raw.json`.
- The embedding model is available offline at `public/models/Xenova/all-MiniLM-L6-v2/`.
  In Node, set `env.localModelPath = path.join(process.cwd(), 'public', 'models')` and
  `env.allowRemoteModels = false` to use it without network access.

### 0.4 Hard constraints (unchanged, non-negotiable)

1. Answers are verbatim extracted text. Never display generated or paraphrased text
   as the answer.
2. No external network requests at runtime (this now includes fonts).
3. Below threshold, show the refusal card: *"This question could not be answered
   from the WCA 2030 guidelines. Sections searched: […]"*.
4. Every answer cites section and **printed** page number.
5. No generative model at runtime.
6. Use `path.join()` everywhere; the owner works on Windows.

### 0.5 Working method

- Work **phase by phase, in order (A → E)**. Within a phase, work task by task.
- After every task: run `npx tsc --noEmit` and `npx vitest run`. Both must pass
  before you commit.
- **One commit per task**, with a conventional message (`fix:`, `feat:`, `refactor:`,
  `test:`, `chore:`, `docs:`) that names the task ID, e.g. `fix(A1): use printed page numbers in all citations`.
- At the end of each phase, write a short summary to `CHANGELOG-improvements.md`
  (files changed, metrics before → after, open questions), then push.
- When a phase changes data files under `public/data/`, regenerate them with the
  scripts — never hand-edit generated JSON.
- If a task proves impossible as specified, stop that task, document why in
  `CHANGELOG-improvements.md`, and continue with the next independent task.

### 0.6 Ask the owner before doing any of these

- Deleting or no longer committing `docs/` (the live GitHub Pages site deploys from it).
- Changing the GitHub Pages source or adding a deployment workflow that pushes.
- Deleting `public/models/` from git or introducing Git LFS.
- Removing the curated paraphrased answers entirely (default is relabelling; see A4).
- Bumping any major dependency version.

---

## Phase A — Restore citation trust

**Goal:** every number and label the user sees is correct, and off-topic questions
are refused.

### A1. Single printed-page scheme

- Add `pdfPage: number` and `printedPage: number` to the `Chunk` type in
  `src/engine/types.ts` and to the output of `scripts/chunk.ts`. Keep `pageRef` as a
  deprecated alias equal to `printedPage` until Phase B is done, then remove it.
- Front-matter pages (printed page ≤ 0) get `printedPage` as the roman-numeral label
  or are excluded (see B2); never display a non-positive page.
- Update every display and citation site to use `printedPage`:
  `src/ui/ResultCard.ts` (header, "Source:" line, copy-citation string) and
  `deriveGroup()` / `deriveResultGroups()` in `src/ui/App.ts`.
- Replace the hard-coded page ranges in `deriveGroup()` with a lookup generated from
  `data/source-outline.md` (shared with B1), so chapters and annexes have one source
  of truth.
- **Acceptance:** a new test asserts that for chunk text containing `7.4.18`, the
  displayed page is 89 and the group is "Chapter 7". A data test asserts that every
  chunk's `printedPage` falls inside the printed range of the chapter or annex named
  by its section.

### A2. Per-chunk page tracking

- In `scripts/chunk.ts`, carry the page number per **line** while building section
  bodies (e.g. store `{ text, pdfPage }[]` instead of `string[]`). Each chunk's page
  is the page of its **first word**. Also store `pageEnd` (page of its last word).
- Display `p. 81` when start equals end, otherwise `pp. 81–82`.
- **Acceptance:** a test picks 10 random chunks and asserts that the first 8 words of
  each occur on the extracted text of `pdfPage`.

### A3. Guardrail on unboosted scores

- In `RetrievalEngine.semanticSearch` and `sectionSearch`, return both `score`
  (boosted, for ranking) and `rawScore` (plain cosine). Add `rawScore` to
  `RankedResult` and `SectionResult`.
- `evaluate()` in `src/engine/guardrail.ts` must compare **`rawScore`** with the
  threshold. Boosts may reorder results but must never turn a refusal into an answer.
- Tighten the lexical fallback: in addition to `MIN_LEXICAL_SCORE`, require that at
  least one query content word of 5+ characters that is **not** a common English word
  appears in the matched chunk. Use a small allow-list built from corpus term
  frequency, not a hand list.
- Create `tests/fixtures/off-topic.json` with at least 50 off-topic questions
  (geography, sport, cooking, finance, health, tech support, celebrity, general GDP or
  population questions about named countries, etc.). Include
  "What is the GDP of Nigeria?" and "What is the capital of France?".
- Create `tests/guardrail-regression.test.ts`. It loads the real model offline
  (§0.3) and the real `public/data/chunks.json`, then runs the full search cascade
  (Q&A tier, section search, lexical fallback) for every off-topic question.
  **All must be refused.** If loading the model makes the suite too slow for
  `npm test`, put it under `npm run test:eval` and document that.
- Initial thresholds are re-tuned in Phase C; for now choose the lowest raw
  threshold at which all off-topic questions are refused, and record it.

### A4. Verbatim answers on curated Q&A cards

- In `ResultCard.renderQA` and in the Learn / self-test views in `App.ts`, render the
  **excerpt** as the answer (the blockquote becomes the primary content).
- Render the paraphrased `answer` field beneath it, visually subordinate, labelled
  **"Curated summary (not verbatim)"**. Rename the "VERIFIED" badge to
  **"Curated question"**.
- Copy citation must use the excerpt only.
- Update the trust strip text so it remains true.
- **Acceptance:** no UI path renders `row.answer` without that label; a test asserts
  this by rendering a card in a DOM test environment (`happy-dom` or `jsdom` via
  vitest `environment` override for that file).

### A5. Self-hosted fonts

- Download Lora (400, 600, 400 italic) and JetBrains Mono (400) WOFF2 files once,
  place them in `public/fonts/`, declare `@font-face` in `src/ui/styles.css`, and
  remove the Google Fonts `<link>` and `preconnect` tags from `index.html`.
- Add `woff2` to the Workbox `globPatterns` in `vite.config.ts`.
- Include each font's licence file (both are SIL OFL) in `public/fonts/`.
- **Acceptance:** `npm run build` then grep `docs/` for `googleapis` returns nothing,
  and `docs/sw.js` lists the `.woff2` files.

### A6. Highlighting on word boundaries

- In `highlight()` (`src/ui/ResultCard.ts`), match whole words with simple suffix
  tolerance (`\b(term)(s|es|ed|ing)?\b`), applied to text nodes only, never inside
  HTML entities (`&quot;` etc.).
- **Acceptance:** tests show that "land" does not highlight inside "inland", and that
  "holders" is highlighted for the query "holder".

---

## Phase B — Rebuild the index from document structure

**Goal:** correct section titles, paragraph-level citations, and chunk sizes as
specified.

### B1. Machine-readable outline

- Write `scripts/outline.ts`, which parses `data/source-outline.md` into
  `src/data/outline.json`: an ordered list of `{ id, kind: 'chapter'|'section'|'annex'|'glossary'|'theme', number, title, printedStart, printedEnd, parentId }`.
- Fix any gaps you find in `source-outline.md` by checking the PDF's own table of
  contents (PDF pp. 5–10). Commit the corrected Markdown.
- **Acceptance:** a test asserts that ranges are ordered, do not overlap among
  siblings, and cover printed pages 1 to the last body page.

### B2. Rewrite the chunker

Rewrite `scripts/chunk.ts`:

1. Extract per-page lines (keep using `pdf-parse` v2 `getText()`), and record the
   PDF page for each line.
2. **Drop** front matter and the table of contents (everything before printed page 1),
   plus running headers and footers (keep the existing frequency filter).
3. Detect **numbered paragraphs** (`^\d+\.\d+(\.\d+)?\s`, `^A\d+\.\d+\s` for annexes,
   and glossary entries) as atomic units. Text before the first numbered paragraph
   of a section is its own unit.
4. Assign each unit its **section** from `outline.json` by printed page, refined by
   paragraph number prefix (e.g. `7.2.x` belongs under Chapter 7, Theme 2). Section
   titles come only from the outline, never from ALL-CAPS line detection. Delete
   `isHeadingPattern` once nothing uses it.
5. **Pack** consecutive units in the same section into chunks of 200–350 words.
   Never split a unit unless it alone exceeds 350 words; then split it with a
   50-word overlap. Do not overlap across unit boundaries.
6. Each chunk gets:
   ```ts
   interface Chunk {
     id: string;            // stable: `${sectionId}-${firstParagraphNumber ?? 'intro'}-${n}`
     sectionId: string;
     sectionTitle: string;  // human title, sentence case, e.g. "Theme 2: Land"
     chapterLabel: string;  // "Chapter 7" | "Annex 4" | "Glossary"
     paragraphs: string[];  // e.g. ["7.2.12", "7.2.13"]
     pdfPage: number; printedPage: number; printedPageEnd: number;
     text: string;          // verbatim, whitespace-normalised only
     priority: 'high' | 'normal';
   }
   ```
7. Priority ranges come from `outline.json`: Chapter 4, Chapter 7, Annex 4, and the
   Glossary are `high`. Delete `STATIC_HIGH_RANGES`.
8. Update `tests/chunking.test.ts`:
   - count between 350 and 1200 (§0.3)
   - no chunk over 420 words
   - ≥ 90 % of chunks between 150 and 350 words
   - every `sectionTitle` exists in `outline.json`
   - no chunk has `printedPage < 1`
   - 10–45 % of chunks are high priority
   - **Make the test self-sufficient:** if `src/data/chunks-raw.json` is missing,
     test against `public/data/chunks.json` instead of failing.
9. Display paragraph citations in the UI: `§7.2.13 · Theme 2: Land · p. 81`.
   Copy citation format: `WCA 2030, §7.2.13, Theme 2: Land (p. 81): "first 80 chars…"`.

### B3. Reproducible data for every runtime file

- Write `scripts/build-items.ts` (→ `public/data/items.json`),
  `scripts/build-glossary.ts` (→ `public/data/glossary.json`), and
  `scripts/build-figures.ts` (→ `public/data/figures-tables.json`), all extracting
  from the PDF.
- **Regression gate:** the regenerated files must match the committed ones
  field-for-field, except where the committed data is shown to be wrong. List every
  difference in `CHANGELOG-improvements.md` with the reason.
- `wca-qa.csv` is hand-curated and stays as the input; do not regenerate it.
- Make `npm run build-index` run, in order: outline → chunk → embed → items →
  glossary → figures → build-qa → validate (B4).

### B4. Validation step

Write `scripts/validate-data.ts`, which fails with a non-zero exit code and a clear
report if any of these checks fails:

- A Q&A `excerpt` (whitespace- and quote-normalised) does not occur in the PDF text.
- A Q&A `page_number` is not the printed page on which its excerpt starts (±1).
- An item or glossary entry's text is not verbatim, or its page is wrong.
- A chunk's text is not verbatim.

Produce `reports/qa-validation.csv` listing every failing row. **Fix the data**
(correct the page or re-extract the excerpt verbatim in `wca-qa.csv`) until it
passes. Never weaken the check. Expect about 54 excerpts to need attention.

### B5. Version handshake (Phase 7 step 2 of `CLAUDE.md`, not yet implemented)

- Have `embed.ts` set `model-meta.json`'s `version` to a content hash of
  `chunks.json`, `qa.json`, `items.json`, and `glossary.json`. Copy `model-meta.json`
  to `public/data/`.
- On startup, `App.ts` fetches it and compares it with
  `localStorage.wca_index_version`. If they differ, delete the stale Workbox
  runtime caches for data files, store the new version, and show the existing
  "Guidelines index updated" banner.

---

## Phase C — Measure, then tune

### C1. Gold set

- Create `tests/fixtures/gold.json` with at least 120 in-domain questions:
  - 80 sampled from `wca-qa.csv`, **reworded** so they are not exact copies of the
    stored questions (otherwise the Q&A tier trivially matches);
  - 40 new questions written from Chapters 4–9 and Annexes 4–7, each with
    `expectedParagraphs` and `expectedPrintedPage`.
- Reuse `tests/fixtures/off-topic.json` (A3) and extend it to at least 60 entries,
  including 10 *near-domain* traps (e.g. "What was Nigeria's 2020 maize yield?",
  "Who chairs the FAO Council?").

### C2. Evaluation script

Write `scripts/eval.ts` (`npm run eval`), which runs the full search cascade exactly
as the UI does (factor that cascade out of `App.ts` into
`src/engine/answer.ts` first, so the UI and eval share one code path) and reports:

- Recall@1 and recall@5 (matching paragraph, or printed page ±1).
- Correct-citation rate of the top result.
- False-answer rate on off-topic and on near-domain traps.
- The tier that answered each question.
- A threshold sweep table (raw cosine 0.30–0.60, step 0.02) with recall and
  false-answer rate.

Write the results to `reports/eval-latest.md` and commit it.

### C3. Tune

- Choose thresholds that give **0 % false answers on off-topic questions**, at most
  10 % on near-domain traps, and maximum recall@5 subject to those limits. Record
  the chosen values and the sweep that justifies them in `README.md` §3.
- **Targets:** recall@5 ≥ 90 % (baseline 86 %), top-result citation correct ≥ 80 %.
  If you miss them, document the gap and the likely causes. Do not distort the
  gold set to meet them.
- Add a CI-friendly test that fails if recall@5 drops more than 3 points or the
  off-topic false-answer rate rises above 0.

---

## Phase D — Interface refinements

Keep the existing aesthetic (forest green on cream, Lora body, monospace citations,
CSS variables in `styles.css`). Do not introduce a UI framework.

### D1. Results above the fold

After the first search, collapse the header into a compact bar (title + search box);
hide the trust strip, the About panel, the Learn/Browse hubs, and the starter chips
behind a "Browse & learn" toggle. **Acceptance:** at 1280×900, the top of the first
result card is above y = 300; at 390×844 it is above y = 360. Verify with a
Playwright screenshot script (Chromium is at `/opt/pw-browsers`, or use the locally
installed browser) saved as `scripts/screenshot.ts`.

### D2. Result card layout

- Use one citation line per card (remove the duplicated header + "Source:" line):
  `§7.2.13 · Theme 2: Land · p. 81`, with the section title in sentence case. Stop
  rendering section titles in all-caps monospace.
- Replace the percentage relevance bar with a band: **Strong match** (raw ≥
  threshold + 0.15), **Good match**, or **Partial match (keyword)** for lexical
  results. Keep the numeric raw score in a `title` tooltip for tuning.
- Filter pills use `chapterLabel` from the chunk (B2), never page arithmetic.

### D3. Source navigation and sharing

- Pre-cache `source/Census-2030_EN-DTP-9.pdf` (2.4 MB) by copying it to
  `public/source/` during the build, and add a **"View page in PDF"** link opening
  `…pdf#page=<pdfPage>`.
- Support `?q=<query>` deep links: run the query on load, and update the URL (with
  `history.replaceState`) after each search.

### D4. Mobile and accessibility pass

- All tap targets are at least 44×44 px; the filter-pill row scrolls horizontally
  without clipping; the modals are usable at 360 px wide.
- Run axe-core (via Playwright, dev-only dependency) on the home view, a result view,
  a refusal view, and each modal. Fix all serious and critical violations.
- Check contrast for `--muted` text on `--bg` (needs at least 4.5:1).

---

## Phase E — Performance and repository hygiene

### E1. Smaller first load

- Write chunk embeddings as a separate binary file, `public/data/embeddings.f32`
  (Float32, row-major, `chunks.length × 384`), and drop `embedding` from
  `chunks.json`. Do the same for Q&A (`qa-embeddings.f32`). Load them with
  `fetch().arrayBuffer()` and use `Float32Array` subarray views.
- Write JSON without pretty-printing.
- Pre-cache only the WASM variant(s) the runtime actually loads. Check by logging
  network requests in the preview build in Chromium, and keep any variant needed as
  a fallback for browsers without SIMD/threads support.
- **Acceptance:** pre-cache total drops from about 71 MB to ≤ 35 MB (report the
  exact figure from the `vite build` output), and all tests and evaluations are
  unchanged.

### E2. Engine efficiency

- Embed each query once per search and pass the vector to the Q&A and chunk
  searches.
- Build the `id → chunk` map once in `init()`, not on every `lexicalSearch` call.
- Remove the duplicated `DEFAULT_QA_THRESHOLD`: move all thresholds into
  `src/engine/config.ts`, imported by both `guardrail.ts` and `retrieval.ts`.

### E3. Code structure

- Split `src/ui/App.ts` (1 812 lines) into `src/ui/modals/` (one file per modal:
  questions bank, glossary, items, themes, learning path, self-test),
  `src/ui/search-controller.ts`, and `src/ui/sw.ts` (service-worker banner and
  offline status). `App.ts` should end up under 300 lines.
- Move `esc`/`escHtml`, `highlight`, and `escRe` into `src/ui/text.ts`, and remove
  the duplicates.
- Behaviour must stay identical: compare D1 screenshots before and after.

### E4. Repository cleanup

- Delete the stale compiled `tests/*.js` files and add `tests/**/*.js` to
  `.gitignore`.
- Delete `.netlify/` (it points at another project's Windows path) and add it to
  `.gitignore`.
- Delete or move `scripts/debug-sections.ts` and `scripts/qa_sim_test.ts` into
  `scripts/dev/`, with a one-line comment on each.
- **Ask first (see §0.6):** propose a GitHub Actions workflow that builds and deploys
  to Pages, so that `docs/` no longer needs committing. Draft it as
  `.github/workflows/deploy.yml.proposed` and describe the switch-over steps in
  `CHANGELOG-improvements.md`, but do not activate it.

### E5. Documentation

Update `README.md`:

- Accurate test counts, pre-cache size and file list, and the build-index sequence.
- Fix the numbering in §4.
- Document `npm run eval` and the threshold-tuning method from C3.
- Document the citation format.

Update `CLAUDE.md`'s landmark table with verified **printed** page ranges, the new
chunk-count bound, the new `Chunk` interface, and a note that section structure comes
from `data/source-outline.md`.

---

## Definition of done

- [ ] `npx tsc --noEmit`, `npm test`, `npm run eval`, and `npm run build` all pass on
      a clean clone after `npm ci && npm run build-index`.
- [ ] Off-topic false-answer rate is 0 % across at least 60 questions.
- [ ] Recall@5 is at least 90 %, or the gap is documented with causes.
- [ ] Every citation shows a printed page that matches the PDF, verified by
      `validate-data.ts`.
- [ ] No paraphrase is displayed as an answer.
- [ ] Zero runtime requests to external hosts (verified in a Playwright network log
      of the preview build with the network disabled after first load).
- [ ] `CHANGELOG-improvements.md` contains a summary per phase with before → after
      metrics.
- [ ] Open questions from §0.6 are listed for the owner.
