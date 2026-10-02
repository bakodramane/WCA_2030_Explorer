# WCA 2030 Explorer

An **offline-first Progressive Web App** that answers questions exclusively from the
*World Programme for the Census of Agriculture 2030* (WCA 2030) guidelines.
Every answer is verbatim extracted text from the guidelines, accompanied by a
precise section title and page number.

---

## 1. Purpose & constraints

The WCA 2030 Explorer is a retrieval tool — not a generative AI. It enforces the following hard constraints:

- **Answers are extracted text only.** The retrieved chunk is the answer; no paraphrasing or generation occurs.
- **No external API calls at runtime.** After the first load, the app works with zero internet access. All model inference runs in-browser via WebAssembly.
- **Guardrail is mandatory.** When no chunk exceeds the confidence threshold *and* keyword fallback also fails, the app returns: *"This question could not be answered from the WCA 2030 guidelines. Sections searched: [list]."*
- **Every answer cites** the source chunk's section title and **printed** page number (printed page = PDF page − 14). The result card shows `WCA 2030 · <section> · p.<printed>` with a link to the matching PDF page, and multi-passage curated excerpts list every page (`pp. 34; 36`).
- **No generative model at runtime.** The embedding model (`all-MiniLM-L6-v2`) is used only to encode queries; it never generates text.

The app is intended for FAO staff and national census bureaux who need authoritative, citable answers from the WCA 2030 methodology document without network access in the field.

---

## 2. Build instructions

### Prerequisites

- Node.js ≥ 18 (for native `fetch`, `structuredClone`, WASM support)
- npm ≥ 9
- The WCA 2030 source PDF at `./source/WCA-2030.pdf`

> **Windows users:** run all commands in **Git Bash** or **PowerShell**.
> Do **not** use `cmd.exe` — the `npx tsx` calls require a POSIX-compatible shell or PowerShell for proper path handling.

### Step 1 — Generate the content index *(run once; takes 5–20 min)*

```bash
# Extract text from the PDF, chunk it, embed it, and build every data file
npm run build-index
```

This runs `scripts/chunk.ts` (PDF extraction + chunking) and then `scripts/embed.ts`
(downloads `Xenova/all-MiniLM-L6-v2` on first run and embeds ~414 chunks as sentence-aligned 200-token windows).
Outputs — all written to the canonical source locations under `public/`:
- `src/data/chunks-raw.json` — intermediate raw chunks (no embeddings; gitignored)
- `public/data/chunks.json` — chunk text and window offsets (no vectors)
- `public/data/embeddings.f32` and `qa-embeddings.f32` — 384-dimensional vectors as binary `Float32Array` files
- `public/data/qa.json`, `items.json`, `glossary.json`, `figures-tables.json`, `model-meta.json` — curated and lookup data, plus the index version hash
- `public/models/` — ONNX model weights + WASM runtime files

> The model download (~23 MB) requires internet access on the first run only.
> Subsequent runs use the local `.cache/` directory and are fully offline.

**No manual copy step is needed.** `public/data/` is the canonical source;
`npm run build` (Step 2) copies everything from `public/` into `docs/` automatically.

### Step 2 — Build the PWA

```bash
npm run build
```

Compiles TypeScript, bundles the app, and generates:
- `docs/` — the production bundle
- `docs/sw.js` — the Workbox service worker with a 25-entry pre-cache manifest (~38 MB total)

### Step 3 — Preview locally

```bash
npm run preview
# → open http://localhost:4173
```

On the first visit the service worker installs and pre-caches all 16 assets
(JS bundle, CSS, chunks.json, ONNX model, WASM runtime files, icons).
After that the app is fully offline-capable.

### Development server

```bash
npm run dev
# → http://localhost:5173  (no service worker; hot-module reload active)
```

### Running tests

```bash
npm test          # 278 unit, data, and regression tests (loads the real offline model)
npm run eval      # full-cascade evaluation → reports/eval-latest.md (the C3 method, see §3)
npm run a11y      # axe audit, tap targets, overflow (needs a build)
npm run browser-check  # deep link, PDF link, offline, WASM, external-host checks
```

---

## 3. Threshold tuning

All thresholds live in `src/engine/config.ts`, each with the measurement that justifies it. They are
chosen with `npm run eval`, which runs the real answer cascade (`src/engine/answer.ts`, the same code the
UI runs) over `tests/fixtures/` and writes `reports/eval-latest.md`.

