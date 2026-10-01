# WCA 2030 Explorer — Improvement Brief for an Implementing Agent

> **Read this whole file before writing any code.** It is the authoritative task
> specification. Where it conflicts with `CLAUDE.md`, this file wins, and you must
> update `CLAUDE.md` to match (see §0.4).

---

## Progress status (updated 1 October 2026, after the B4-R / B2.1 / B5 / C0–C3 session)

| Task | Status | Commit | Notes |
|---|---|---|---|
| A1–A6 | ✅ Done | `4d95cb1`…`aca024a` | See the Phase A changelog. |
| B0 Recovery | ✅ Done | `ef52fa4` | |
| B1 Outline | ✅ Done | `7c82043` | Now 137 entries (Annex 4 themes added in B2.1). |
| B2 Chunker rewrite | ✅ Done | `b4da090`…`c05a475` | |
| B3 Data builders | ✅ Done | `cfb9b36` | |
| B4 Validation (B4-R) | ✅ Done, redone from scratch | `68bdbed`, `2c2917a`, `4478515` | `validate-data.ts` passes; 131 excerpts repaired and 4 pages fixed; every repair in `reports/qa-excerpt-repairs.csv` (**55 rows flagged `needs_owner_review`**). Also fixed a chunker bug that dropped short units. |
| B2.1 Section granularity | ✅ Done | `f6ea822`, `9d48fda` | Section/theme-level titles 37 % → 83.8 %; Annex 4 split into 12 themes; References excluded. |
| B5 Version handshake | ✅ Done | `79227a5` | Content-hash version; startup comparison; banner no longer fires on first install. |
| C0.1–C0.5 | ✅ Done | `579f1e8`, `1173381` | Windows (C0.4), chunk-raw ranking (C0.1), vocabulary gate (C0.2), independent off-topic sets (C0.3), `npm run eval` replaces the probe (C0.5). |
| C1 Gold set | ✅ Done | `a12004a` | 140 in-domain items; two held-out sets (36 each). |
| C2 Evaluation script | ✅ Done | `1173381` | `npm run eval` → `reports/eval-latest.md`; cascade shared in `src/engine/answer.ts`. |
| C3 Tune | ✅ Done, **one target missed** | `1173381` | Recall@5 94.3 %, top citation 83.6 %, tuning false answers 0/60. Held-out false answers 2/36 (5.6 %) on both sets, one question over the 5 % target; see the changelog and the open question. |
| **OD Owner decisions** | **New — do first** | — | Threshold kept at 0.52; flagged excerpts withheld; multi-passage excerpts; review page; stricter item-code trigger. See OD. |
| D, E | Not started | — | E2 is partly done (thresholds in `config.ts`, `DEFAULT_QA_THRESHOLD` removed). |

**State at `1173381`:** `npx tsc --noEmit` passes; `npx vitest run` passes **249 tests in 29 files**; `docs/`
matches `public/`. The gitignored `src/data/chunks-raw.json` in a working copy is current; if it is ever
stale, regenerate it with `npm run ingest` or move it aside.

**Review of `5b42e96` (by the owner's reviewer):** gates and `npm run eval` reproduce exactly (249 tests,
recall@5 94.3 %, 0/60 tuning, 2/36 held-out on both sets). The repair log is complete (135 rows, 31 page
corrections, 55 flagged). However, sampling the flagged rows showed that **some repairs make answers worse**,
and they are live in the Q&A tier: "What are the 12 themes of the WCA 2030?" now cites only Themes 7–9, and
"What is data archiving…?" keeps one sentence with a stray heading prefix ("DATA ARCHIVING 10.29 …"). The
root cause is the one-contiguous-passage excerpt format (see OD.3).

