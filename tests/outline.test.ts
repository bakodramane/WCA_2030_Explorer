// tests/outline.test.ts
// B1 acceptance: the machine-readable outline (src/data/outline.json, generated
// from data/source-outline.md by scripts/outline.ts) is ordered, does not
// overlap among siblings beyond a shared boundary page, and covers printed
// pages 1 to the last body page.
import { describe, it, expect } from 'vitest';
import { OUTLINE, type OutlineEntry } from '../src/engine/outline';

const byKind = (kind: OutlineEntry['kind']) => OUTLINE.filter(e => e.kind === kind);

function expectOrderedSiblings(label: string, siblings: OutlineEntry[]): void {
  for (let i = 1; i < siblings.length; i++) {
    const prev = siblings[i - 1];
    const cur = siblings[i];
    expect(
      cur.printedStart,
      `${label}: ${cur.id} starts before ${prev.id}`,
    ).toBeGreaterThanOrEqual(prev.printedStart);
    if (cur.printedStart <= prev.printedEnd) {
      // Overlap is only allowed as a single shared boundary page.
      expect(
        cur.printedStart,
        `${label}: ${cur.id} overlaps ${prev.id} by more than one page`,
      ).toBe(prev.printedEnd);
    }
  }
}

describe('B1 — machine-readable outline', () => {
  it('has 10 chapters, 11 annexes, 24 themes (12 in Chapter 7, 12 in Annex 4), a glossary, and references', () => {
    expect(byKind('chapter')).toHaveLength(10);
    expect(byKind('annex')).toHaveLength(11);
    expect(byKind('theme')).toHaveLength(24);
    expect(byKind('theme').filter(t => t.parentId === 'ch7')).toHaveLength(12);
    expect(byKind('theme').filter(t => t.parentId === 'annex4')).toHaveLength(12);
    expect(byKind('glossary')).toHaveLength(1);
    expect(byKind('references')).toHaveLength(1);
    expect(byKind('section').length).toBeGreaterThan(50);
  });

  it('top-level ranges are ordered and cover printed pages 1 to the last body page', () => {
    const top = [...OUTLINE].filter(e =>
      ['chapter', 'annex', 'glossary', 'references'].includes(e.kind),
    ).sort((a, b) => a.printedStart - b.printedStart);

    expect(top[0].printedStart).toBe(1);
    expectOrderedSiblings('top-level', top);

    const lastPage = top[top.length - 1].printedEnd;
    for (let p = 1; p <= lastPage; p++) {
      expect(
        top.some(e => p >= e.printedStart && p <= e.printedEnd),
        `printed page ${p} not covered`,
      ).toBe(true);
    }
  });

  it('sections and themes are ordered within their parent chapter', () => {
    const byParent = new Map<string, OutlineEntry[]>();
    for (const e of OUTLINE) {
      if (e.kind !== 'section' && e.kind !== 'theme') continue;
      if (!byParent.has(e.parentId!)) byParent.set(e.parentId!, []);
      byParent.get(e.parentId!)!.push(e);
    }
    expect(byParent.size).toBeGreaterThan(0);
    for (const [parent, siblings] of byParent) {
      expectOrderedSiblings(`sections of ${parent}`, siblings);
    }
  });

  it('every section/theme parent references an existing chapter or annex', () => {
    const chapterIds = new Set([...byKind('chapter'), ...byKind('annex')].map(c => c.id));
    for (const e of OUTLINE) {
      if (e.kind === 'section' || e.kind === 'theme') {
        expect(chapterIds.has(e.parentId!), `${e.id} parent`).toBe(true);
      }
    }
  });

  it('spot-checks: Chapter 7 themes and numbered Chapter 4 sections', () => {
    const theme2 = OUTLINE.find(e => e.id === 'ch7-theme2')!;
    expect(theme2.title.startsWith('Theme 2: Land')).toBe(true);
    expect(theme2.printedStart).toBe(79);
    expect(theme2.printedEnd).toBe(86);

    const s42 = OUTLINE.find(e => e.id === 'ch4-4.2')!;
    expect(s42.title).toBe('Statistical Unit');
    expect(s42.number).toBe(4.2);
    expect(s42.printedStart).toBe(37);
  });
});
