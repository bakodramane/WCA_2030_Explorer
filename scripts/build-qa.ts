import { pipeline, env } from '@xenova/transformers';
import fs from 'node:fs';
import path from 'node:path';

// ── Paths ─────────────────────────────────────────────────────────────────────

const ROOT      = process.cwd();
const CACHE_DIR = path.join(ROOT, '.cache');
const CSV_IN    = path.join(ROOT, 'data', 'wca-qa.csv');
const JSON_OUT  = path.join(ROOT, 'public', 'data', 'qa.json');

// ── Constants ─────────────────────────────────────────────────────────────────

const MODEL      = 'Xenova/all-MiniLM-L6-v2';
const DIM        = 384;
const BATCH_SIZE = 32;

// ── Configure transformers (same pattern as embed.ts) ─────────────────────────

(env as any).cacheDir           = CACHE_DIR;
(env as any).allowRemoteModels  = true;
(env as any).allowLocalModels   = true;

// ── Types ─────────────────────────────────────────────────────────────────────

interface QaRowRaw {
  question:     string;
  answer:       string;
  page_number:  string;
  section_title:string;
  excerpt:      string;
  tags:         string;
  confidence:   string;
}

interface QaRowOut extends QaRowRaw {
  embedding: number[];
}

// ── Minimal CSV parser ────────────────────────────────────────────────────────
// All fields in wca-qa.csv are wrapped in double-quotes (csv.QUOTE_ALL).
// Handles embedded commas and escaped double-quotes ("").

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let field = '';
      i++;                          // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++;                      // skip closing quote
          break;
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if (line[i] === ',') i++;    // skip field separator
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}

function parseCSV(content: string): QaRowRaw[] {
  const rawLines = content.split(/\r?\n/);
  const lines    = rawLines.filter(l => l.trim().length > 0);
  if (lines.length < 2) throw new Error('CSV has no data rows');

  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ''])) as unknown as QaRowRaw;
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 1. Read and parse CSV
  if (!fs.existsSync(CSV_IN)) {
    throw new Error(`CSV not found: ${CSV_IN}\nRun: build the CSV first.`);
  }
  const rows: QaRowRaw[] = parseCSV(fs.readFileSync(CSV_IN, 'utf-8'));
  console.log(`Parsed ${rows.length} Q&A rows from ${path.relative(ROOT, CSV_IN)}`);

  // 2. Load embedding model (uses same .cache as embed.ts — no double download)
  console.log(`\nLoading model: ${MODEL}  (from ${CACHE_DIR})`);
  const extractor = await pipeline('feature-extraction', MODEL);
  console.log('Model ready.\n');

  // 3. Embed each question in batches
  const questions = rows.map(r => r.question);
  const embeddings: number[][] = new Array(questions.length);

  const total  = questions.length;
  const tStart = Date.now();

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = questions.slice(i, i + BATCH_SIZE);
    const out   = await (extractor as any)(batch, { pooling: 'mean', normalize: true });
    const data: Float32Array = out.data;

    for (let j = 0; j < batch.length; j++) {
      embeddings[i + j] = Array.from(data.slice(j * DIM, (j + 1) * DIM));
    }

    const done = Math.min(i + BATCH_SIZE, total);
    const pct  = ((done / total) * 100).toFixed(1);
    const sec  = ((Date.now() - tStart) / 1000).toFixed(1);
    console.log(`  [${String(done).padStart(3)}/${total}]  ${pct.padStart(5)}%   ${sec}s`);
  }

  // 4. Validate embedding dimension
  if (embeddings[0].length !== DIM) {
    throw new Error(`Expected dim=${DIM}, got ${embeddings[0].length}`);
  }

  // 5. Build output objects and write JSON
  const out: QaRowOut[] = rows.map((row, i) => ({ ...row, embedding: embeddings[i] }));

  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, JSON.stringify(out), 'utf-8');

  const kb = (fs.statSync(JSON_OUT).size / 1024).toFixed(0);
  console.log(`\n─── Q&A Embedding Summary ─────────────────────────────`);
  console.log(`Rows embedded   : ${out.length}`);
  console.log(`Embedding dim   : ${DIM}`);
  console.log(`Output          : ${path.relative(ROOT, JSON_OUT)}  (${kb} KB)`);
  console.log(`───────────────────────────────────────────────────────\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