| Threshold | Value | Meaning | localStorage override |
|---|---|---|---|
| `ENUM_CONFIDENCE_THRESHOLD` | **0.52** | Document search: minimum raw cosine of a chunk's best 200-token window. | `wca_enum_threshold` |
| `QA_THRESHOLD` | **0.80** | Curated Q&A: minimum question-to-question cosine. | `wca_qa_threshold` |
| `LEXICAL_SEMANTIC_FLOOR` | **0.38** | A keyword (BM25) answer also needs this semantic score, unless the query is only domain vocabulary. | — |
| `CONFIDENCE_THRESHOLD` | 0.42 | Lookup mode (not used by the main cascade). | `wca_threshold` |

**Method.** Thresholds are chosen on the *tuning* off-topic set (`off-topic.json`, 60 questions) and the
*gold* in-domain set (`gold.json`, 140 questions: 80 reworded curated questions, 40 new questions written
from the PDF, 20 short domain queries): zero false answers on the tuning set, then the highest gold
recall@5. The two held-out sets (`off-topic-heldout.json`, `off-topic-heldout2.json`, 36 questions each, 10
near-domain traps in each) are reported and never tuned against. The sweeps in `reports/eval-latest.md`
justify each value:

- **Semantic threshold 0.52** is the lowest value that refuses all 60 tuning questions (the highest-scoring
  one reaches 0.505). Recall@5 of the document tier alone is 87.9 % at 0.52 against 90.0 % at 0.30.
- **Q&A threshold 0.80:** at the former 0.60 a related but different curated row answered 27 of the 40 new
  questions with the wrong excerpt (recall@5 70 %); 0.80 gives the best gold recall@5 of the sweep.
- **Lexical floor 0.38** is the middle of the 0.34–0.42 plateau (0.30 lets one tuning question through).

**Results** (full cascade): gold recall@5 **94.3 %** (reworded 96.3 %, new 90.0 %, short 95.0 %), recall@1
83.6 %, top citation correct for 83.6 % of answers; tuning false answers **0/60**; held-out false answers
2/36 on each held-out set (5.6 %), near-domain traps 2/10 and 1/10. The remaining false answers are real
topic overlaps (the aquaculture passage on water salinity matches "Which ocean is the saltiest?"; the
pesticide definition matches "What pesticide kills aphids on beans?"), which an embedding threshold cannot
separate from in-domain questions. At 0.54 the same cascade reaches 90.7 % recall@5 with 1/36 held-out
leaks on both sets.

**Owner decision (OD.1): the semantic threshold stays at 0.52.** The remaining held-out leaks are near-domain
questions answered with verbatim, cited WCA text (nothing is fabricated); 0.54 would cost about 3.6 points of
recall@5 and would be chosen from held-out results. The 5.6 % held-out rate is an accepted, documented
limitation.

**Live tuning via DevTools** (no rebuild needed):

```js
localStorage.setItem('wca_enum_threshold', '0.56')   // stricter document search
localStorage.setItem('wca_qa_threshold', '0.85')     // stricter curated matches
localStorage.removeItem('wca_enum_threshold')        // restore the default
```

Reload the page; the new value applies to the next query.

**Re-tuning after a data change.** Run `npm run eval`, read the three sweep tables, move the value in
`config.ts`, and re-run. `tests/eval-regression.test.ts` fails if gold recall@5 falls more than 3 points below
`tests/fixtures/eval-baseline.json` or if a tuning off-topic question is answered; update the baseline
deliberately, with a changelog line.

### How the cascade works

1. **Exact lookups** — an item code (`0903`), a glossary term, or a figure/table reference.
2. **Curated Q&A** — the closest curated question, if its cosine reaches `QA_THRESHOLD` *and* the row mentions
   every named entity in the question.
3. **Document search** — chunks ranked by the raw cosine of their best 200-token window (at most two per
   section). A chunk answers when its score reaches `ENUM_CONFIDENCE_THRESHOLD` and it mentions every named
   entity in the question ("Nigeria", "Kenya": entity grounding, `src/engine/entities.ts`).
4. **Lexical fallback** — MiniSearch BM25 (≥ 8 points) for queries made of domain vocabulary (glossary terms,
   outline titles, item names, curated questions) or at least two corpus-characteristic terms, subject to
   `LEXICAL_SEMANTIC_FLOOR`.
5. **Not-found** — the guardrail card, with the sections searched.

---

## 3a. Reviewing curated excerpts

A curated Q&A row whose excerpt was repaired with low confidence is flagged `needs_owner_review = yes` in
`data/wca-qa.csv` and is **withheld**: the Q&A tier never serves it, and Learn mode shows a document-search
passage instead. To review them:

