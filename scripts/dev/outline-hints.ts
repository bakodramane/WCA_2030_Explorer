// B2.1 dev tool: derive `paragraphs:` hints for the bullet sections in data/source-outline.md
// from the PDF (heading position → first numbered paragraph), then rewrite the Markdown.
// Usage: npx tsx scripts/dev/outline-hints.ts [--write]
import fs from 'node:fs';
import path from 'node:path';
import { extractPdfLines } from '../lib/pdf-lines';
import { stripPageFurniture } from '../lib/strip-furniture';

const CHAPTERS = ['ch1', 'ch2', 'ch3', 'ch8', 'ch9', 'ch10'];
/** Headings that are not a single line (or are lower-case sub-headings) and were read by hand. */
const MANUAL_FIRST: Record<string, string> = {
  'ch8-data-collection-methods': '8.12',
  'ch8-community-level-items-geography-socioeconomic-conditions-infrastructure-and-services-development-programmes': '8.16',
  'ch9-cross-tabulations': '9.26',
  'ch9-community-level-data-tabulations': '9.34',
  'ch9-aquaculture-tabulations': '9.40',
};
const PARA = /^([1-9]\d*\.\d+)\s+/;
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const num = (p: string): number[] => p.split('.').map(Number);
const cmp = (a: string, b: string): number => num(a)[0] - num(b)[0] || num(a)[1] - num(b)[1];

interface Entry { id: string; title: string; printedStart: number; parentId: string }

async function main(): Promise<void> {
  const lines = stripPageFurniture(await extractPdfLines(path.join(process.cwd(), 'source', 'Census-2030_EN-DTP-9.pdf')));
  const outline = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src', 'data', 'outline.json'), 'utf-8')) as Array<Entry & { kind: string; printedEnd: number }>;
  const hints = new Map<string, string>();

  for (const ch of CHAPTERS) {
    const chapter = outline.find(e => e.id === ch)!;
    const body = lines.filter(l => l.printedPage >= chapter.printedStart && l.printedPage <= chapter.printedEnd);
    const chapterNo = String(chapter.id.replace('ch', ''));
    const universe = [...new Set(body.map(l => l.text.match(PARA)?.[1]).filter((p): p is string => !!p && p.split('.')[0] === chapterNo))].sort(cmp);
    const sections = outline.filter(e => e.parentId === ch && e.kind === 'section') as Entry[];

    let cursor = 0;
    const firsts: Array<string | null> = sections.map(s => {
      if (MANUAL_FIRST[s.id]) return MANUAL_FIRST[s.id];
      const target = norm(s.title);
      for (let i = cursor; i < body.length; i++) {
        if (body[i].printedPage < s.printedStart) continue;
        if (body[i].printedPage > s.printedStart + 1) break;
        let acc = '';
        for (let k = 0; k < 4 && i + k < body.length; k++) {
          acc += norm(body[i + k].text);
          if (acc === target) {
            cursor = i;
            return body.slice(i).map(l => l.text.match(PARA)?.[1]).find(p => p && p.split('.')[0] === chapterNo) ?? null;
          }
          if (!target.startsWith(acc)) break;
        }
      }
      console.warn(`  no heading found: ${s.id}`);
      return null;
    });

    sections.forEach((s, i) => {
      const first = firsts[i];
      if (!first) return;
      const nextFirst = firsts.slice(i + 1).find(f => f && cmp(f, first) > 0);
      const end = nextFirst ? universe[universe.indexOf(nextFirst) - 1] : universe[universe.length - 1];
      const empty = firsts.slice(i + 1).some(f => f === first) && !firsts.slice(i + 1).some(f => f && cmp(f, first) > 0 && false);
      if (nextFirst === undefined && firsts.slice(i + 1).some(f => f === first)) return;
      if (empty && firsts[i + 1] === first) return; // parent heading immediately followed by its child
      hints.set(s.id, `${first}–${end}`);
    });
  }

  const mdPath = path.join(process.cwd(), 'data', 'source-outline.md');
  let md = fs.readFileSync(mdPath, 'utf-8');
  let current = '';
  const out: string[] = [];
  for (const line of md.split('\n')) {
    const ch = line.match(/^### Chapter (\d+):/);
    if (ch) current = `ch${ch[1]}`;
    else if (/^## /.test(line)) current = '';
    const m = line.match(/^- (.+?) \((pp?\. \d+(?:–\d+)?)\)(?: paragraphs: \S+)?\s*$/);
    if (m && CHAPTERS.includes(current)) {
      const id = `${current}-${m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;
      const hint = hints.get(id);
      console.log(`${hint ? hint.padEnd(10) : '(none)'.padEnd(10)} ${id}`);
      out.push(hint ? `- ${m[1]} (${m[2]}) paragraphs: ${hint}` : `- ${m[1]} (${m[2]})`);
    } else out.push(line);
  }
  md = out.join('\n');
  if (process.argv.includes('--write')) { fs.writeFileSync(mdPath, md, 'utf-8'); console.log('Wrote', mdPath); }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
