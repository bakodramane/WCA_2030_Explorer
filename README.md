# WCA 2030 Adviser

An **offline-first Progressive Web App** that answers questions exclusively from the
*World Programme for the Census of Agriculture 2030* (WCA 2030) guidelines.
Every answer is verbatim extracted text from the guidelines, accompanied by a
precise section title and page number.

---

## 1. Purpose & constraints

The WCA 2030 Adviser is a retrieval tool — not a generative AI. It enforces the following hard constraints:

- **Answers are extracted text only.** The retrieved chunk is the answer; no paraphrasing or generation occurs.
- **No external API calls at runtime.** After the first load, the app works with zero internet access. All model inference runs in-browser via WebAssembly.
- **Guardrail is mandatory.** When no chunk exceeds the confidence threshold *and* keyword fallback also fails, the app returns: *"This question could not be answered from the WCA 2030 guidelines. Sections searched: [list]."*
- **Every answer cites** the source chunk's section title and page number.
- **No generative model at runtime.** The embedding model (`all-MiniLM-L6-v2`) is used only to encode queries; it never generates text.

The app is intended for FAO staff and national census bureaux who need authoritative, citable answers from the WCA 2030 methodology document without network access in the field.

---

## 2. Build instructions

### Prerequisites

- Node.js ≥ 18 (for native `fetch`, `structuredClone`, WASM support)
- npm ≥ 9
- The WCA 2030 source PDF at `./source/Census-2030_EN-DTP-9.pdf`

> **Windows users:** run all commands in **Git Bash** or **PowerShell**.
> Do **not** use `cmd.exe` — the `npx tsx` calls require a POSIX-compatible shell or PowerShell for proper path handling.

### Step 1 — Generate the content index *(run once; takes 5–20 min)*

```bash
# Extract text from the PDF, chunk it, and embed every chunk
npm run build-index
```

This runs `scripts/chunk.ts` (PDF extraction + chunking) and then `scripts/embed.ts`
(downloads `Xenova/all-MiniLM-L6-v2` on first run and embeds 876 chunks).
Outputs:
- `src/data/chunks-raw.json` — raw chunks without embeddings
- `src/data/chunks.json` — chunks with 384-dimensional embeddings (~10 MB)
- `public/models/` — ONNX model weights + WASM runtime files

> The model download (~23 MB) requires internet access on the first run only.
> Subsequent runs use the local `.cache/` directory and are fully offline.

Before running the PWA build, copy the content index to the public directory so
Vite serves it correctly:

```bash
# PowerShell
New-Item -ItemType Directory -Force -Path public\data | Out-Null
Copy-Item src\data\chunks.json public\data\chunks.json

# Git Bash
mkdir -p public/data && cp src/data/chunks.json public/data/chunks.json
```

### Step 2 — Build the PWA

```bash
npm run build
```

Compiles TypeScript, bundles the app, and generates:
- `dist/` — the production bundle
- `dist/sw.js` — the Workbox service worker with a 16-entry pre-cache manifest (~71 MB total)

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
npm test
# 20 tests across 3 files — chunking, retrieval, guardrail
```

---

## 3. Threshold tuning

The confidence threshold controls how selective the semantic search is before
falling back to keyword search or returning a not-found response.

**Default value:** `0.42`

**Live tuning via DevTools** (no rebuild needed):

```js
// Lower the threshold to surface more borderline results
localStorage.setItem('wca_threshold', '0.38')

// Raise it to be more selective
localStorage.setItem('wca_threshold', '0.60')

// Restore default
localStorage.removeItem('wca_threshold')
```

Then reload the page — the new threshold takes effect on the next query.

### How the cascade works

1. **Semantic search** — if the top cosine-similarity score (with 1.15× boost for
   high-priority chunks) meets the threshold, those results are returned.
2. **Lexical fallback** — if semantic fails, MiniSearch BM25 search runs.
   Only results scoring ≥ 8 BM25 points are accepted (prevents false positives
   from incidental word overlap on off-topic queries).
3. **Not-found response** — if both fail, the guardrail card is shown with a
   deduplicated list of sections searched.

> **Note:** raising the threshold for an on-topic query (e.g. `'0.99'` for
> "agricultural holding") will cause the semantic pass to fail but the lexical
> fallback will still answer it, since "agricultural" and "holding" score ≫ 8 in
> BM25. To force the not-found card, the query must also fail the keyword search —
> for example "What is the capital of France?" fails both at any threshold.

---

## 4. Updating guidelines

When a new edition of the WCA guidelines is released:

1. Replace `./source/Census-2030_EN-DTP-9.pdf` with the new PDF.
   Update every filename reference in `scripts/chunk.ts` if it differs.
2. Verify the high-priority page ranges in `scripts/chunk.ts` still match the new
   document's chapter layout, and update the `STATIC_HIGH_RANGES` array if needed.
3. Re-run the full pipeline:
   ```bash
   npm run build-index
   ```
4. Copy the regenerated `src/data/chunks.json` to `public/data/chunks.json`.
5. Bump the `version` field in `src/data/model-meta.json`:
   ```json
   { "model": "Xenova/all-MiniLM-L6-v2", "dim": 384, "version": "wca2030-v2" }
   ```
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

On the very first visit the service worker pre-caches **~71 MB** of assets:

| Asset | Size |
|---|---|
| `chunks.json` (content index) | ~10 MB |
| `model_quantized.onnx` (ONNX weights) | ~22 MB |
| WASM runtime (4 files) | ~36 MB |
| JS bundle, CSS, HTML, icons | ~3 MB |

Subsequent loads use the cache entirely — no network traffic.

### Hosted PWA

Deploy the `dist/` directory to any static host:

```bash
# Netlify
netlify deploy --prod --dir dist

# GitHub Pages (requires a custom domain for HTTPS, required for service workers)
gh-pages -d dist

# Any static host supporting HTTPS
```

Users visit the URL, the service worker installs on first load, and the app can
then be installed to the home screen and used fully offline.

### Air-gapped / offline-only use

For environments with no internet access at all:

```bash
# Serve locally (Node.js must be installed on the target machine)
npx serve dist
# → http://localhost:3000
```

Or zip `dist/` and serve it on any local web server (Nginx, Apache, Python's
`http.server`). A proper HTTPS origin is required for service-worker installation;
for internal networks a self-signed certificate is sufficient.

---

## 6. Privacy note

All processing is **local to the device**:

- The PDF text and its embeddings never leave the machine that runs `npm run build-index`.
- At query time, the user's question is encoded in-browser by the ONNX model running
  in WebAssembly — the query is never sent to any server.
- No analytics, telemetry, cookies, or tracking of any kind are present.
- The only outbound network request ever made is the one-time model download from
  Hugging Face during `npm run embed` (controlled by `env.allowRemoteModels`).
  In production, `env.allowRemoteModels = false` is set in `src/engine/retrieval.ts`,
  making the runtime fully air-gapped.

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
