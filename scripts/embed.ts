import { env } from '@xenova/transformers';
import fs from 'node:fs';
import path from 'node:path';
import { DIM, embedChunkWindows } from './lib/embed-windows';
import { CHUNK_EMBEDDINGS, joinChunkEmbeddings, readEmbeddings, splitChunkEmbeddings, writeEmbeddings } from './lib/embedding-files';
import { writeModelMeta } from './lib/index-version';
import { WINDOW_SCHEME } from './lib/windows';

// ── Paths ─────────────────────────────────────────────────────────────────────

const ROOT         = process.cwd();
const CACHE_DIR    = path.join(ROOT, '.cache');
const PUBLIC_MODELS= path.join(ROOT, 'public', 'models');
const PUBLIC_DATA  = path.join(ROOT, 'public', 'data');
// WCA_CHUNKS_RAW / WCA_CHUNKS_OUT embed an experimental variant (scripts/eval.ts) and leave the shipped files alone.
const VARIANT      = !!process.env.WCA_CHUNKS_OUT;
const CHUNKS_RAW   = process.env.WCA_CHUNKS_RAW ?? path.join(ROOT, 'src', 'data', 'chunks-raw.json');
const CHUNKS_OUT   = process.env.WCA_CHUNKS_OUT ?? path.join(PUBLIC_DATA, 'chunks.json');

// ── Configure transformers ──────────────────────────────────────────────────────
// Offline-first (§0.3 of the improvement brief): the model ships in
// public/models/ — load it from there and never touch the network.

(env as any).localModelPath     = path.join(ROOT, 'public', 'models');
(env as any).allowRemoteModels  = false;
(env as any).allowLocalModels   = true;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Chunk {
  id: string;
  sectionId: string;
  sectionTitle: string;
  chapterLabel: string;
  paragraphs: string[];
  pdfPage: number;
  printedPage: number;
  printedPageEnd: number;
  text: string;
  priority: 'high' | 'normal';
  /** C0.4: each chunk is embedded as windows of at most 200 tokens. */
  windowScheme?: string;
  windows?: Array<{ start: number; end: number; embedding: number[] }>;
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
  const rawChunks: Chunk[] = JSON.parse(fs.readFileSync(CHUNKS_RAW, 'utf-8'));
  // Previous index: compact chunks.json plus the binary vectors (E1); legacy inline vectors still resume.
  const embeddingsOut = path.join(path.dirname(CHUNKS_OUT), CHUNK_EMBEDDINGS);
  let previous: Chunk[] = fs.existsSync(CHUNKS_OUT) ? JSON.parse(fs.readFileSync(CHUNKS_OUT, 'utf-8')) : [];
  const previousRows = readEmbeddings(embeddingsOut);
  if (previousRows && previous.length && previous.every(c => !c.windows?.some(w => w.embedding))) previous = joinChunkEmbeddings(previous, previousRows);
  const write = (chunks: Chunk[]): void => {
    // Unfinished chunks are left out of checkpoints so a resumed run recomputes them.
    const { chunks: stripped, rows } = splitChunkEmbeddings(chunks.filter(c => c.windows));
    fs.writeFileSync(CHUNKS_OUT, JSON.stringify(stripped), 'utf-8');
    writeEmbeddings(embeddingsOut, rows);
  };

  // Resume by TEXT and window scheme, not by id: ids shift whenever the chunker changes,
  // but verbatim texts are stable, so existing vectors stay valid for unchanged text.
  console.log(`Chunks: ${rawChunks.length}; previous index: ${previous.length}; window scheme ${WINDOW_SCHEME}`);
  const { chunks, reused, embedded, windows } = await embedChunkWindows(rawChunks, previous, write);

  fs.mkdirSync(path.dirname(CHUNKS_OUT), { recursive: true });
  write(chunks);
  const mb = (fs.statSync(CHUNKS_OUT).size / 1024 / 1024).toFixed(1);

  const sample = chunks[0].windows?.[0];
  if (!sample || sample.embedding.length !== DIM) {
    throw new Error(`Unexpected embedding dim: ${sample?.embedding.length} (expected ${DIM})`);
  }
  const embBytes = fs.statSync(embeddingsOut).size;
  const windowCount = chunks.reduce((sum, c) => sum + (c.windows?.length ?? 0), 0);

  // ── model-meta.json (B5: version = content hash of the index files) ──────────
  // qa/items/glossary may be rebuilt afterwards; scripts/write-meta.ts (the last
  // build-index step) re-stamps it.
  if (VARIANT) { console.log(`Variant written to ${CHUNKS_OUT}`); return; }
  let meta: { version: string };
  try { meta = writeModelMeta(ROOT); } catch (error) {
    // Q&A, items, or glossary data may not exist yet on a first build; scripts/write-meta.ts stamps it last.
    meta = { version: `(pending: ${(error as Error).message.split(':')[0]})` };
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n─── Embedding Summary ─────────────────────────────────────');
  console.log(`Total chunks          : ${chunks.length} (${reused} reused, ${embedded} embedded now: ${windows} windows)`);
  console.log(`Windows per chunk     : ${(windowCount / chunks.length).toFixed(2)} on average, ${windowCount} in total`);
  console.log(`chunks.json size      : ${mb} MB  →  ${CHUNKS_OUT}`);
  console.log(`${CHUNK_EMBEDDINGS} size : ${(embBytes / 1024 / 1024).toFixed(2)} MB`);
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
