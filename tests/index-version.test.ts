import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compareVersion, purgeStaleDataCaches, runVersionHandshake, VERSION_KEY, type IndexMeta,
} from '../src/engine/index-version';
import { computeIndexVersion, INDEX_FILES } from '../scripts/lib/index-version';

/** Minimal in-memory CacheStorage: cache name → set of request URLs. */
function fakeCaches(initial: Record<string, string[]>): { storage: CacheStorage; state: Map<string, Set<string>> } {
  const state = new Map(Object.entries(initial).map(([name, urls]) => [name, new Set(urls)]));
  const open = async (name: string) => ({
    keys: async () => [...(state.get(name) ?? [])].map(url => ({ url })),
    delete: async (request: { url: string }) => state.get(name)!.delete(request.url),
  });
  const storage = {
    keys: async () => [...state.keys()],
    open,
    delete: async (name: string) => state.delete(name),
  } as unknown as CacheStorage;
  return { storage, state };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

const metaFetch = (version: string): typeof fetch =>
  (async () => ({ json: async () => ({ model: 'm', dim: 384, version } satisfies IndexMeta) })) as unknown as typeof fetch;

describe('B5 — version comparison', () => {
  it('distinguishes first run, unchanged, and changed', () => {
    expect(compareVersion(null, 'v2').status).toBe('first-run');
    expect(compareVersion('v2', 'v2').status).toBe('unchanged');
    expect(compareVersion('v1', 'v2')).toEqual({ status: 'changed', current: 'v2', previous: 'v1' });
  });
});

describe('B5 — purging stale data caches', () => {
  it('removes data JSON from runtime caches but never from the precache', async () => {
    const { storage, state } = fakeCaches({
      'workbox-precache-v2-https://x/': ['https://x/data/chunks.json', 'https://x/index.html'],
      'runtime-data': ['https://x/data/chunks.json?v=1', 'https://x/data/qa.json'],
      'runtime-pages': ['https://x/index.html', 'https://x/data/items.json'],
    });
    expect(await purgeStaleDataCaches(storage)).toBe(3);
    expect([...state.get('workbox-precache-v2-https://x/')!]).toHaveLength(2);
    expect(state.has('runtime-data')).toBe(false);
    expect([...state.get('runtime-pages')!]).toEqual(['https://x/index.html']);
  });
});

describe('B5 — startup handshake', () => {
  it('stores the version silently on first run', async () => {
    const storage = memoryStorage();
    const { storage: caches, state } = fakeCaches({ 'runtime-data': ['https://x/data/chunks.json'] });
    const check = await runVersionHandshake({ baseUrl: '/', fetchFn: metaFetch('v1'), storage, caches });
    expect(check?.status).toBe('first-run');
    expect(storage.data.get(VERSION_KEY)).toBe('v1');
    expect(state.has('runtime-data')).toBe(true);
  });

  it('does nothing when the version is unchanged', async () => {
    const storage = memoryStorage({ [VERSION_KEY]: 'v1' });
    expect((await runVersionHandshake({ baseUrl: '/', fetchFn: metaFetch('v1'), storage }))?.status).toBe('unchanged');
  });

  it('on a change: purges stale caches, stores the new version, and reports it', async () => {
    const storage = memoryStorage({ [VERSION_KEY]: 'v1' });
    const { storage: caches, state } = fakeCaches({ 'runtime-data': ['https://x/data/chunks.json'] });
    const check = await runVersionHandshake({ baseUrl: '/', fetchFn: metaFetch('v2'), storage, caches });
    expect(check).toEqual({ status: 'changed', current: 'v2', previous: 'v1' });
    expect(storage.data.get(VERSION_KEY)).toBe('v2');
    expect(state.has('runtime-data')).toBe(false);
  });

  it('leaves everything untouched when model-meta.json cannot be read', async () => {
    const storage = memoryStorage({ [VERSION_KEY]: 'v1' });
    const failing = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await runVersionHandshake({ baseUrl: '/', fetchFn: failing, storage })).toBeNull();
    expect(storage.data.get(VERSION_KEY)).toBe('v1');
  });
});

describe('B5 — build-time content hash', () => {
  function tempData(contents: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wca-version-'));
    for (const name of INDEX_FILES) fs.writeFileSync(path.join(dir, name), contents[name] ?? '[]');
    return dir;
  }

  it('is deterministic and changes when any index file changes', () => {
    const base = computeIndexVersion(tempData({}));
    expect(base).toMatch(/^wca2030-[0-9a-f]{12}$/);
    expect(computeIndexVersion(tempData({}))).toBe(base);
    for (const name of INDEX_FILES) {
      expect(computeIndexVersion(tempData({ [name]: '[1]' })), name).not.toBe(base);
    }
  });

  it('refuses to hash an incomplete data directory', () => {
    const dir = tempData({});
    fs.rmSync(path.join(dir, 'qa.json'));
    expect(() => computeIndexVersion(dir)).toThrow(/qa\.json/);
  });

  it('public/data/model-meta.json matches the committed data (run npm run write-meta if this fails)', () => {
    const dataDir = path.join(process.cwd(), 'public', 'data');
    const meta = JSON.parse(fs.readFileSync(path.join(dataDir, 'model-meta.json'), 'utf-8')) as IndexMeta;
    expect(meta.version).toBe(computeIndexVersion(dataDir));
    const src = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src', 'data', 'model-meta.json'), 'utf-8')) as IndexMeta;
    expect(src).toEqual(meta);
  });
});
