# CHANGELOG — improvements programme (`improvement_prompt.md`)

Format: one section per phase, task by task, with **before → after** metrics,
and any deviations or open questions.

---

## Phase A — Restore citation trust

**Baseline at the start of Phase A:** `npx tsc --noEmit` passed; `npx vitest
run` passed 66 tests but `tests/chunking.test.ts` failed on a clean checkout
(`src/data/chunks-raw.json` is gitignored). Corpus: 876 chunks, of which 45
came from front matter / ToC (PDF pp. 1–14).

### §0.3 verification (prerequisite)

Printed-page offset **confirmed** by sampling 5 pages across the main body,
annexes, and glossary: PDF 103 → "89", PDF 148 → "134", PDF 190 → "176",
PDF 215 → "201", PDF 222 → "208". `printed = PDF − 14` everywhere; the printed
number is the first extracted line of each PDF page.

### A1 — Single printed-page scheme (`fix(A1)` 4d95cb1)

- `Chunk` now carries `pdfPage` (PDF) and `printedPage` (footer, = pdfPage − 14);
  `pageRef` kept as a deprecated alias of `printedPage` until Phase B.
- **Before:** every citation displayed a PDF page (¶7.4.18 showed "Page 103"
  and the filter pill labelled it "Chapter 8"). **After:** it shows "p. 89" and
  groups under "Chapter 7" (asserted by `tests/citation.test.ts`).
- Front matter and ToC (PDF pp. 1–14) are **excluded** from chunking — the
  brief allows exclusion ("or are excluded (see B2)"). **Before:** 45
  front-matter chunks. **After:** 0; total chunks 876 → 831, `printedPage ≥ 1`
  for every chunk.
- `deriveGroup()`/`deriveResultGroups()` moved to `src/engine/outline.ts`,
  backed by `src/data/outline.json` generated from `data/source-outline.md`
  by `scripts/outline.ts` (shared with B1). The hard-coded page ranges and the
  "≤10" front-matter guard in `retrieval.ts` were re-based onto printed pages
  (guard is now `≤ 0`; Chapter 1 starts on printed page 2 and is no longer at
  risk of being excluded).
- `tests/chunking.test.ts` was made self-sufficient in this task (falls back
  to the committed `public/data/chunks.json`) and its count bound replaced
  with 350–1200 per §0.3, reason recorded in `CLAUDE.md`; the full test
  rewrite is still B2(8).
