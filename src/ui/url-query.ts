// D3: the ?q= deep link (E3: split out of App.ts).

/** D3: the `q` query parameter of the current URL, trimmed, or null. */
export function readQueryParam(): string | null {
  try { return new URLSearchParams(location.search).get('q')?.trim() || null; } catch { return null; }
}

/** D3: keep the URL in step with the last search (history.replaceState: no new history entries). */
export function writeQueryParam(query: string): void {
  try {
    const url = new URL(location.href);
    url.searchParams.set('q', query.trim());
    history.replaceState(null, '', url);
  } catch { /* history unavailable */ }
}
