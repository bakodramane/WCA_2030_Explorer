import fs from 'node:fs';
import path from 'node:path';
import type { DescriptionBlock, ItemRow } from '../src/engine/types';
import OUTLINE_JSON from '../src/data/outline.json';
import { extractPdfLines, type PdfLine } from './lib/pdf-lines';
import { stripPageFurniture } from './lib/strip-furniture';

type Category = ItemRow['category'];
interface Header { code: string; name: string; index: number; page: number; category: Category; theme: string }
const HEADER = /^((?:0[1-9]|1[0-2])\d{2})\s+([A-Z].*)$/;
const THEME = /^THEME\s+(\d+)\s*:/i;
const REFERENCE = /(?:Essential item\.\s*)?Reference period(?: for the five items above)?:\s*(.*)/i;
const PARAGRAPH = /^(?:\d+\.\d+\.\d+\s+|\d+\.\s+)/;
const BULLET = /^[•]\s*/;
const SHARED_DESCRIPTION_ANCHOR = new Map<string, string>([
  ...['0509', '0510', '0511', '0512', '0513'].map(code => [code, '0513'] as const),
  ...['0701', '0702', '0703', '0704'].map(code => [code, '0704'] as const),
  ...['0801', '0802'].map(code => [code, '0802'] as const),
]);
function themeLabels(): Map<number, string> {
  const entries = OUTLINE_JSON.filter(entry => entry.kind === 'theme' && entry.parentId === 'ch7');
  return new Map(entries.map(entry => {
    const short = entry.title.replace(/^Theme \d+:\s*/, '').replace(/\s*\(.*/, '');
    return [entry.number, `Theme ${entry.number}: ${short.charAt(0)}${short.slice(1).toLowerCase()}`];
  }));
}
function normaliseName(name: string, code: string, category: Category): string {
  let value = name.replace(/\s+/g, ' ').trim().replace(/’/g, "'");
  const stripEssential = new Set(['0413', '0501', '0601', '0604', '0901', '0902', '0903', '0905']);
  if (category === 'additional' || stripEssential.has(code)) value = value.replace(/\s+\(for .+$/i, '');
  const overrides: Record<string, string> = {
    '0115': 'Sex of manager other than the holder',
    '0116': 'Age of manager other than the holder',
    '0207': 'Sex of household member managing the parcel',
    '0210': 'Terms of rental (for rented parcels)',
    '0303': 'Area of land actually irrigated according to land use type: fully controlled and partially controlled irrigation',
    '0404': 'Area of temporary crops harvested according to end use (for each selected crop type)',
    '0405': 'Production of temporary crops harvested (for each selected crop type)',
    '0410': 'Area of productive permanent crops in compact plantations according to end use (for each selected permanent crop type)',
    '0411': 'Production of permanent crops (for each selected permanent crop type)',
    '0805': 'Educational attainment for each household member excluding holder and spouse',
    '1201': 'Engagement of household members in fishing activities',
  };
  if (code === '0903') value = value.replace('holding: by', 'holding by');
  return overrides[code] ?? value;
}
function findReference(lines: PdfLine[], start: number, limit: number): number {
  for (let index = start + 1; index < Math.min(limit, start + 24); index++) {
    if (REFERENCE.test(lines[index].text)) return index;
  }
  return -1;
}
function collectHeaders(lines: PdfLine[], category: Category): Header[] {
  const [firstPage, lastPage] = category === 'essential' ? [74, 99] : [134, 172];
  const labels = themeLabels();
  const headers: Header[] = [];
  const seen = new Set<string>();
  let theme = '';
  let themeNumber = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.printedPage < firstPage || line.printedPage > lastPage) continue;
    const themeMatch = line.text.match(THEME);
    if (themeMatch) {
      themeNumber = Number(themeMatch[1]);
      theme = labels.get(themeNumber) ?? theme;
    }
    const match = line.text.match(HEADER);
    if (!match || seen.has(match[1])) continue;
    if (Number(match[1].slice(0, 2)) !== themeNumber) continue;
    if (!SHARED_DESCRIPTION_ANCHOR.has(match[1]) && findReference(lines, index, lines.length) < 0) continue;

    let name = match[2];
    for (let cursor = index + 1; name.split('(').length > name.split(')').length; cursor++) {
      const text = lines[cursor].text;
      if (HEADER.test(text) || REFERENCE.test(text) || BULLET.test(text) || PARAGRAPH.test(text) || THEME.test(text)) break;
      name += ` ${text}`;
    }
    seen.add(match[1]);
    headers.push({ code: match[1], name: normaliseName(name, match[1], category), index, page: line.printedPage, category, theme });
  }
  return headers;
}

