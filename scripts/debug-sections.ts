/**
 * Debug script: initialise RetrievalEngine from the pre-built chunks.json and
 * print the section-index summary produced by debugSectionIndex().
 *
 * Usage: npx tsx scripts/debug-sections.ts
 */

import fs   from 'node:fs';
import path from 'node:path';
import { RetrievalEngine } from '../src/engine/retrieval.js';
import type { Chunk }      from '../src/engine/types.js';

const chunksPath = path.join(process.cwd(), 'src', 'data', 'chunks.json');

if (!fs.existsSync(chunksPath)) {
  console.error(`chunks.json not found at ${chunksPath}. Run "npm run embed" first.`);
  process.exit(1);
}

const chunks: Chunk[] = JSON.parse(fs.readFileSync(chunksPath, 'utf-8'));

// Bypass init() — debugSectionIndex() only needs this.chunks to be populated.
const engine = new RetrievalEngine();
(engine as unknown as { chunks: Chunk[] }).chunks = chunks;

const top10 = engine.debugSectionIndex();

console.log('\n═══ Top 10 sections by chunk count ═══════════════════════════════');
console.table(
  top10.map(e => ({
    sectionId:    e.sectionId,
    chunkCount:   e.chunkCount,
    pages:        `${e.pageStart}–${e.pageEnd}`,
    span:         e.pageEnd - e.pageStart,
    sectionTitle: e.sectionTitle.slice(0, 55),
  })),
);

// Secondary view: sections with the largest page spans (artefact candidates)
const sectionMap = new Map<string, { count: number; pages: number[] }>();
for (const c of chunks) {
  if (!sectionMap.has(c.sectionTitle)) sectionMap.set(c.sectionTitle, { count: 0, pages: [] });
  const s = sectionMap.get(c.sectionTitle)!;
  s.count++;
  s.pages.push(c.pageRef);
}

const bySpan = [...sectionMap.entries()]
  .map(([title, { count, pages }]) => ({
    chunkCount:   count,
    pages:        `${Math.min(...pages)}–${Math.max(...pages)}`,
    span:         Math.max(...pages) - Math.min(...pages),
    sectionTitle: title.slice(0, 55),
  }))
  .sort((a, b) => b.span - a.span)
  .slice(0, 10);

console.log('\n═══ Top 10 sections by page span (artefact candidates) ════════════');
console.table(bySpan);

console.log(`\nTotal chunks: ${chunks.length}`);
console.log(`Total distinct sections: ${sectionMap.size}`);
