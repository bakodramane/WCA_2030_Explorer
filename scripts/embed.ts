import { pipeline, env } from '@xenova/transformers';
import fs from 'node:fs';
import path from 'node:path';

// ── Paths ─────────────────────────────────────────────────────────────────────

const ROOT         = process.cwd();
const CACHE_DIR    = path.join(ROOT, '.cache');
const PUBLIC_MODELS= path.join(ROOT, 'public', 'models');
const CHUNKS_RAW   = path.join(ROOT, 'src', 'data', 'chunks-raw.json');
const CHUNKS_OUT   = path.join(ROOT, 'src', 'data', 'chunks.json');
const META_OUT     = path.join(ROOT, 'src', 'data', 'model-meta.json');

// ── Constants ─────────────────────────────────────────────────────────────────

const MODEL      = 'Xenova/all-MiniLM-L6-v2';
const DIM        = 384;
const BATCH_SIZE = 32;

// ── Configure transformers ────────────────────────────────────────────────────
// cacheDir must be set before calling pipeline() so downloaded files land here.

(env as any).cacheDir = CACHE_DIR;
(env as any).allowRemoteModels = true;
(env as any).allowLocalModels  = true;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Chunk {
  id: string;
  sectionTitle: string;
  pageRef: number;
  text: string;
  priority: 'high' | 'normal';
  embedding?: number[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function copyDirRecursive(src: string, dst: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dst, entry);
    fs.statSync(s).isDirectory() ? copyDirRecursive(s, d) : fs.copyFileSync(s, d);
  }
}

function listFilesRecursive(dir: string, prefix = ''): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap(e => {
    const full = path.join(dir, e);
    const rel  = path.join(prefix, e);
    return fs.statSync(full).isDirectory() ? listFilesRecursive(full, rel) : [rel];
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // ── Load chunks (with resumability) ────────────────────────────────────────
  const rawChunks: Chunk[] = JSON.parse(fs.readFileSync(CHUNKS_RAW, 'utf-8'));

  let chunks: Chunk[] = rawChunks;
  if (fs.existsSync(CHUNKS_OUT)) {
    const existing: Chunk[] = JSON.parse(fs.readFileSync(CHUNKS_OUT, 'utf-8'));
    const byId = new Map(existing.map(c => [c.id, c]));
    chunks = rawChunks.map(c => byId.get(c.id) ?? c);
    const already = chunks.filter(c => c.embedding).length;
    console.log(`Resuming: ${already}/${chunks.length} already embedded`);
  } else {
    console.log(`Fresh run: ${chunks.length} chunks to embed`);
  }

  const toEmbed = chunks.filter(c => !c.embedding);

  // ── Embed ───────────────────────────────────────────────────────────────────
  if (toEmbed.length === 0) {
    console.log('All chunks already embedded — skipping model load.');
  } else {
    console.log(`\nLoading model: ${MODEL}  (downloading to ${CACHE_DIR} if needed)`);
    const extractor = await pipeline('feature-extraction', MODEL);
    console.log('Model ready.\n');

    let done     = 0;
    const total  = toEmbed.length;
    const tStart = Date.now();

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch  = toEmbed.slice(i, i + BATCH_SIZE);
      const texts  = batch.map(c => c.text);

      const output = await (extractor as any)(texts, { pooling: 'mean', normalize: true });
      // output.data is a Float32Array of length batch.length × DIM
      const data: Float32Array = output.data;

      for (let j = 0; j < batch.length; j++) {
        batch[j].embedding = Array.from(data.slice(j * DIM, (j + 1) * DIM));
      }

      const prevDone = done;
      done += batch.length;

      // Log every time we cross a 50-chunk milestone (or on the final batch)
      if (Math.floor(done / 50) > Math.floor(prevDone / 50) || done >= total) {
        const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
        const pct     = ((done / total) * 100).toFixed(1);
        console.log(`  [${String(done).padStart(4)}/${total}]  ${pct.padStart(5)}%   ${elapsed}s elapsed`);

        // Checkpoint: persist progress so a crash can be resumed
        fs.writeFileSync(CHUNKS_OUT, JSON.stringify(chunks, null, 2), 'utf-8');
      }
    }

    console.log('\nEmbedding complete.');
  }

  // ── Final write ─────────────────────────────────────────────────────────────
  fs.writeFileSync(CHUNKS_OUT, JSON.stringify(chunks, null, 2), 'utf-8');
  const mb = (fs.statSync(CHUNKS_OUT).size / 1024 / 1024).toFixed(1);

  // ── Verify ──────────────────────────────────────────────────────────────────
  const sample = chunks.find(c => c.embedding);
  if (!sample?.embedding || sample.embedding.length !== DIM) {
    throw new Error(`Unexpected embedding dim: ${sample?.embedding?.length} (expected ${DIM})`);
  }

  // ── model-meta.json ─────────────────────────────────────────────────────────
  const meta = { model: MODEL, dim: DIM, version: 'wca2030-v1' };
  fs.writeFileSync(META_OUT, JSON.stringify(meta, null, 2), 'utf-8');

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n─── Embedding Summary ─────────────────────────────────────');
  console.log(`Total chunks embedded : ${chunks.length}`);
  console.log(`chunks.json size      : ${mb} MB  →  ${CHUNKS_OUT}`);
  console.log(`Embedding dimension   : ${sample.embedding.length}`);
  console.log(`model-meta.json       : version=${meta.version}  ✓`);
  console.log('───────────────────────────────────────────────────────────\n');

  // ── Copy model files to public/models/ ──────────────────────────────────────
  // 1. Model weights + tokenizer (from .cache/)
  console.log('Copying model cache → public/models/ ...');
  fs.mkdirSync(PUBLIC_MODELS, { recursive: true });
  copyDirRecursive(CACHE_DIR, PUBLIC_MODELS);

  // 2. ONNX Runtime WASM binaries (from @xenova/transformers/dist/)
  //    These are required for in-browser inference.
  const txDist = path.join(ROOT, 'node_modules', '@xenova', 'transformers', 'dist');
  if (fs.existsSync(txDist)) {
    const wasmFiles = fs.readdirSync(txDist).filter(f => f.endsWith('.wasm'));
    for (const wf of wasmFiles) {
      fs.copyFileSync(path.join(txDist, wf), path.join(PUBLIC_MODELS, wf));
    }
    console.log(`Copied ${wasmFiles.length} ONNX Runtime WASM files from @xenova/transformers/dist`);
  }

  // ── List public/models/ ─────────────────────────────────────────────────────
  const files = listFilesRecursive(PUBLIC_MODELS);
  console.log(`\npublic/models/  (${files.length} files):`);
  files.forEach(f => console.log(`  ${f}`));
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