1. Open `scripts/dev/review-excerpts.html` (from the file system; choose `data/wca-qa.csv`,
   `reports/qa-excerpt-repairs.csv`, and `public/data/chunks.json` when asked, or serve the repository root
   and open the page, which then loads them itself). It needs no network and no build.
2. For each flagged question you see the original excerpt, the proposed excerpt, and the three best
   alternative source passages with their § and page. Choose **Accept proposed**, **Use alternative n**,
   **Edit** (you can only select verbatim text in source passages; typing is not possible), or **Reject**
   (the question stays out of the Q&A tier).
3. **Export decisions (CSV)** and save the file as `data/excerpt-decisions.csv`.
4. Run `npx tsx scripts/apply-excerpt-decisions.ts` (add `--dry-run` to preview). It refuses any decision
   whose passage is not verbatim or not on its stated page, sets `needs_owner_review = no` and
   `approved_by = owner` on the rest, then rebuilds `qa.json` and the index version and re-runs
   `validate-data`. Rejected rows get `approved_by = rejected` and stay withheld. Run `npm run build` and
   commit `data/wca-qa.csv`, `public/data/`, and `docs/`.

A multi-passage excerpt (a list answer, or a definition plus its qualification) is stored in the `excerpt`
column as passages separated by a line holding only ` [...] `, with one page per passage in `page_number`
(`"34; 36"`).

---

## 4. Updating guidelines

The source is `./source/WCA-2030.pdf` (FAO, 2026, CD9437EN, ISBN 978-92-5-140661-8). Its name is set
once, in `src/engine/source-pdf.ts`; every script, test, and the app read it from there.

When a new edition or re-typeset file is released:

1. Replace `./source/WCA-2030.pdf` with the new PDF (keep the name, or change `SOURCE_PDF_FILE`).
2. Re-map the outline's page numbers. Text usually moves between pages even when wording barely
   changes, so carry `data/source-outline.md` over from the previous file:
   ```bash
   git show HEAD~1:source/WCA-2030.pdf > /tmp/old.pdf   # the previous edition
   npx tsx scripts/dev/remap-outline.ts /tmp/old.pdf --write
   ```
   Then compare chapter, annex, and section start pages with the new PDF's table of contents, and
   the Annex 4 theme ranges with the `THEME n:` headings on the annex pages. `npx tsx scripts/outline.ts`
   and `npx vitest run tests/outline*.test.ts` check the result against the PDF. The items,
   glossary, and validation steps read their page ranges from the outline.
3. Re-run the pipeline, which rebuilds every data file and validates it:
   ```bash
   npm run build-index
   ```
4. If validation reports curated Q&A page or wording mismatches, repair them and keep a log separate
   from the owner-review history:
   ```bash
   npx tsx scripts/repair-qa.ts --exact --log=reports/qa-edition-update-<date>.csv
   npm run build-qa && npx tsx scripts/write-meta.ts && npx tsx scripts/validate-data.ts
   ```
   Read every non-`page-only` row in the log before accepting it. Then regenerate the gold set's
   expected pages (`npx tsx scripts/dev/build-gold.ts`), update any page-specific test assertions,
   and run `npm run eval` to compare retrieval quality with the previous edition.
5. The `version` in `model-meta.json` is stamped automatically by `npm run build-index`
   (last data step, `scripts/write-meta.ts`): `wca2030-` plus the first 12 hex characters of a
   SHA-256 over `chunks.json`, `qa.json`, `items.json`, and `glossary.json`. Do not edit it by hand.
   On startup the app compares it with `localStorage.wca_index_version`; when they differ it drops
   stale runtime caches of the data files, stores the new version, and shows the
   *"Guidelines index updated. Reload to apply."* banner.
6. Rebuild and redeploy:
   ```bash
   npm run build
   ```
   The Workbox revision hashes will change, triggering a service-worker update on
   existing installs. Users will see the *"Guidelines index updated. Reload to apply."*
   banner.

---

## 5. Distribution options

### First-load download size

On the very first visit the service worker pre-caches **~38 MB** of assets (25 files):

| Asset | Size |
|---|---|
| `model_quantized.onnx` (ONNX weights) | ~22 MB |
| `ort-wasm-simd.wasm` (the only WASM build precached) | ~9.5 MB |
| Data: `chunks.json`, two `.f32` embedding files, `qa.json`, items, glossary, figures | ~3.9 MB |
| Source PDF (page links work offline) | ~1.2 MB |
| JS bundle, CSS, HTML, fonts, icons | ~1.0 MB |