function descriptionBlocks(lines: PdfLine[]): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  for (const line of lines) {
    const text = line.text.trim();
    if (PARAGRAPH.test(text)) {
      blocks.push({ type: 'paragraph', text });
    } else if (BULLET.test(text)) {
      const item = text.replace(BULLET, '').trim();
      const last = blocks[blocks.length - 1];
      if (last?.type === 'bullets') last.items.push(item);
      else blocks.push({ type: 'bullets', items: [item] });
    } else {
      const last = blocks[blocks.length - 1];
      if (last?.type === 'paragraph') last.text += ` ${text}`;
      else if (last?.type === 'bullets' && last.items.length > 0) {
        last.items[last.items.length - 1] += ` ${text}`;
      }
    }
  }
  return blocks;
}

function flatDescription(blocks: DescriptionBlock[]): string {
  return blocks.flatMap(block => block.type === 'paragraph' ? [block.text] : block.items)
    .join(' ').replace(/\s+/g, ' ').trim();
}

function referencePeriod(lines: PdfLine[], refIndex: number, code: string): string {
  const first = lines[refIndex].text.match(REFERENCE)?.[1] ?? '';
  const continuation: string[] = [];
  for (let index = refIndex + 1; index < lines.length; index++) {
    const text = lines[index].text;
    if (HEADER.test(text) || REFERENCE.test(text) || BULLET.test(text) || PARAGRAPH.test(text) || THEME.test(text)) break;
    continuation.push(text);
  }
  const raw = [first, ...continuation].join(' ').replace(/\s+/g, ' ').trim();
  if (/For cattle, buffaloes and other large animals/i.test(raw)) {
    return 'large animals: normally census reference year; smaller animals: often six months; poultry: often one month';
  }
  if (code === '0308') {
    return 'normally census reference year; a longer period (such as three years) may be used where unusual weather would distort the reference year';
  }
  const overrides: Record<string, string> = {
    'According to the ‘’de jure’’ concept, the data on household size relate to persons who, at the day of the census, are usually resident in the household.':
      'census reference day (de jure: persons usually resident in the household at the day of the census)',
  };
  return (overrides[raw] ?? raw)
    .replace(/^Census reference day$/, 'census reference day')
    .replace(/^the census reference year$/, 'census reference year')
    .replace(/\.$/, '');
}

function nextBoundary(lines: PdfLine[], headers: Header[], position: number): number {
  const nextHeader = headers[position + 1]?.index ?? lines.length;
  for (let index = headers[position].index + 1; index < lines.length; index++) {
    if (THEME.test(lines[index].text) || /^(?:CHAPTER|ANNEX)\s+\d+\b/i.test(lines[index].text)) return index;
    if (index >= nextHeader) return nextHeader;
  }
  return nextHeader;
}

function nextItemBoundary(lines: PdfLine[], start: number, fallback: number): number {
  for (let index = start; index < fallback; index++) {
    if (THEME.test(lines[index].text) || /^(?:CHAPTER|ANNEX)\s+\d+\b/i.test(lines[index].text)) return index;
    if (HEADER.test(lines[index].text) && findReference(lines, index, Math.min(fallback, index + 24)) >= 0) return index;
  }
  return fallback;
}

function buildRows(lines: PdfLine[], headers: Header[]): ItemRow[] {
  return headers.map(header => {
    const anchorCode = SHARED_DESCRIPTION_ANCHOR.get(header.code) ?? header.code;
    const anchorPosition = headers.findIndex(item => item.code === anchorCode);
    const groupStart = headers[anchorPosition].index;
    const refIndex = findReference(lines, groupStart, lines.length);
    if (refIndex < 0) throw new Error(`Reference period not found for Item ${header.code}`);
    const fallback = nextBoundary(lines, headers, anchorPosition);
    const end = nextItemBoundary(lines, refIndex + 1, fallback);
    let descStart = refIndex + 1;
    while (descStart < end && !PARAGRAPH.test(lines[descStart].text)) descStart++;
    const blocks = descStart < end
      ? descriptionBlocks(lines.slice(descStart, end))
      : descriptionBlocks(lines.slice(header.index + 1, refIndex).filter(line => BULLET.test(line.text)));
    return {
      code: header.code,
      name: header.name,
      description: flatDescription(blocks),
      referencePeriod: referencePeriod(lines, refIndex, header.code),
      theme: header.theme,
      page: descStart < end ? lines[descStart].printedPage : header.page,
      category: header.category,
      descriptionBlocks: blocks,
    };
  });
}

export async function extractItems(pdfPath: string): Promise<ItemRow[]> {
  const lines = stripPageFurniture(await extractPdfLines(pdfPath));
  const essential = collectHeaders(lines, 'essential');
  const additional = collectHeaders(lines, 'additional');
  return [...buildRows(lines, essential), ...buildRows(lines, additional)];
}

async function main(): Promise<void> {
  const pdfPath = path.join(process.cwd(), 'source', 'Census-2030_EN-DTP-9.pdf');
  const outPath = path.join(process.cwd(), 'public', 'data', 'items.json');
  const rows = await extractItems(pdfPath);
  fs.writeFileSync(outPath, `${JSON.stringify(rows, null, 2)}\n`, 'utf-8');
  console.log(`Extracted ${rows.length} items → ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => { console.error('Fatal:', error); process.exitCode = 1; });
}
