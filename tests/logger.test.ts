import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logQuery, getLog, clearLog, toCSV } from '../src/engine/logger';
import type { QueryLogEntry } from '../src/engine/types';

// ── localStorage stub ─────────────────────────────────────────────────────────
// The logger reads and writes localStorage at call time (never at module init),
// so stubbing it globally before each test is sufficient.

let _store: Record<string, string>;

beforeEach(() => {
  _store = {};
  vi.stubGlobal('localStorage', {
    getItem:    (k: string) => _store[k] ?? null,
    setItem:    (k: string, v: string) => { _store[k] = v; },
    removeItem: (k: string) => { delete _store[k]; },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkEntry(overrides: Partial<QueryLogEntry> = {}): QueryLogEntry {
  return {
    timestamp: '2026-06-05T10:00:00.000Z',
    query:     'What is an agricultural holding?',
    tier:      'verified',
    score:     0.87,
    matched:   'What is an agricultural holding and how is it defined in the WCA 2030?',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('logger — logQuery / getLog', () => {
  it('stores an entry and retrieves it', () => {
    const entry = mkEntry();
    logQuery(entry);
    const log = getLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toEqual(entry);
  });

  it('appends entries in order', () => {
    logQuery(mkEntry({ query: 'first' }));
    logQuery(mkEntry({ query: 'second' }));
    const log = getLog();
    expect(log[0].query).toBe('first');
    expect(log[1].query).toBe('second');
  });

  it('persists entries across separate getLog() calls', () => {
    logQuery(mkEntry({ query: 'persisted' }));
    // Simulate a second call (same store, different invocation)
    expect(getLog()[0].query).toBe('persisted');
  });

  it('returns an empty array when nothing has been logged', () => {
    expect(getLog()).toEqual([]);
  });
});

describe('logger — cap at 500 entries', () => {
  it('holds exactly 500 entries when 500 are logged', () => {
    for (let i = 0; i < 500; i++) logQuery(mkEntry({ query: `q-${i}` }));
    expect(getLog()).toHaveLength(500);
  });

  it('drops the oldest entry when the 501st is added', () => {
    for (let i = 0; i < 501; i++) logQuery(mkEntry({ query: `q-${i}` }));
    const log = getLog();
    expect(log).toHaveLength(500);
    // q-0 is the oldest and must have been removed
    expect(log[0].query).toBe('q-1');
    // q-500 is the newest and must be at the end
    expect(log[499].query).toBe('q-500');
  });

  it('keeps exactly 500 entries when many more are added', () => {
    for (let i = 0; i < 600; i++) logQuery(mkEntry({ query: `q-${i}` }));
    expect(getLog()).toHaveLength(500);
    const log = getLog();
    expect(log[0].query).toBe('q-100');   // first 100 dropped
    expect(log[499].query).toBe('q-599'); // last logged is newest
  });
});

describe('logger — clearLog', () => {
  it('empties the log', () => {
    logQuery(mkEntry());
    clearLog();
    expect(getLog()).toHaveLength(0);
  });

  it('is idempotent on an already-empty log', () => {
    clearLog();
    clearLog();
    expect(getLog()).toHaveLength(0);
  });

  it('allows new entries to be added after clearing', () => {
    logQuery(mkEntry({ query: 'before-clear' }));
    clearLog();
    logQuery(mkEntry({ query: 'after-clear' }));
    const log = getLog();
    expect(log).toHaveLength(1);
    expect(log[0].query).toBe('after-clear');
  });
});

describe('toCSV', () => {
  it('produces the correct header row', () => {
    const csv   = toCSV([]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('"timestamp","query","tier","score","matched"');
  });

  it('produces a correct data row for a known entry', () => {
    const entry = mkEntry({
      timestamp: '2026-06-05T10:00:00.000Z',
      query:     'What is a census?',
      tier:      'verified',
      score:     0.87,
      matched:   'What is a census of agriculture?',
    });
    const csv   = toCSV([entry]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      '"2026-06-05T10:00:00.000Z","What is a census?","verified","0.87","What is a census of agriculture?"',
    );
  });

  it('escapes internal double-quotes by doubling them', () => {
    const entry = mkEntry({
      query:   'He asked "what is a holding?"',
      matched: 'The "official" definition',
    });
    const csv = toCSV([entry]);
    // Internal " must become "" in the CSV output
    expect(csv).toContain('"He asked ""what is a holding?"""');
    expect(csv).toContain('"The ""official"" definition"');
  });

  it('uses CRLF as the row separator', () => {
    const csv = toCSV([mkEntry(), mkEntry()]);
    // Split on CRLF must give exactly 3 parts: header + 2 data rows
    expect(csv.split('\r\n')).toHaveLength(3);
  });

  it('returns only the header row for an empty log', () => {
    const csv   = toCSV([]);
    const lines = csv.split('\r\n');
    // Header only — no trailing CRLF for zero-row files
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('timestamp');
  });

  it('correctly serialises all three tier values', () => {
    const entries: QueryLogEntry[] = [
      mkEntry({ tier: 'verified',  score: 0.9 }),
      mkEntry({ tier: 'document',  score: 0.5 }),
      mkEntry({ tier: 'not-found', score: 0   }),
    ];
    const csv   = toCSV(entries);
    const lines = csv.split('\r\n');
    expect(lines[1]).toContain('"verified"');
    expect(lines[2]).toContain('"document"');
    expect(lines[3]).toContain('"not-found"');
  });
});