- *Deviation:* the "chapter named by its section" data test only asserts
  heading-shaped titles (`CHAPTER 4: …`, `ANNEX 1`). Corrupt body-sentence
  titles that merely *mention* chapters (C3, e.g. "Chapter 7 for essential
  items and Annex 4 for additional items.") are Phase B's fix; the two corrupt
  titles currently in the corpus do not affect the assertion.
- *Note:* `source-outline.md` says Annex 6/7 share printed page 181 and Annex
  7/8 share 189; the outline generator allows a shared boundary page and logs
  it. B1 should verify the exact split against the PDF's own ToC.

### A2 — Per-chunk page tracking (`feat(A2)` 3747397)

- `scripts/chunk.ts` now carries the PDF page per line and per word; each
  chunk cites the page of its **first word** and stores `printedPageEnd`
  (page of its last word).
- **Before:** every chunk cited the page where its *section* started (C2).
  **After:** per-chunk pages; 223 of 831 chunks span a page break and are
  displayed as `p. 81` / `pp. 81–82` (header: `Page 81` / `Pages 81–82`).
- Acceptance test `tests/chunk-pages.test.ts`: 10 evenly-spaced chunks, first
  8 words verified against the extracted text of `pdfPage` (all pass), plus
  ordering/offset invariants.
- *Note:* only `printedPageEnd` is stored (no `pdfPageEnd`) — it can be
  derived via the +14 offset; B2's interface keeps the same single field.

### A3 — Guardrail on unboosted scores (`fix(A3)` d00d54d)

- `RankedResult` and `SectionResult` now carry `rawScore` (plain cosine)
  alongside the boosted ranking `score`; `evaluate()` gates on `rawScore`, so
  boosts can reorder results but can never turn a refusal into an answer
  (fixes C4).
- **Before:** "What is the GDP of Nigeria?" was answered (raw 0.40 boosted to
  ~0.63 by ×1.15/×1.10/×1.25ⁿ against a 0.35 boosted threshold). Measured over
  the new 60-question off-topic fixture, **31 of 60** off-topic questions
  produced a false answer (28 via the lexical fallback, 4 semantically; the
  highest off-topic raw cosine is 0.442 for "most popular social media
  platform").
- **After:** **0 of 60** off-topic questions answered. In-domain spot-check:
  **15/15** sample questions still answered (14 Q&A tier, 1 semantic).
- Initial thresholds (to be re-tuned in Phase C): `ENUM_CONFIDENCE_THRESHOLD`
  0.35 (boosted) → **0.45 (raw)** — the lowest clean value above the measured
  off-topic maximum; `QA_THRESHOLD` 0.60 unchanged (no off-topic Q&A leaks);
  new `LEXICAL_SEMANTIC_FLOOR = 0.32`.
- Lexical fallback triple-gated: (1) the query must contain ≥ 2 content words
  of 5+ chars from a **corpus-derived domain-term allow-list** (document
  frequency ≥ ~5% of chunks, min 2 — data-driven, not a hand list); (2) the
  matched chunk must contain both; (3) `evaluate()` only accepts BM25 answers
  when the best semantic raw cosine ≥ 0.32.
- *Interpretation note:* the brief's "not a common English word" filter is
  implemented as "corpus-characteristic domain term", because generic English
  words are frequent even in this corpus ("world" appears in 146 chunks via
  the running header, "population" in 106). Measurement showed one frequent
  word alone is not evidence of domain membership, hence the ≥ 2 requirement;
  B2's removal of running headers will also shrink the allow-list noise.
- New `tests/fixtures/off-topic.json` (60 questions, including the two named
  audit cases) and `tests/guardrail-regression.test.ts` (full cascade with
  the real offline model and real data; ~2.5 s, so it stays in the default
  suite).

### A4 — Verbatim answers on curated Q&A cards (`feat(A4)` 619c544)

- **Before:** only 44/404 curated `answer` fields were verbatim, yet they
  were rendered as the bold **ANSWER** with a **VERIFIED** badge (C5).
  **After:** the verbatim excerpt is the primary answer (blockquote); the
  paraphrase sits beneath it, subordinate (small, muted, italic) and labelled
  **"Curated summary (not verbatim)"**; badge renamed to "Curated question"
  (footer badge "curated").
- Learn and self-test reveal blocks share a new builder,
  `src/ui/qa-block.ts` (`qaAnswerBlockHtml`), which always emits the label.
- Copy-citation already used the excerpt only — now asserted by test.
- Trust strip text updated to stay true.
- `tests/render-qa.test.ts` (happy-dom environment, **new devDependency**)
  renders the card and the reveal block in a DOM: asserts DOM order
  (excerpt → label → summary), citation content, and a static guard that no
  UI path renders `row.answer` without the label.
- Per §0.6 the paraphrases were **relabelled, not removed**.

### A5 — Self-hosted fonts (`feat(A5)` a2ac31a)

- **Before:** `index.html` loaded Lora from Google Fonts (not pre-cached), so
  offline text fell back to Georgia (C6). **After:** Lora 400/600/400-italic
  and JetBrains Mono 400 WOFF2 files live in `public/fonts/` (SIL OFL licences
  alongside), declared via `@font-face`, pre-cached by Workbox (`woff2` added
  to `globPatterns`).
- Acceptance verified on the rebuilt `docs/`: **no `googleapis` reference
  anywhere under `docs/`**, and `docs/sw.js` lists the `.woff2` files.
- Pre-cache after the rebuild: 24 entries, ~73.6 MB (Phase E will shrink it;
  the fonts add only ~86 KB).

### A6 — Highlighting on word boundaries (`fix(A6)` aca024a)

- `highlight()` now matches `\b(term)(s|es|ed|ing)?\b` on the **raw** text,
  escaping each segment as it rebuilds the string. "land" no longer lights up
  inside "inland"; query "holder" highlights "holders"; suffixes s/es/ed/ing
  are tolerated; "classification" is not touched for the term "class".
- Matching raw text also removed a latent **double-escape bug**
  (`renderQA` passed `esc(...)` into a function that escaped again) and the
  possibility of highlighting inside `&quot;`-style entities.
- `tests/highlight.test.ts` covers the A6 acceptance cases plus
  entity-safety and escape-once assertions.

### Phase A totals

| Metric | Before | After |
|---|---|---|
| `npx tsc --noEmit` | pass | pass |
| `npx vitest run` | 66 passed, 1 suite failing on clean checkout | **154 passed, 9 suites** |
| Chunks | 876 (45 from front matter) | 831 (front matter excluded) |
| Citation scheme | PDF pages, section-start page | printed pages, first-word page, `pp. X–Y` ranges |
| ¶7.4.18 display | "Page 103", filter "Chapter 8" | "p. 89", filter "Chapter 7" |
| Off-topic false answers | ≥ 31/60 (GDP-of-Nigeria answered) | **0/60** |
| In-domain spot check | — | 15/15 answered |
| Paraphrase-as-answer | 360/404 paraphrases shown as THE answer | excerpt is THE answer; summaries labelled |
| External hosts at runtime | Google Fonts | none (fonts pre-cached) |

### Open questions / notes for the owner

1. **Enum raw threshold 0.45** is conservative (chosen so that 0/60 off-topic
   questions answer). The Q&A tier answers most in-domain queries (spot check
   15/15), but document-tier recall at 0.45–0.60 raw will be measured and
   re-tuned in Phase C's sweep — the recall@5 ≥ 90 % target may need the
   lexical tier to compensate.
2. **Lexical gate = ≥ 2 corpus-derived domain terms + 0.32 raw floor.** The
   brief specified "at least one"; one was measured to be insufficient (e.g.
   "population of India" passes on "population" alone). Revisit after B2
   removes running headers from chunk texts.
3. **happy-dom** was added as a devDependency (required by A4's DOM-render
   acceptance test). Flagging per §0.6 spirit; it is not a major-version bump
   of an existing dependency.
4. **Chunk-count bound** changed 800–6000 → 350–1200 per §0.3, reason
   recorded in `CLAUDE.md` (corpus ≈ 108 000 words → ~430–560 chunks at
   200–350 words; actual count 831 because the current chunker splits by
   paragraph sections — B2's rewrite re-packs to 200–350 words).
5. Annex 6/7 (p. 181) and 7/8 (p. 189) share boundary pages in
   `source-outline.md`; the generator allows it and logs it — B1 to confirm
   against the PDF ToC.

---

## Phase B — Rebuild the index from document structure

### B0 — Recover the working tree and close B1 (`docs(B0)`)

- Confirmed the committed A2 `scripts/chunk.ts` is complete; no partial B2
  replacement was present. The clean baseline passes `npx tsc --noEmit` and
  **159 tests in 10 files**.

### B1 — Machine-readable outline (`feat(B1)` 7c82043)

- Added **125 outline entries**: 10 chapters, 90 sections, 12 Chapter 7 themes,
  11 annexes, the glossary, and references, with ordered printed-page ranges
  and parent IDs.
- Corrected `data/source-outline.md` against the PDF table of contents: restored
  missing Chapter 2/3 sections, extended Chapter 1 to the Part One divider on
  printed page 1, and fixed the Chapter 5 table overlap.
- Resolved Phase A open question 5: Annexes 6/7 and 7/8 genuinely start
  mid-page, so siblings may share a single boundary page (printed pages 181
  and 189 respectively).

### B2 — Chunker rewrite (module commits)

- `feat(B2): extract positioned PDF lines` — added a tested PDF extraction
  module carrying PDF page, printed page, and top/bottom line positions while
  leaving the working A2 chunker in place.
- `feat(B2): strip positional page furniture` — removes front matter, printed
  page numbers, and lines repeated on five or more page edges while preserving
  repeated body content and item reference-period metadata.
- `feat(B2): split source text into atomic units` — detects body and annex
  paragraph numbers plus glossary terms, retaining per-line page provenance and
  keeping introductory text in its own unit.
- `feat(B2): assign units from the document outline` — maps units to canonical
  section titles and chapter labels, using paragraph prefixes to resolve page
  ambiguities and deriving high-priority regions solely from the outline.
- `feat(B2): pack outline units into stable chunks` — packs consecutive units
  within a section up to 350 words, preserves paragraph/page metadata, and uses
  a 50-word overlap only when a single atomic unit must be split.
- `fix(B2): keep annex codes in annexes and drop part dividers` — prevents crop
  classification codes from masquerading as chapter paragraphs and excludes
  title-only Part One/Two divider pages from answer text.
- `wip(B2): wire the validated modular chunk pipeline` — the side-by-side
  orchestrator produces 387 chunks; 353/387 (91.2%) are 150–350 words, the
  maximum is 350, 153/387 (39.5%) are high priority, 95.3% carry paragraph
  numbers, all titles come from the outline, and no running header remains.
- `feat(B2): replace the chunker and publish the structured index` — switched
  the entry point only after the side-by-side pipeline passed, added top-level
  structural boundaries and whole-unit packing, regenerated embeddings, removed
  `pageRef`, and added paragraph-aware UI/copy citations. Runtime index metrics:
  **831 → 400 chunks**; **32.1% → 90.3%** at 150–350 words; average **135.3 →
  275.8** words; maximum **300 → 350**; distinct titles **137 audit baseline /
  112 immediately before B2 → 65**, all canonical outline titles; chunks with a
  paragraph number **0 → 321/400 (80.3%)**. The full guardrail regression remains
  clean; 389 chunks were embedded offline and 11 byte-identical texts reused
  their valid prior vectors.

### B3 — Reproducible runtime data (`feat(B3)`)

- Added PDF-backed builders for **123 items** (27 essential, 96 additional),
  **118 glossary terms**, and **16 figure/table captions**. `build-index` now runs
  outline → chunk → embed → items → glossary → figures → Q&A; B4 appends validation.
- Regression comparison: glossary and figure/table fields reproduce the committed
  files exactly (only the missing final newline changed). Item names, reference
  periods, themes, pages, categories, and row order reproduce exactly.
- Every intentional item difference is listed here. Five descriptions now retain
  the PDF extractor's verbatim typography: footnote markers no longer gain an
  invented space (`0101`, `0201`), `specialised` is retained (`0104`), the source's
  lowercase “SDG indicator” is retained (`0204`), and extracted `P2O5` no longer
  gains an invented space (`0413`). `descriptionBlocks` were deterministically
  re-split at source paragraph/bullet boundaries for `0101`, `0104`, `0201`,
  `0203`, `0204`, `0209`, `0210`, `0301`, `0303`, `0401`, `0402`, `0403`,
  `0404`, `0410`, `0412`, `0413`, `0501`, `0504`, `0505`, `0613`, `0614`,
  `0616`, `0701`, `0702`, `0703`, `0704`, `0707`, `0803`, `0804`, `0903`,
  `0904`, `1002`, and `1101`; their flattened text is unchanged except for the
  five verbatim corrections above.
