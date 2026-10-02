import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DescriptionBlock, ItemRow } from '../src/engine/types';

function load<T>(name: string): T {
  return JSON.parse(fs.readFileSync(
    path.join(process.cwd(), 'public', 'data', name),
    'utf-8',
  )) as T;
}

function flatten(blocks: DescriptionBlock[]): string {
  return blocks.flatMap(block => block.type === 'paragraph' ? [block.text] : block.items)
    .join(' ').replace(/\s+/g, ' ').trim();
}

describe('B3 — reproducible PDF-derived runtime data', () => {
  it('contains the complete item catalogue with internally consistent blocks', () => {
    const items = load<ItemRow[]>('items.json');
    expect(items).toHaveLength(123);
    expect(new Set(items.map(item => item.code)).size).toBe(123);
    expect(items.filter(item => item.category === 'essential')).toHaveLength(27);
    expect(items.filter(item => item.category === 'additional')).toHaveLength(96);
    for (const item of items) {
      expect(item.page).toBeGreaterThan(0);
      expect(item.theme).toMatch(/^Theme \d+:/);
      expect(flatten(item.descriptionBlocks), item.code).toBe(item.description);
    }
  });

  it('contains the complete alphabetised glossary', () => {
    const rows = load<Array<{ term: string; definition: string; reference: string }>>('glossary.json');
    expect(rows).toHaveLength(118);
    expect(rows.map(row => row.term)).toEqual(
      [...rows.map(row => row.term)].sort((a, b) => a.localeCompare(b, 'en')),
    );
    expect(rows.every(row => row.term.length > 0 && row.definition.length > 0)).toBe(true);
  });

  it('contains every extracted figure and table caption', () => {
    const rows = load<Array<{ ref: string; title: string; page: number; kind: string }>>('figures-tables.json');
    expect(rows).toHaveLength(16);
    expect(new Set(rows.map(row => `${row.kind}:${row.ref}`)).size).toBe(16);
    expect(rows.every(row => row.page > 0 && ['figure', 'table'].includes(row.kind))).toBe(true);
  });
});
