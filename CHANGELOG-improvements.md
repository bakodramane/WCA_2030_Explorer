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

### B4-R — Validation and Q&A repair (redo from scratch)

- `feat(B4): add validate-data.ts` — new `scripts/validate-data.ts` plus modules `scripts/lib/{normalise,source-text,csv,validate-checks}.ts`. Checks: every Q&A excerpt is verbatim and starts within ±1 printed page of `page_number`; `qa.json` matches the CSV; item descriptions (bullet markers ignored, because the builder flattens bullet lists), glossary entries, and chunk texts are verbatim and on the right page. Normalisation covers whitespace, curly quotes, dashes, ligatures, and the PDF's bullet glyph (U+008B). Failures are written to `reports/qa-validation.csv` and the exit code is non-zero. **First run on the unrepaired data: 131 non-verbatim excerpts, 4 wrong pages (rows quoting pp. 70, 70, 103, 201 that start on 68, 68, 101, 199), 7 non-verbatim chunks, 0 item or glossary failures.** Not yet wired into `build-index`, because it fails until the data is repaired.
- `chore(C0.5): add probe` — `npm run probe` (`scripts/dev/probe.eval.ts`, own vitest config, not part of `npm test`) measures chunk recall@5, document-tier page accuracy, short-query refusals, and off-topic false-answer rate. **Baseline @ `b22607f` (400 chunks): pure-cosine recall@5 38/51 (75 %) — reproduces the brief; boosted-rank recall@5 33/51 (65 %); document tier answered 48/51, page-correct@5 31/51 (61 %; the brief's 30/51 differs by one because the probe counts a chunk whose page *range* overlaps the ±1 window); short queries refused by the document tier 5/15 (fallow, holder, sex of holder, intercropping, tabulation); off-topic false answers 0/59 (tuning set).** Note for C2: the priority and exact-word boosts make chunk ranking *worse* (65 % against 75 %).
- *Finding:* the 7 non-verbatim chunks come from `scripts/lib/pack.ts` dropping every unit under 5 words (`MIN_UNIT_WORDS`). That deletes crop-code rows such as `2.01.01 Artichokes` from Annex 6 and the `GLOSSARY OF TERMS` heading, so chunk text is not a contiguous quote of the source. Fixed in the next commit.
- `fix(B4): keep short units in chunk text` — `pack.ts` now packs units under 5 words with their neighbours instead of dropping them (only a run that is nothing but a heading fragment is still discarded). Annex 6 crop-code rows and the glossary heading are restored; chunk text is a contiguous quote of the source again. **Chunks 400 → 401; 389 embeddings reused by text, 12 re-embedded offline. `validate-data` chunk failures 7 → 0.** Probe after the change is identical to the baseline: pure-cosine recall@5 38/51 (75 %), document tier 31/51 (61 %) with 48 answered, 5/15 short queries refused, off-topic false answers 0/59. `docs/` rebuilt.
- `feat(B4): repair curated excerpts and wire validation` — `scripts/repair-qa.ts` (`npm run repair-qa`) replaced **131 non-verbatim excerpts** in `data/wca-qa.csv` with contiguous verbatim passages and corrected **4 pages** on verbatim excerpts (rows quoting pp. 70, 70, 103, 201; true start pages 68, 68, 101, 199). Method: 4-gram diagonal voting against the cleaned PDF text, joining clusters within 150 words when an original was stitched from nearby sentences, completing sentence edges, and restoring the PDF's bullet glyph as `•`. **Every change is in `reports/qa-excerpt-repairs.csv`** (row, question, old page, new page, method, confidence, coverage, length ratio, `needs_owner_review`, old and new excerpt). Outcome: 14 `furniture-removed` (page numbers and running headers stripped; text otherwise exact), 71 `passage-match`, 46 `joined-passages`, 4 `page-only`. **55 repairs are low-confidence and carry `needs_owner_review=yes`** (coverage < 0.85 because the old excerpt was paraphrased, or the replacement is more than twice as long as the old text); the other 80 are high-confidence. 31 pages changed in total (27 from excerpt repairs, 4 page-only). The `answer` paraphrases, tags, and section titles were not touched, so a few `section_title` values may now be a little off for rows whose page moved.
- `build-qa.ts` now reuses existing embeddings by question text (404 of 404 reused here; the model is not even loaded) and sets `allowRemoteModels = false` with `localModelPath = public/models`, so it can never download the model. It uses the shared CSV parser. `qa.json` embeddings are byte-identical to before; only `excerpt` and `page_number` changed.
- `validate-data.ts` now **passes with zero failures** and runs last in `build-index`; `tests/validate-data.test.ts` runs it against the committed data. Probe after the repair (401 chunks): pure-cosine recall@5 37/51 (73 %), boosted 32/51 (63 %), document tier answered 48/51, page-correct@5 31/51 (61 %), 5/15 short queries refused, off-topic false answers 0/59. The one-question drop in recall is the gold pages being corrected (the probe uses `page_number` as the answer key), not a retrieval change. `docs/` rebuilt (24 precache entries, 70.7 MB). Tests: 196 pass in 21 files.

### B2.1 — Section granularity

**Baseline @ `4478515` (401 chunks):** 150/401 (37 %) chunks carry a section- or theme-level title (89 section + 61 theme); 121 chapter-level; 113 annex-level (70 of them Annex 4, one shared title); 9 glossary; 8 References; 37 of 90 outline sections used.

- `wip(B2.1): outline paragraph hints and Annex 4 themes` — `data/source-outline.md` now carries a `paragraphs: a–b` hint on 57 bullet sections of Chapters 1, 2, 3, 8, 9, and 10 (generated from heading positions in the PDF by `scripts/dev/outline-hints.ts`; five headings that are not single lines were read by hand: ¶8.12, 8.16, 9.26, 9.34, 9.40). `tests/outline-hints.test.ts` checks every hint against the PDF: each range starts and ends on a page inside its section and ranges never overlap. A parent heading that runs straight into a child heading (Stakeholders' needs, Statistical needs, Relevant international initiatives, Methodological considerations) gets no hint, so the more specific child wins. `scripts/outline.ts` reads the hints and now extends a bullet section that was given as a single page `(p. N)` to the start of the next sibling (previously only that one page matched, which is why 121 chunks fell back to the chapter title).
- Annex 4's 12 themes added to the outline as `Annex 4 · Theme n: …` (outline 125 → 137 entries). *Note:* the PDF's own table of contents does **not** list them (it has only "Annex 4 … 134"), so the ranges come from the `THEME n:` headings on the annex pages; consecutive themes share the page where the next heading appears (136, 139, 142, 146, 149, 158, 162, 164, 166, 169). `build-items.ts` now reads only Chapter 7 themes for item labels, and `items.json` is unchanged.
- `feat(B2.1): chunk by section, theme, and heading` — new `scripts/lib/headings.ts` recognises outline headings in the line stream (one to four wrapped lines against an outline title, only on a page inside that entry's range); `units.ts` starts a unit at each heading and tags it with its section; `assign-section.ts` assigns by heading, then by `paragraphs` hint (or numeric id for Chapters 4–6), then by carry-forward from the previous unit while the page is still inside that section, then by page, and keeps the chapter title only for chapter intros; `chunk.ts` drops the References list before packing.
- **Before → after (401 → 414 chunks).** Section- or theme-level titles **150/401 (37 %) → 347/414 (83.8 %)** (target ≥ 75 %); outline sections used **37 → 86 of 90**; distinct titles 65 → 127; Annex 4 chunks **1 shared title → 12 themes** (72 chunks, "Annex 4 · Theme n: …"); References chunks **8 → 0**; chapter-level chunks 121 → 15; chunks in 150–350 words 90.3 % → 87.0 % (a chunk cannot cross a section boundary, so small sections give more short chunks; the test bound is now 85 %); average 275.8 → 259.7 words.
- **Paragraph numbers corrected.** Chunks with a paragraph number went 322/401 → 273/414, which is a correction, not a loss: 45 Annex 4 chunks carried a bogus "§4.16" because a wrapped cross-reference line ("4.16 for more information on how to report crops…") was read as a paragraph start. A paragraph number must now be followed by a capital letter, quote, bracket, bullet, or digit, and dotted classification codes inside annexes (`1.90 Other cereals`) are no longer reported as paragraphs. **Body chapters: 258/271 (95.2 %) → 273/290 (94.1 %) with a paragraph number**, now with no false ones.
- **Probe, before (post-B4, 401 chunks) → after (414 chunks):** pure-cosine recall@5 37/51 (73 %) → **41/51 (80 %)**; boosted recall@5 32/51 (63 %) → 36/51 (71 %); document tier answered 48/51 → 47/51; document tier page-correct@5 31/51 (61 %) → **37/51 (73 %)**; short queries refused by the document tier 5/15 → 5/15 (fallow, holder, sex of holder, intercropping, tabulation: C0.2 and C0.4 target these); off-topic false answers 0/59 → 1/59 at the old threshold, **0/59 at 0.46**.
- **Threshold change, with the measurement.** At 0.45 the question "What is the most popular social media platform?" leaked. Cause: the heading split gave ¶10.20ff. ("Promoting statistics through contemporary media and tools", which does discuss social media) its own chunk, and that chunk scores raw cosine **0.455** (it was 0.442 when the paragraph sat in a larger chunk). `ENUM_CONFIDENCE_THRESHOLD` goes 0.45 → **0.46**, the smallest value that refuses it. On the probe, 0.45, 0.46, and 0.47 give identical answered counts (47/51) and page accuracy (37–38/51), so the change costs nothing measurable. This is still tuned on the same fixture, so C3 re-tunes it on separate tuning and held-out sets (C0.3). Tests: 209 pass in 22 files; `validate-data` passes.

### B5 — Index version handshake

- `feat(B5): content-hash index version and startup handshake` — `scripts/lib/index-version.ts` computes `wca2030-<12 hex>` as a SHA-256 over `chunks.json`, `qa.json`, `items.json`, and `glossary.json` (name and bytes, fixed order; it refuses to hash if one is missing). `scripts/write-meta.ts` stamps `src/data/model-meta.json` and copies it to `public/data/model-meta.json`; it runs after `build-qa` and before `validate-data` in `build-index`, and `embed.ts` also stamps it (the last step re-stamps after items, glossary, and Q&A are rebuilt). Current version: `wca2030-f4e0567bcf78`.
- Runtime: `src/engine/index-version.ts` fetches `data/model-meta.json` after the engine loads and compares it with `localStorage.wca_index_version`. First run stores it silently; a change purges cached data-file responses from **runtime** caches (the Workbox precache is deliberately left alone, because removing it would leave an offline user without an index), stores the new version, and shows the existing "Guidelines index updated. Reload to apply." banner (extracted to `src/ui/update-banner.ts`). A missing or unreadable meta file changes nothing.
- *Fix on the way:* the service-worker banner also fired on the **first** install (the initial `clients.claim()` raises `controllerchange`), telling brand-new users "Guidelines index updated". It now only shows when the page already had a controller.
- Verified in Chromium against `vite preview`: first load stores `wca2030-f4e0567bcf78` with no banner; after setting an old stored version and reloading, the banner appears and the stored version is refreshed; no page errors; the only host contacted is `localhost`. `model-meta.json` is in the precache (24 → 25 entries, 70.9 MB). README §4 and `CLAUDE.md` Phase 7 now describe the automatic hash instead of a manual bump. `tests/index-version.test.ts` (9 tests) covers comparison, cache purging (precache untouched), the handshake flows, hash determinism, and a guard that the committed `model-meta.json` matches the committed data.

## Phase C — Measure, then tune

### C0.4 — Windowed chunk embeddings

- `feat(C0.4): embed chunks as windows and score by best window` — `all-MiniLM-L6-v2` was trained on 256 tokens, but the 414 chunks average ~377. New `scripts/lib/windows.ts` splits each chunk into **sentence-aligned windows of at most 200 tokens** (token counts come from the model's own tokenizer, summed per word, which is exact for BERT pre-tokenisation; a closing sentence of at most 40 tokens is repeated as overlap; sentences over 200 tokens, such as code tables, are cut into word runs; a final window under 30 tokens folds into its predecessor up to 240). `scripts/lib/embed-windows.ts` embeds them offline and reuses vectors by chunk text and `windowScheme` (`sent-w200-v1`). `chunks.json` now carries `windows[{start, end, embedding}]` instead of `embedding`, as compact JSON with float32 values printed to 9 digits (lossless). `RetrievalEngine` scores a chunk as its **best window** (legacy single vectors still work, which keeps the mock-based tests unchanged). The display and citation unit is still the whole 200–350-word chunk. `CLAUDE.md` Phase 3 and 4 updated.
- **Numbers.** 414 chunks → **1 016 windows (2.45 per chunk)**; no window exceeds 240 tokens (tested with the real tokenizer); embedding took 29 s offline; `chunks.json` 4.9 MB (pretty-printed, 1 vector per chunk) → 5.9 MB (compact, 2.45 vectors per chunk).
- **Probe, single whole-chunk vector → windows (same 414 chunks, 51 questions):** pure-cosine recall@5 41/51 (80 %) → **43/51 (84 %)**; boosted recall@5 36/51 (71 %) → **42/51 (82 %)**; document tier answered 47/51 → 48/51; **document tier page-correct@5 37/51 (73 %) → 35/51 (69 %)** (chunk ranking improved but the section-grouped ranking got worse: C0.1 targets exactly this); short queries refused by the document tier 5/15 → **2/15** (only fallow and intercropping remain).
- **Threshold.** Window scores run higher, and a precise window lifted "What is the most popular social media platform?" to raw **0.505** (the paragraph on promoting statistics through social media; the next-highest off-topic question is 0.400, "GDP of Germany"). At 0.46 it leaks; at 0.51 nothing leaks but the five short queries are refused again (probe: 47/51 answered, page-correct 35/51). **`ENUM_CONFIDENCE_THRESHOLD` 0.46 → 0.51 provisionally**: the semantic gate has to be strict, and terse domain queries should pass through the vocabulary gate of C0.2 instead of a low semantic threshold. This is not final: C3 re-tunes on separate tuning and held-out sets. Off-topic false answers 0/59. `tests/guardrail.test.ts` now computes its expectations from the constant. Tests: 229 pass in 25 files.

### C1 — Gold set and held-out set

- `test(C1): add gold set and held-out off-topic set` — `tests/fixtures/gold.json` holds **140 in-domain items** generated by `scripts/dev/build-gold.ts` from `scripts/dev/gold-data.ts`: **80 `reworded`** (every fifth curated question, reworded so the Q&A tier cannot match it verbatim; answer key = that row's verified printed page), **40 `new`** (written from the PDF text across Chapters 4–9 and Annexes 4, 6, and 7, each with the verifying paragraph where one exists and an answer phrase), and **20 `short`** domain queries (the 15 from §0.3 plus cut-off threshold, farm register, permanent crops, tillage practices, household size; each needs an answer chunk containing a term, and every term was checked to occur in the document). Expected pages for the new questions are computed from the PDF, not typed, and the build fails if a paragraph or phrase cannot be found or does not sit on the same page.
- `tests/fixtures/off-topic-heldout.json`: **36 questions, 10 of them near-domain traps** (e.g. "What was Nigeria's 2020 maize yield?", "Who chairs the FAO Council?"). Written before any retrieval score was inspected, with no overlap with the tuning set by exact text or topic (ten drafts that repeated tuning topics were replaced). It must never be used for tuning (C0.3). The tuning set `off-topic.json` gained one question (59 → **60**, as the brief's definition of done requires) and is now labelled as the tuning set.
- `tests/gold-fixture.test.ts` (6 tests) checks the counts, uniqueness, that no reworded question equals a stored one, that each new answer phrase is on the stated page, that every short term occurs in the document, and the sizes and independence of the two off-topic sets.

### C0.1–C0.5, C2, C3 — Shared cascade, evaluation, and tuned thresholds

One commit covers these tasks because the pieces depend on each other (the eval needs the shared cascade, the threshold choice needs the eval). `npm run eval` (`scripts/eval.ts`, ~25 s) writes `reports/eval-latest.md`.

- **C2 — one code path.** The cascade moved out of `App.ts` into `src/engine/answer.ts` (`answerQuery`, `searchDocument`, `judgeDocument`); `App.runSearch` is now a render switch over its outcome (logging unchanged). `retrieval.ts` no longer touches `import.meta.env` unguarded, so the same engine runs under `tsx`. The eval reports recall@1, recall@5, top-citation correctness, per-tier counts, false answers on every off-topic set, the ranking comparison, and sweeps of the semantic threshold, the lexical floor, and the Q&A threshold. Replaces the interim `npm run probe`.
- **C0.4 comparison, measured in C2** (document tier only, `chunk-raw` ranking, 140 gold items): (a) whole-chunk single vector, 414 chunks: recall@1 57.9 %, recall@5 **75.7 %**; **windows (shipped)**: 62.1 %, **87.1 %**; (b) smaller display chunks of at most 180 words (835 chunks, still windowed): 65.0 %, 86.4 %. Windows win on recall@5 while keeping 0 tuning false answers at 0.52; (b) doubles the chunk count for no gain. The experimental variants build with `WCA_MAX_WORDS`, `WCA_MIN_TARGET_WORDS`, `WCA_CHUNKS_RAW`, and `WCA_CHUNKS_OUT` (shipped files untouched).
- **C0.1 — ranking.** Section-grouped ranking scores recall@5 **74.3 %**, boosted chunk ranking 80.7 %, chunk ranking by raw best-window cosine with at most two chunks per section **86.4 %** (recall@1 52.1 % → 62.1 %). The priority and exact-word boosts make ranking *worse*. `DEFAULT_RANKING = 'chunk-raw'`; the boosts still exist but no longer order results.
- **C0.2 — terse domain queries.** `src/engine/vocabulary.ts`: a query is a domain-vocabulary query when **every** content word is a stem of a word in a glossary term, outline title, item name, or curated question, and one of them has five or more letters; such a query may be answered by the BM25 fallback with no semantic floor. *Deviation from the brief:* it asked that a *single* term in that vocabulary pass; measurement showed that would admit "What is the population of India?" ("population" is in outline titles), so the rule needs every content word to be domain vocabulary, which includes the single-term case. Result: 19 of the 20 short queries qualify (only "crop residue" does not, and passes semantically) and **none of the 132 off-topic questions in the three sets does**. Short-query answered 90 % → 100 %, recall@5 75 % → 95 %. Figure and table titles were tried as a vocabulary source and dropped (the word "table" made "periodic table" qualify).
- **C0.3 — independent sets.** Tuning set `off-topic.json` (60), held-out `off-topic-heldout.json` (36), and, because the first held-out set was inspected while investigating its leaks, a second clean set `off-topic-heldout2.json` (36, 10 near-domain traps) written before any score on it was computed. Thresholds are chosen on the tuning and gold sets only.
- **Two failures outside the document tier, found by the first full-cascade run.** (1) The curated-Q&A tier at similarity 0.60 answered **27 of the 40 new questions with a related but wrong curated row** (full-cascade recall@5 on new questions 70 %, document tier alone 92.5 %). Sweep result: `QA_THRESHOLD` 0.60 → **0.80** (gold recall@5 86.4 % → 92.9 %; new 70 % → 90 %). (2) Item cards count as answers when their verbatim description holds the answer (the lookup fires on any 3–4 digit number, e.g. "Item 0903" inside a longer question; left as is, scored fairly).
- **Entity grounding (C3).** `src/engine/entities.ts`: a capitalised word in the middle of the query (Nigeria, Kenya, Brazil; acronyms and structural words such as Annex and Item ignored) must appear in the answering chunk or curated row. Held-out false answers **6/36 → 2/36**, near-domain traps **6/10 → 2/10**, with unchanged gold recall; it also removes tuning-set leaks at lower thresholds (at 0.36: 6/60 → 2/60), independent evidence that it generalises. *Negative results, not adopted:* a "word absent from the corpus" gate (five of ten near-domain traps contain no such word, and 16 ordinary gold questions do), and score-margin and z-score features (the tuning maximum overlaps the gold range).
- **C3 — chosen thresholds** (all in `src/engine/config.ts`, with the evidence beside each): semantic **0.52** (was 0.46 before C0.4, 0.51 provisional in C0.4; the lowest value refusing all 60 tuning questions, whose highest score is 0.505), Q&A **0.80** (was 0.60), lexical floor **0.38** (was 0.32; plateau 0.34–0.42, and 0.30 leaks one tuning question). The duplicated `DEFAULT_QA_THRESHOLD` is gone (E2 item), and `evaluate()` takes `{ threshold, lexicalFloor, accept }` options.
- **Result, full cascade (gold 140):** recall@5 **94.3 %** (target ≥ 90 %); recall@1 83.6 %; top citation correct for **83.6 %** of answers (target ≥ 80 %); reworded 96.3 %, new 90.0 %, short 95.0 %; answered by tier: verified 69, document 61, item 4, glossary 6. **Tuning false answers 0/60.** Held-out: **2/36 (5.6 %)** on each set, near-domain traps 2/10 and 1/10. The held-out rate is one question over the 5 % target. *Investigation:* the four leaks are genuine topic overlaps with specific facts the guidelines do not hold (largest cattle herd, tomato fertilizer, saltiest ocean, which pesticide kills aphids), which no embedding threshold separates from in-domain questions. *Trade-off:* at 0.54 the cascade reaches 90.7 % recall@5 with 1/36 leaks on both sets (0.56: 89.3 %, 1/36 and 0/36). I kept 0.52 because choosing 0.54 from held-out results would be tuning against them; this is listed as an open question for the owner.
- **CI guard:** `tests/eval-regression.test.ts` fails if full-cascade gold recall@5 drops more than 3 points below `tests/fixtures/eval-baseline.json` (0.943), if any tuning off-topic question is answered, or if either held-out set leaks more than 2. `tests/guardrail-regression.test.ts` now runs `answerQuery` for each tuning question. New unit tests: `vocabulary` (5), `entities` (4). **Tests: 249 pass in 29 files.**
- Docs: README §3 rewritten with the chosen values and the sweeps behind them; `CLAUDE.md` notes the new cascade. `docs/` rebuilt.

## OD — Owner decisions

- `docs(OD.1)`: the semantic threshold stays at **0.52** (recorded in `src/engine/config.ts` and README §3); the 5.6 % held-out rate is an accepted known limitation. No numbers change.
- `feat(OD.2)`: **flagged excerpts are withheld.** `data/wca-qa.csv` gains `needs_owner_review` (seeded from the repair log: 55 rows) and `approved_by`; `build-qa.ts` writes `servable` to `qa.json` (349 of 404 servable); `qaBest` skips unservable rows, so those questions fall through to document search. Learn and self-test reveals for a withheld row show the best document-search passage with its § and page citation (or say none was found), never the held excerpt. `repair-qa.ts` flags future low-confidence repairs the same way. Tests (`tests/unapproved-excerpts.test.ts`): CSV flags equal the repair log, no withheld row is returned by `qaSearch` even for its own exact question, three flagged examples still get an answer from another tier. **Eval before → after:** full-cascade recall@5 94.3 % → **92.1 %** (reworded 96.3 → 92.5, new 90.0 → 90.0, short 95.0 → 95.0), recall@1 83.6 → 80.0 %, top citation 83.6 → 80.0 %, tuning false answers 0/60, held-out 2/36 on both sets (unchanged); tier counts document 66, verified 64. `tests/fixtures/eval-baseline.json` recall baseline 0.943 → 0.921. 253 tests pass.
- `feat(OD.3)`: **multi-passage excerpts.** An excerpt is now an ordered list of passages, each with its own printed page (`src/engine/excerpts.ts`): in `data/wca-qa.csv` passages are separated by a line holding only ` [...] ` and `page_number` reads `"34; 36"`; single-passage rows are unchanged. `validate-data.ts` checks every passage individually (verbatim, on its own page ±1, and one page per passage). Cards, Learn, and self-test render the passages in order with a dashed `[…]` rule and each page; the copy citation lists every page (`WCA 2030, Theme 2: Land (pp. 79, 81): "…"`). `scripts/repair-multipassage.ts` (a) trims heading text from the start and end of passages (e.g. "DATA ARCHIVING 10.29 …" → "10.29 …"; 15 rows trimmed, still verbatim) and (b) re-repairs flagged rows that were stitched from separate places: **26 flagged rows became `multi-passage`** (replacing the bridged span, so unselected text between the passages is no longer quoted). All stay `needs_owner_review = yes`; nothing was approved. The log (`reports/qa-excerpt-repairs.csv`) gains `coverage_before` and `previous_method`; coverage before and after is identical by construction (the same clusters are matched; the gain is tighter text). *Limit:* the "12 themes" row stays a poor proposal (the source has no single list of the 12 themes outside the table of contents, which is front matter), so it is withheld and for the owner to decide. Eval unchanged: recall@5 92.1 %, tuning false 0/60, held-out 2/36 on both. 258 tests pass.
- `feat(OD.4)`: **owner review tool.** `scripts/dev/review-excerpts.html` is one self-contained page (no network, no build; file pickers when opened from `file://`, automatic loading when the repository root is served). It lists the 55 flagged rows with the original excerpt, the proposed excerpt, and the three best alternative source passages (IDF-weighted overlap with the question and original excerpt, cited with § and page); actions Accept proposed, Use alternative n, Edit (selection of verbatim text from source passages only, checked against the chunk text; no free typing), Reject; **Export decisions** downloads `excerpt-decisions.csv`. `scripts/apply-excerpt-decisions.ts` applies it to `data/wca-qa.csv` (`needs_owner_review = no`, `approved_by = owner`; rejected rows get `approved_by = rejected` and stay withheld), refuses any decision that is not verbatim or not on its stated page (resolving each page from the PDF), then runs `build-qa`, `write-meta`, and `validate-data`. README has a "Reviewing curated excerpts" section; `tests/apply-decisions.test.ts` covers the refusals. **Demonstrated end to end in Chromium on 3 sample rows** (row 154 accepted, row 270 alternative 1, row 272 rejected): the page showed 55 cards with 3 alternatives each, contacted only the local server, exported 3 decisions, the apply script applied 3 and refused 0, `validate-data` passed, and 351 of 404 rows became servable. **Those sample decisions were then reverted** (`git checkout` of the data files; 349 servable again, no decisions file committed); no real decision has been made. 260 tests pass.
- `feat(OD.5)`: **stricter lookups.** The item-card tier fires only for a bare code (`0903`, `903`), `item 903`, `item 0903`, or a code plus at most two other words (`item 0903 definition`); the figure/table tier only when the query starts with the kind and reference and carries at most two further words. Longer questions that merely mention a code ("What does WCA 2030 say about Item 0903?", "Do items 0301 to 0308 ask whether holdings are equipped for irrigation?") go through the normal cascade. 7 new tests cover each case. **Eval before → after:** recall@5 92.1 % → **92.9 %** (new questions 90.0 → 92.5 %), recall@1 80.0 → 80.7 %, tuning false answers 0/60, held-out 2/36 on both; tiers: document 69, verified 65, glossary 6, item 0 (was 4). Baseline `goldRecall5` 0.921 → 0.929. 267 tests pass.

**OD complete.** Gates pass, recall@5 92.9 % (≥ 90 %), tuning false answers 0/60, no unapproved flagged excerpt is served, the review page was demonstrated on 3 rows and reverted. Net OD effect on recall@5: 94.3 % → 92.9 % (the cost of withholding 55 excerpts, partly recovered by OD.5).

## Phase D — Interface refinements

- `feat(D1)`: **results above the fold.** After the first search the header becomes a compact bar (small title, a "Browse & learn" toggle, and the search box); the subtitle, trust strip, About panel, Learn/Browse groups and hub buttons, starter chips, and search helper text sit behind the toggle (`aria-expanded`, 44 px target). `scripts/screenshot.ts` (`npm run build && npm run screenshot -- --check`) drives the preview build in Chromium with `playwright-core` (new **dev-only** dependencies `playwright-core@1.56.1` and `@axe-core/playwright`; no browser download, Chromium from `/opt/pw-browsers`), saves home and result screenshots to `reports/screenshots/` (gitignored), and fails if the first result card is not above the fold. **Before → after, top of the first result card:** 1280×900 **492 → 161 px** (limit 300); 390×844 **410 → 161 px** (limit 360); same for a curated answer and a document answer. No data or retrieval change. 267 tests pass.
- `feat(D2)`: **result card layout.** One citation line per card, `§7.2.13 · Theme 2: Land · p. 81` (`src/ui/citation.ts`): the duplicated header and "Source:" line are gone; section titles are in sentence case (trailing parentheticals dropped, acronyms and proper-name phrases kept; the full outline title is in the tooltip) and no longer rendered in a clipped, all-caps style. The percentage relevance bar is replaced by a band: **Strong match** (raw cosine ≥ threshold + 0.15), **Good match**, or **Partial match (keyword)**; curated cards use the same bands against the Q&A threshold; the raw score lives only in the `title` tooltip. Filter pills and card groups use `chunk.chapterLabel` only: the `deriveGroup` page-arithmetic fallback is gone from `App.ts` and `deriveResultGroups`. The copied citation uses the same short title (`WCA 2030, §7.2.13, Theme 2: Land (p. 81): "…"`). `tests/citation-line.test.ts` (3 tests) added; `render-chunk` updated. Above-the-fold check still passes. No data or retrieval change. 270 tests pass.
- `feat(D3)`: **source navigation and sharing.** `vite.config.ts` emits `source/Census-2030_EN-DTP-9.pdf` (2.5 MB) into the build and the Workbox glob now includes `pdf`, so it is precached (pre-cache 25 → 26 entries, 71.7 → 74.1 MB). Document, curated, item, and figure/table cards carry a **View page in PDF** link to `…/source/Census-2030_EN-DTP-9.pdf#page=<pdfPage>` (printed page + 14; same origin, `rel="noopener"`). `?q=<query>` deep links run the query on load and fill the search box; every search updates the URL with `history.replaceState` (no history entries). `scripts/browser-check.ts` (`npm run build && npm run browser-check`) verifies in Chromium: the PDF is in the precache manifest, the deep link works, the URL follows searches, the PDF link points at page 54 for a printed-page-40 answer, **with the network disabled after first load a reload still searches and the PDF is served from the precache**, no request leaves localhost, and there are no page errors (10/10 pass). This also satisfies the Definition-of-done network check. Unit test added; 271 tests pass.
- `feat(D4)`: **mobile and accessibility pass.** `scripts/a11y.ts` (`npm run build && npm run a11y`, `A11Y_VERBOSE=1` lists every node) runs axe-core (via `@axe-core/playwright`) on the home, result, and refusal views and every modal at 1280 px and at **360 px** (phone: through the Learn and Browse hubs), and checks tap targets (≥ 44×44 px for every visible control; inline links in running text exempt), horizontal overflow, and that the filter pills scroll. **Before: 58 problems across 27 views**: 27 serious colour-contrast violations (`--muted` #6b7280 on `--bg` is **4.26:1**, 3.98:1 on the trust strip, plus a 2.9:1 green), 2 unnamed progress bars (5 nodes), dozens of controls under 44 px (copy button 26 px, footer link 19 px, log buttons, About toggle, modal close 25×26, filter input 34, starter chips 32, not-found actions 36), and a **page that scrolls sideways at 360 px** (the query-log controls in the footer did not wrap). **Fixes:** `--muted` → #555e6b (5.8:1 on `--bg`, 5.4:1 on the strip), tally green → #166534, `aria-label`/`aria-valuemin` on both progress bars, `min-height`/`min-width` 44 px on the listed controls and chips, footer and log controls wrap, and on phones the filter-pill row is a single `overflow-x: auto` row (44 px pills). **After: 0 serious or critical axe violations, 0 small tap targets, 0 horizontal overflow in 27 views.** `tests/contrast.test.ts` guards the colour pairs. The D1 above-the-fold check still passes (161 px). No data or retrieval change. 273 tests pass.

**Phase D complete:** first result card 492 → 161 px (desktop) and 410 → 161 px (phone); one citation line and match bands; bundled PDF with page links and `?q=` deep links; offline and zero external requests verified; accessibility audit clean.

## Phase E — Performance and repository hygiene

- `perf(E1)`: **smaller first load.** Chunk embeddings moved out of JSON into `public/data/embeddings.f32` (Float32, row-major, 384 per row, one row per window in chunk order) and Q&A embeddings into `qa-embeddings.f32`; `chunks.json` (5.9 MB → **0.86 MB**) and `qa.json` (3.6 MB → **0.39 MB**) no longer hold vectors and are compact JSON. The engine reads the binary files with `fetch().arrayBuffer()` and uses `Float32Array` subarray views (inline vectors still work for legacy data and the mock-based tests). `embed.ts` and `build-qa.ts` write and resume from the binary files (no re-embedding was needed: all 414 chunks and 404 questions reused their vectors); the index version now hashes six files (`chunks.json`, `embeddings.f32`, `qa.json`, `qa-embeddings.f32`, `items.json`, `glossary.json`). **WASM:** logging requests in the preview build in Chromium shows the runtime loads only `ort-wasm-simd.wasm` (static hosts cannot set COOP/COEP, so the threaded builds are never used); the two threaded builds are no longer precached, and the plain non-SIMD build is excluded from the precache and served by a CacheFirst runtime route the first time a browser without SIMD needs it. **Pre-cache: 74.1 MB (24 entries + PDF) → 39.3 MB (40 254 KiB, 25 entries).** Data files 9.9 MB → 3.9 MB; WASM 36.6 MB → 9.55 MB. **Evaluation unchanged:** recall@5 92.9 %, tuning 0/60, held-out 2/36 on both; 274 tests pass; `browser-check` 13/13 (offline works, only the SIMD build loads, no external request). **Gap against the ≤ 35 MB target (about 4.3 MB), with causes:** the in-browser embedding stack alone is 31.5 MB (quantised ONNX model 21.9 MB + `ort-wasm-simd.wasm` 9.55 MB) and cannot shrink without changing the model or runtime; the rest is data 3.9 MB, the bundled PDF 2.4 MB (D3), and app assets 1.0 MB. Moving the PDF to runtime caching and halving embeddings to float16 would reach about 35.8 MB; not done because D3 asks for the PDF to be precached and float16 changes scores.