**Next steps, in order:** OD → D → E (E2's remaining items, E3, E4, E5). The three open questions from the
C phase are now answered by the owner in OD.

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

- **Page offset (verified in A1):** printed page = PDF page − 14 everywhere, including
  annexes and glossary (sampled PDF 103→89, 148→134, 190→176, 215→201, 222→208). The
  printed number is the first extracted line of each PDF page.
- **Running headers (measured before B2):** 23 lines repeat on 5 or more body pages.
  They are the true running headers (`WORLD PROGRAMME FOR THE CENSUS OF AGRICULTURE
  2030` ×105, `ANNEXES` ×38, the `CHAPTER n: …` titles, `AND ITS INTERNATIONAL
  CONTEXT`, `ALPHABETICAL LIST OF CROPS … (Continued)`) **and real content**:
  `Reference period: census reference year` ×27, `Essential item. Reference period:
  census reference day` ×9, crop-table column headers, `SOURCE: Authors' own
  elaboration.` ×16, `Essential items`, `For the holdings`, and ` Other`. **A pure
  frequency filter would delete each item's reference-period line**, which is verbatim
  guidance. See B2 step 2.
- **Current thresholds (set in A3; re-tune in C3):** `ENUM_CONFIDENCE_THRESHOLD` = 0.45
  on raw cosine, `QA_THRESHOLD` = 0.60, and `LEXICAL_SEMANTIC_FLOOR` = 0.32. The
  lexical fallback requires at least 2 corpus-derived domain terms of 5+ characters.
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
  (86 %). This measures **raw chunk ranking**. Through the full document-tier cascade
  (section search + guardrail, Q&A tier bypassed) after Phase A, the correct page is
  in the top 5 for only **33 / 51** (65 %), even though 47 / 51 are answered.
  **After B2** (400 larger chunks): raw ranking **38 / 51 (75 %)** and document tier
  **30 / 51 (59 %)**. The cause is in C0.4. Targets remain ≥ 90 % (C3).
- **Short-query probe set** (used in C0.2/C0.5): fallow, aquaculture, land tenure,
  reference period livestock, irrigation methods, holder, sex of holder, machinery
  ownership, crop residue, intercropping, modular approach, community-level data,
  tabulation, census frame, threshold for small holdings. After B2, the document
  tier refuses fallow, holder, sex of holder, intercropping, and tabulation (the
  Q&A tier still rescues three of them in the UI).
- Current state: see the progress table at the top.
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
- **Protect against running out of budget.** The previous agent stopped mid-file
  and left the tree broken. Therefore:
  - Never delete a working file before its replacement exists. Write the new
    version alongside it (e.g. `scripts/chunk.new.ts`), switch over, then delete.
  - Split large rewrites into modules of under 200 lines each, and commit after each
    module that compiles and has a test.
  - Commit and push at least every 45 minutes of work, even mid-task. Use a
    `wip(B2): …` message and keep the build green (gate unused code behind the old
    entry point if necessary).
  - Add a one-line entry to `CHANGELOG-improvements.md` with every commit, not only
    at the end of a phase.

### 0.6 Ask the owner before doing any of these

- Deleting or no longer committing `docs/` (the live GitHub Pages site deploys from it).
- Changing the GitHub Pages source or adding a deployment workflow that pushes.
- Deleting `public/models/` from git or introducing Git LFS.
- Removing the curated paraphrased answers entirely (default is relabelling; see A4).
- Bumping any major dependency version.

---

## Phase A — Restore citation trust ✅ COMPLETE

> Kept for reference. Do not redo these tasks. Their tests must keep passing through
> every later phase, especially after B2 regenerates `chunks.json`.

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

### B0. Recover the working tree and close B1 *(do first)*

1. Run `git status` and `git fetch origin`. The previous agent deleted
   `scripts/chunk.ts` locally (PowerShell `Remove-Item`) and may have left a partial
   new file. The committed version at `7c82043` is the working A2 chunker.
   - If `scripts/chunk.ts` is missing or partial, rename any partial file to
     `scripts/chunk.partial.ts` for reference, then restore the committed file with
     `git checkout -- scripts/chunk.ts`.
   - Confirm that `npx tsc --noEmit` and `npx vitest run` pass (159 tests) before you
     change anything.
2. Add the missing **B1 entry** to `CHANGELOG-improvements.md`, taken from the `7c82043`
   commit message: 125 entries (10 chapters, 90 sections, 12 themes, 11 annexes,
   glossary, references); the ToC corrections made to `source-outline.md`; and the
   resolution of open question 5 (Annexes 6/7 and 7/8 start mid-page, so a single
   shared boundary page is allowed).
3. Commit as `docs(B0): …`.

### B1. Machine-readable outline ✅ DONE (`7c82043`)

- Write `scripts/outline.ts`, which parses `data/source-outline.md` into
  `src/data/outline.json`: an ordered list of `{ id, kind: 'chapter'|'section'|'annex'|'glossary'|'theme', number, title, printedStart, printedEnd, parentId }`.
- Fix any gaps you find in `source-outline.md` by checking the PDF's own table of
  contents (PDF pp. 5–10). Commit the corrected Markdown.
- **Acceptance:** a test asserts that ranges are ordered, do not overlap among
  siblings, and cover printed pages 1 to the last body page.

### B2. Rewrite the chunker

**Build it as small modules, not one file** (see the budget rules in §0.5). Suggested
layout, each with its own unit test and its own commit:

| Module | Responsibility |
|---|---|
| `scripts/lib/pdf-lines.ts` | Extract lines with `pdfPage`, `printedPage`, and position on page (line index from top and from bottom). |
| `scripts/lib/strip-furniture.ts` | Remove running headers, footers, and page numbers (step 2). |
| `scripts/lib/units.ts` | Split the cleaned line stream into paragraph units (step 3). |
| `scripts/lib/assign-section.ts` | Map units to outline entries (step 4). |
| `scripts/lib/pack.ts` | Pack units into chunks (step 5). |
| `scripts/chunk.ts` | Thin orchestrator: wire the modules together, print stats, and write `chunks-raw.json`. Replace the old file only once the new pipeline produces valid output. |

Steps:

1. Extract per-page lines (keep using `pdf-parse` v2 `getText()`), and record the
   PDF page for each line.
2. **Drop** front matter and the table of contents (everything before printed page 1),
   plus page **furniture**. Use **position as well as frequency**: drop a line only
   if it repeats on 5 or more pages **and** sits within the first 3 or last 2 lines of
   those pages, or if it is the page-number line. Never drop lines that start with
   `Reference period:` or `Essential item.`, because they are item metadata (§0.3).
   Add a test asserting that the text for item 0101 still contains its reference
   period line, and that no chunk contains `WORLD PROGRAMME FOR THE CENSUS OF
   AGRICULTURE 2030`.
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
10. **Regenerate and re-verify:**
    - Run `npm run embed` (the existing resumable logic will re-embed every chunk,
      because the IDs change).
    - Remove the deprecated `pageRef` alias.
    - Run the full suite. The A1–A6 tests and `tests/guardrail-regression.test.ts`
      must still pass on the new data. If an off-topic question now leaks, fix the
      cause; do not raise the threshold without recording the measurement.
    - Rebuild with `npm run build` so `docs/` matches `public/`.
    - Record before → after in the changelog: chunk count, word-count distribution,
      number of distinct section titles (was 137, with corrupt entries), and the
      share of chunks with a paragraph number.

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

### B4-R. Recover or redo B4 *(do first)*

1. **If you are the agent that did B4** and your workspace still has the
   uncommitted changes: run `git status` and review the diff. Run the gates, then
   commit as `feat(B4): …` and push **before anything else**. The commit should
   include `scripts/validate-data.ts`, the corrected `data/wca-qa.csv`, the resumable
   `build-qa.ts`, the regenerated `public/data/qa.json` and its `docs/` copy,
   `reports/qa-validation.csv`, the `build-index` wiring, and the changelog entry.
2. **Otherwise**, redo B4 from scratch as specified below. Expect about 137 failing
   excerpts (paraphrased, prefixed with page furniture, or stitched together from
   non-contiguous text) and about 4 page-only errors.
3. In either case, the changelog must list **every** replaced excerpt (question, old
   page, new page, match method) in `reports/qa-excerpt-repairs.csv`. For
   repairs matched with low confidence, keep a `needs_owner_review` column set to
   `yes`, so the owner can check them. Replacing a curated excerpt changes what users
   see as the answer.
4. `build-qa.ts` must reuse existing embeddings when a question's text is unchanged,
   and must never try to download the model (set `allowRemoteModels = false`).

### B2.1. Section granularity *(new, after B4-R)*

Review measurements of the B2 output:
- 121 of 400 chunks carry only a **chapter-level** title, and only 37 of the 90 outline
  sections are used.
- All 70 Annex 4 chunks share one title, although Annex 4 is organised in 12 themes.
- 8 chunks come from the References list, which can match off-topic queries
  through author and place names.

Tasks:
1. Assign units to the most specific outline entry. Where `source-outline.md` lacks
   the paragraph ranges needed (e.g. "Stakeholders' needs" = ¶2.3–2.9), add a
   `paragraphs: "2.3–2.9"` hint to the Markdown and teach `scripts/outline.ts` to read it.
   Check every hint against the PDF.
2. Add the 12 Annex 4 themes to the outline (the PDF ToC lists them), so that annex
   chunks read e.g. "Annex 4 · Theme 5: Livestock".
3. Exclude References chunks from search results (keep them out of the index, or
   flag them `searchable: false`).
4. **Target:** at least 75 % of chunks carry a section- or theme-level title. Record
   the before and after figures in the changelog.

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

### C0. Review findings to resolve in this phase

Reviews after Phase A and B2 measured five problems. Phase C must fix or explain each one,
with numbers in the changelog.

1. **Document-tier page accuracy fell to 65 %.** For 51 curated questions with the
   Q&A tier bypassed, 47 are answered, but the correct page (±1) is in the top 5 for
   only 33. Raw chunk ranking scores 86 %. The likely cause is that `sectionSearch`
   returns one chunk per section, ranked by a title-boosted average, so the best
   individual chunk is often dropped. In C2, evaluate an alternative: rank chunks
   directly, then cap results at 2 per section for diversity. Keep whichever scores
   higher on the gold set.
2. **Single-term domain queries are refused.** "intercropping" (raw 0.346) and
   "modular approach" (raw 0.347, rescued only by the Q&A tier) fail because the
   lexical fallback requires two domain terms. Fix: a single query term may pass the
   lexical gate if it appears in a glossary term, an outline title, or an item name.
   Build that vocabulary at index time from `glossary.json`, `outline.json`, and
   `items.json`. Add 20 one- or two-word domain queries to the gold set (e.g.
   "fallow", "intercropping", "holder", "crop residue", "land tenure").
3. **Thresholds are fitted to the test fixture.** 0.45 was chosen as the lowest value
   that refuses every question in `off-topic.json`, and the same file is the
   regression test, so its 0 % false-answer rate overstates real performance. Split
   off-topic questions into a **tuning** set and a **held-out** set (at least 30
   each, written independently). Tune only on the tuning set, and report the
   held-out false-answer rate separately.

4. **Chunks exceed the embedding model's input window (found after B2).**
   `all-MiniLM-L6-v2` was trained on inputs of at most 256 tokens, and Transformers.js
   cuts input off at 512. The B2 chunks average **377 tokens**: 322 of 400 exceed 256,
   and 24 exceed 512 (maximum 1 261, in the crop-code tables), so their tails are
   never embedded. Measured effect, on the same 51-question sample:
   - raw chunk ranking (correct page in the top 5) fell from about 86 % to **75 %**
     (38/51);
   - the document tier fell from 65 % to **59 %** (30 / 51; 48 answered);
   - single-term queries got worse: "fallow" now has a raw score of **0.194**, and
     "holder" (0.399), "tabulation" (0.423), and "sex of holder" (0.412) are refused
     by the document tier.

   **Fix (preferred):** keep the 200–350-word chunks for *display*, but embed each
   chunk as several **windows of at most 200 tokens**, aligned to paragraph units
   where possible. Store a `windows` array (or a parallel embeddings file with a
   chunk index), score each chunk by its **best** window, and keep the guardrail on
   that raw score. Measure in C2 against (a) the current single embedding and
   (b) smaller display chunks of 120–180 words. Adopt the option with the best
   recall@5 that keeps 0 % false answers on the tuning set. Update `embed.ts`,
   `retrieval.ts`, the tests, and `CLAUDE.md` together.
5. **Measure after every index change.** B2 shipped without a retrieval
   measurement. From now on, every task that changes `chunks.json` or the
   retrieval code must record recall@5, document-tier page accuracy, and the
   off-topic false-answer rate in the changelog. Until C2's `npm run eval` exists,
   use a minimal script (`scripts/dev/probe.ts`) that runs these 51 questions (every
   8th row of `qa.json`, Q&A tier bypassed) and the 15 short queries listed in
   §0.3.

### C1. Gold set

- Create `tests/fixtures/gold.json` with at least 120 in-domain questions:
  - 80 sampled from `wca-qa.csv`, **reworded** so they are not exact copies of the
    stored questions (otherwise the Q&A tier trivially matches);
  - 40 new questions written from Chapters 4–9 and Annexes 4–7, each with
    `expectedParagraphs` and `expectedPrintedPage`.
- Keep `tests/fixtures/off-topic.json` (60 questions from A3) as the **tuning** set.
  Write a separate `tests/fixtures/off-topic-heldout.json` with at least 30 new
  questions, including 10 *near-domain* traps (e.g. "What was Nigeria's 2020 maize
  yield?", "Who chairs the FAO Council?"). Write it **before** looking at any scores,
  and never tune against it (C0.3).
- Add the 20 short domain queries from C0.2 to the in-domain set.

### C2. Evaluation script

Write `scripts/eval.ts` (`npm run eval`), which runs the full search cascade exactly
as the UI does (factor that cascade out of `App.ts` into
`src/engine/answer.ts` first, so the UI and eval share one code path) and reports:

- Recall@1 and recall@5 (matching paragraph, or printed page ±1).
- Correct-citation rate of the top result.
- False-answer rate on the tuning set, the held-out set, and the near-domain
  traps, reported separately.
- The C0.1 comparison: section-grouped ranking against chunk ranking with
  per-section diversity.
- The tier that answered each question.
- A threshold sweep table (raw cosine 0.30–0.60, step 0.02) with recall and
  false-answer rate.

Write the results to `reports/eval-latest.md` and commit it.

### C3. Tune

- Choose thresholds on the **tuning** set that give 0 % false answers, at most 10 %
  on near-domain traps, and maximum recall@5 subject to those limits. Then report the
  **held-out** false-answer rate; if it exceeds 5 %, investigate before accepting. Record
  the chosen values and the sweep that justifies them in `README.md` §3.
- **Targets:** recall@5 ≥ 90 % through the full cascade (baselines: 86 % raw chunk
  ranking, 65 % document tier after Phase A), and top-result citation correct ≥ 80 %.
  If you miss them, document the gap and the likely causes. Do not distort the
  gold set to meet them.
- Add a CI-friendly test that fails if recall@5 drops more than 3 points or the
  off-topic false-answer rate rises above 0.

---

### OD. Owner decisions and follow-ups *(decided 1 October 2026; do before Phase D)*

The owner has answered the C-phase open questions. Treat these as settled; do not reopen them.

**OD.1 Semantic threshold stays at 0.52.** Do not move it to 0.54. The four held-out leaks (cattle herd,
tomato fertiliser, aphid pesticide, ocean salinity) are near-domain and are answered with verbatim, cited
WCA text, so nothing is fabricated; 0.54 would cost about 3.6 points of recall@5 and would be chosen from
held-out results. Record the decision in `src/engine/config.ts` next to the value and in README §3. Accept
the 5.6 % held-out rate as a documented, known limitation in the Definition of done.

**OD.2 Withhold flagged excerpts until the owner approves them.**
1. The curated Q&A tier must not serve any row whose `needs_owner_review` is `yes` in
   `reports/qa-excerpt-repairs.csv` (and has no approval recorded under OD.4). Those questions fall through to
   document search. Implement this at build time: `build-qa.ts` writes a `servable: false` flag (or omits the
   row from the Q&A index), and the engine skips it. Learn mode and the questions bank may still list the
   question, but its reveal must show the document-search result, never the unapproved excerpt.
2. Tests: no unapproved flagged row can be returned by `qaSearch`; a flagged question still gets an answer
   from the document tier (check with 3 examples from the repair log).
3. Run `npm run eval` and record the effect. Recall@5 may drop slightly; it must stay ≥ 90 %. If it falls
   below, report the numbers to the owner before continuing.

**OD.3 Allow multi-passage excerpts.** Some correct answers span several non-contiguous passages (list
answers such as the 12 themes, or a definition plus its qualification). Forcing them into one passage
truncated them.
1. Change the excerpt format so an excerpt is an ordered list of passages, each with its own printed page:
   `excerpts: { text: string; printedPage: number }[]`. In `data/wca-qa.csv`, encode multiple passages in
   the `excerpt` column separated by a line containing only ` [...] `, with pages as `"34; 36"` in
   `page_number`. Keep single-passage rows unchanged.
2. Every passage must pass `validate-data.ts` individually: verbatim, and on its stated page (±1). Strip
   leading heading or furniture text such as "DATA ARCHIVING" from passages; a passage starts at a sentence
   or paragraph-number boundary.
3. Render the passages in order inside the answer block, separated by an ellipsis rule, each with its own
   page. Copy citation lists every page: `WCA 2030, Theme 2: Land (pp. 79, 81): "…"`.
4. Re-repair the flagged rows that are list or multi-part answers as multi-passage excerpts. Mark them
   `method = multi-passage` in the repair log, keep `needs_owner_review = yes` (the owner still approves
   them), and record before and after coverage.

**OD.4 Owner review tool.** Build `scripts/dev/review-excerpts.html`: a single self-contained local page,
with no network access and no build step, that loads the repair log and the source chunks (open it from the
file system or via `npx vite` in dev).
- For each flagged row, show the question, the original excerpt, the proposed excerpt, and the 3 best
  alternative source passages, each with page and § citation.
- Actions per row: **Accept proposed**, **Use alternative n**, **Edit** (the edit is restricted to selecting
  a span of verbatim source text; free typing is not allowed), and **Reject** (keep the question out of the
  Q&A tier permanently).
- **Export decisions** writes `data/excerpt-decisions.csv`.
- Write `scripts/apply-excerpt-decisions.ts`, which applies that CSV to `data/wca-qa.csv`, sets
  `needs_owner_review = no` and `approved_by = owner` for decided rows, reruns `validate-data.ts` and
  `build-qa.ts`, and refuses to apply any decision that fails validation.
- Document the workflow in README (a short "Reviewing curated excerpts" section).

**OD.5 Stricter item-code lookup.** The item-card tier must fire only when the code is the main content of
the query: a bare code (`0903`, `903`), `item 903`, `item 0903`, or a code plus at most two other words
(`item 0903 definition`). A longer question that merely mentions a code, such as "What does WCA 2030 say
about Item 0903?", goes through the normal cascade. Apply the same rule to figure/table lookups. Add tests
for each case, and run `npm run eval`.

**OD is complete when:** the gates pass, `npm run eval` shows recall@5 ≥ 90 % and 0/60 tuning false
answers, no unapproved flagged excerpt is served, the review page works end to end on 3 sample rows
(demonstrate it, then **revert those sample decisions**; only the owner makes real ones), and the
changelog records before and after numbers.

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
- [ ] Off-topic false-answer rate is 0 % on the tuning set (≥ 60 questions). Held-out rate: ≤ 5 % was
      the target; 5.6 % (2/36 near-domain leaks, answered with verbatim cited text) is **accepted by the
      owner** (OD.1) and documented as a known limitation.
- [ ] No curated excerpt flagged `needs_owner_review` is served until the owner approves it (OD.2).
- [ ] Recall@5 is at least 90 %, or the gap is documented with causes.
- [ ] Every citation shows a printed page that matches the PDF, verified by
      `validate-data.ts`.
- [ ] No paraphrase is displayed as an answer.
- [ ] Zero runtime requests to external hosts (verified in a Playwright network log
      of the preview build with the network disabled after first load).
- [ ] `CHANGELOG-improvements.md` contains a summary per phase with before → after
      metrics.
- [ ] Open questions from §0.6 are listed for the owner.