Subsequent loads use the cache entirely — no network traffic.

### Hosted PWA

Deploy the `docs/` directory to any static host:

```bash
# Netlify
netlify deploy --prod --dir docs

# Any static host supporting HTTPS
```

Users visit the URL, the service worker installs on first load, and the app can
then be installed to the home screen and used fully offline.

### GitHub Pages (Option A — commit `docs/` directly)

This repo is configured to deploy from the committed `docs/` folder on the
`main` branch. The Vite build uses `base: '/WCA_2030_Explorer/'` so all asset
URLs resolve correctly under the GitHub Pages subdirectory.

**One-time setup** (do this once in the GitHub web UI):

1. Go to **Settings → Pages** in the repository.
2. Under **Source**, choose **Deploy from a branch**.
3. Set the branch to **`main`** and the folder to **`/docs`**.
4. Click **Save**. GitHub Pages will publish from `docs/` on every push to `main`.

**Expected URL:** `https://bakodramane.github.io/WCA_2030_Explorer/`

**Re-deploying after a guidelines update:**

```bash
# 1. Regenerate the content index (run once after replacing the source PDF)
npm run build-index
# → writes public/data/chunks.json and public/models/ directly; no copy needed

# 2. Rebuild with the correct base path
npm run build
# → Vite copies public/ into docs/ automatically

# 3. Commit and push — GitHub Pages updates automatically
git add public/data/chunks.json docs/
git commit -m "chore: rebuild docs for updated guidelines"
git push
```

> **Note:** `docs/` is intentionally committed to this repo (not gitignored) and is
> the build output that GitHub Pages serves. `public/data/` and `public/models/` are
> the **canonical sources** — also committed so that `npm run build` is always
> self-contained and requires no manual file-copying.

### Air-gapped / offline-only use

For environments with no internet access at all:

```bash
# Serve locally (Node.js must be installed on the target machine)
npx serve docs
# → http://localhost:3000
```

Or zip `docs/` and serve it on any local web server (Nginx, Apache, Python's
`http.server`). A proper HTTPS origin is required for service-worker installation;
for internal networks a self-signed certificate is sufficient.

---

## 6. Privacy note

All search processing is **local to the device**:

- The PDF text and its embeddings never leave the machine that runs `npm run build-index`.
- At query time, the user's question is encoded in-browser by the ONNX model running
  in WebAssembly — the query is never sent to any server.
- No analytics, telemetry, cookies, or tracking of any kind are present.
- The only outbound network request ever made is the one-time model download from
  Hugging Face during `npm run embed` (controlled by `env.allowRemoteModels`).
  In production, `env.allowRemoteModels = false` is set in `src/engine/retrieval.ts`,
  making the runtime fully air-gapped.

**Query log download:** The **Share query log** button in the footer downloads the
user's query history (timestamps, query text, result tier, and relevance scores) as
a local CSV file to the user's own device. No data is transmitted to any external
server — the log is only ever downloaded locally and never sent anywhere automatically
or otherwise.

---

## Implementation notes

### MiniSearch stop-word filter and `MIN_LEXICAL_SCORE = 8`

During Phase 6 manual testing, "What is the capital of France?" triggered the lexical
fallback and returned results scored on the words *the*, *is*, *what* — common English
function words that appear in virtually every chunk. Two fixes were applied in
`src/engine/retrieval.ts`:

1. **Stop-word filter** — `processTerm` is configured to drop ~60 common English
   function words from both indexing and search. This reduced the off-topic BM25
   score from 79 → 6.9.
2. **Minimum BM25 score (`MIN_LEXICAL_SCORE = 8`)** — even after stop-word filtering,
   "capital" and "france" appeared in the WCA 2030 references section, scoring 6.9.
   A minimum score of 8 was chosen because off-topic queries scored ≤ 6.9 while
   genuine domain-term matches (e.g. "agricultural holding") score ≫ 8.

### `.onnx` added to Workbox `globPatterns`

The original `vite.config.ts` glob was `['**/*.{js,css,html,json,wasm}']`. The ONNX
model file (`model_quantized.onnx`, 22 MB) has the `.onnx` extension and was therefore
excluded from the Workbox pre-cache manifest, meaning the model would be fetched from
the network on every cold start instead of being served from the service-worker cache.
Adding `'**/*.onnx'` to the glob array ensures the model is pre-cached on install and
the app works fully offline from the first reload.
