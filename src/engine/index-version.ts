// B5: index version handshake. The build stamps public/data/model-meta.json with a
// content hash of chunks, qa, items, and glossary. On startup the app compares it with
// the version it last saw (localStorage) and, when they differ, drops stale runtime
// caches of the data files and tells the user to reload.

export const VERSION_KEY = 'wca_index_version';

export interface IndexMeta {
  model: string;
  dim: number;
  version: string;
}

export interface VersionCheck {
  status: 'first-run' | 'unchanged' | 'changed';
  current: string;
  previous: string | null;
}

export function compareVersion(stored: string | null, current: string): VersionCheck {
  if (stored === null) return { status: 'first-run', current, previous: null };
  return { status: stored === current ? 'unchanged' : 'changed', current, previous: stored };
}

/** Matches the data files that make up the index, with or without a query string. */
const DATA_URL = /\/data\/[^/?#]+\.json(?:[?#].*)?$/;

/**
 * Delete cached data-file responses from runtime caches. The Workbox precache is left
 * alone: it holds the copy the offline app is about to load, and removing it would
 * leave an offline user without an index.
 */
export async function purgeStaleDataCaches(cacheStorage: CacheStorage): Promise<number> {
  let removed = 0;
  for (const name of await cacheStorage.keys()) {
    if (name.includes('precache')) continue;
    const cache = await cacheStorage.open(name);
    for (const request of await cache.keys()) {
      if (DATA_URL.test(request.url) && await cache.delete(request)) removed++;
    }
    if ((await cache.keys()).length === 0) await cacheStorage.delete(name);
  }
  return removed;
}

export interface HandshakeDeps {
  baseUrl: string;
  fetchFn: typeof fetch;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  caches?: CacheStorage;
}

/**
 * Fetch model-meta.json and reconcile it with the stored version. Returns null when
 * the meta cannot be read (e.g. an old deployment without it), leaving state untouched.
 */
export async function runVersionHandshake(deps: HandshakeDeps): Promise<VersionCheck | null> {
  let meta: IndexMeta;
  try {
    const response = await deps.fetchFn(`${deps.baseUrl}data/model-meta.json`, { cache: 'no-store' });
    meta = (await response.json()) as IndexMeta;
    if (typeof meta.version !== 'string' || meta.version === '') return null;
  } catch {
    return null;
  }

  let stored: string | null = null;
  try { stored = deps.storage.getItem(VERSION_KEY); } catch { /* storage blocked */ }
  const check = compareVersion(stored, meta.version);

  if (check.status === 'changed' && deps.caches) {
    try { await purgeStaleDataCaches(deps.caches); } catch { /* best effort */ }
  }
  if (check.status !== 'unchanged') {
    try { deps.storage.setItem(VERSION_KEY, meta.version); } catch { /* storage blocked */ }
  }
  return check;
}
