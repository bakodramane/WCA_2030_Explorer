import { pipeline, env } from '@xenova/transformers';
import fs from 'node:fs';
import path from 'node:path';
import { readCsvRecords } from './lib/csv';
import { QA_EMBEDDINGS, readEmbeddings, writeEmbeddings } from './lib/embedding-files';

// ── Paths ─────────────────────────────────────────────────────────────────────

const ROOT      = process.cwd();
const CSV_IN    = path.join(ROOT, 'data', 'wca-qa.csv');
const JSON_OUT  = path.join(ROOT, 'public', 'data', 'qa.json');
const VEC_OUT   = path.join(ROOT, 'public', 'data', QA_EMBEDDINGS);

// ── Constants ─────────────────────────────────────────────────────────────────

const MODEL      = 'Xenova/all-MiniLM-L6-v2';
const DIM        = 384;
const BATCH_SIZE = 32;

// Offline only (§0.3): the model ships in public/models/ and is never downloaded.
(env as any).localModelPath    = path.join(ROOT, 'public', 'models');
(env as any).allowRemoteModels = false;
(env as any).allowLocalModels  = true;

// ── Types ─────────────────────────────────────────────────────────────────────

interface QaRowOut {
  question: string; answer: string; page_number: string; section_title: string;
  excerpt: string; tags: string; confidence: string;
  /** OD.2: false while the excerpt awaits owner approval; the Q&A tier never serves such a row. */
  servable: boolean;
}

/** Embeddings already built, keyed by question text (the only embedded field): binary file, or legacy inline vectors. */
function existingEmbeddings(): Map<string, number[]> {
  if (!fs.existsSync(JSON_OUT)) return new Map();
  const rows = JSON.parse(fs.readFileSync(JSON_OUT, 'utf-8')) as Array<{ question: string; embedding?: number[] }>;
  const binary = readEmbeddings(VEC_OUT);
  const known = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const vec = r.embedding?.length === DIM ? r.embedding : binary && binary.length === rows.length ? Array.from(binary[i]) : null;
    if (vec) known.set(r.question, vec);
  });
  return known;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { records } = readCsvRecords(CSV_IN);
  console.log(`Parsed ${records.length} Q&A rows from ${path.relative(ROOT, CSV_IN)}`);

  const known = existingEmbeddings();
  const embeddings = new Map<string, number[]>();
  for (const r of records) {
    const prev = known.get(r.question);
    if (prev) embeddings.set(r.question, prev);
  }
  const missing = [...new Set(records.map(r => r.question))].filter(q => !embeddings.has(q));
  console.log(`Reusing ${embeddings.size} embeddings by question text; embedding ${missing.length} new or changed.`);

  if (missing.length > 0) {
    console.log(`Loading model: ${MODEL}  (offline from public/models)`);
    const extractor = await pipeline('feature-extraction', MODEL);
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE);
      const out = await (extractor as any)(batch, { pooling: 'mean', normalize: true });
      const data: Float32Array = out.data;
      batch.forEach((q, j) => embeddings.set(q, Array.from(data.slice(j * DIM, (j + 1) * DIM))));
      console.log(`  [${Math.min(i + BATCH_SIZE, missing.length)}/${missing.length}]`);
    }
  }

  const vectors = records.map(r => embeddings.get(r.question)!);
  if (vectors.some(v => v.length !== DIM)) throw new Error(`Expected dim=${DIM} for every row`);
  const out: QaRowOut[] = records.map(r => ({
    question: r.question, answer: r.answer, page_number: r.page_number,
    section_title: r.section_title, excerpt: r.excerpt, tags: r.tags, confidence: r.confidence,
    servable: !(r.needs_owner_review === 'yes' && r.approved_by !== 'owner'),
  }));

  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, JSON.stringify(out), 'utf-8');
  writeEmbeddings(VEC_OUT, vectors);
  const kb = (fs.statSync(JSON_OUT).size / 1024).toFixed(0);
  console.log(`Servable rows: ${out.filter(r => r.servable).length} of ${out.length} (the rest await owner approval)`);
  console.log(`Rows written: ${out.length}  →  ${path.relative(ROOT, JSON_OUT)}  (${kb} KB)`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
