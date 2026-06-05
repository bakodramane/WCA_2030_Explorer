import { pipeline, env } from '@xenova/transformers';
import fs from 'node:fs';
import path from 'node:path';

(env as any).cacheDir = path.join(process.cwd(), '.cache');
(env as any).allowRemoteModels = false;

function dot(a: number[], b: number[]): number {
  let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s;
}

async function main() {
  const qa = JSON.parse(fs.readFileSync('public/data/qa.json', 'utf-8'));
  const extractor = await (pipeline as any)('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

  const queries = [
    'What are the agricultural census modalities?',
    'census modality',
    'What is an agricultural holding?',
    'What is the capital of France?',
  ];

  for (const q of queries) {
    const out  = await (extractor as any)(q, { pooling: 'mean', normalize: true });
    const qVec: number[] = Array.from(out.data);
    let bestScore = -Infinity, bestIdx = -1;
    for (let i = 0; i < qa.length; i++) {
      const s = dot(qVec, qa[i].embedding);
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    }
    const fires = bestScore >= 0.60 ? 'YES ✓' : `NO  (need ${(0.60 - bestScore).toFixed(3)} more)`;
    console.log(`\nQuery: "${q}"`);
    console.log(`  Best match [${bestIdx}]: ${qa[bestIdx].question.slice(0, 65)}`);
    console.log(`  Score: ${bestScore.toFixed(4)}  →  Tier-1 at 0.60? ${fires}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
