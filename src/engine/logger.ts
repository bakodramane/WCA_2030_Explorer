import type { QueryLogEntry } from './types';

// ── Storage key and cap ───────────────────────────────────────────────────────

const STORAGE_KEY = 'wca_query_log';
const MAX_ENTRIES = 500;

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Append a query log entry, capped at MAX_ENTRIES.
 * When the cap is exceeded the oldest entries are dropped first.
 */
export function logQuery(entry: QueryLogEntry): void {
  const log = getLog();
  log.push(entry);
  if (log.length > MAX_ENTRIES) {
    log.splice(0, log.length - MAX_ENTRIES);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    // localStorage full or unavailable (e.g. private-browsing quota) — silently ignore
  }
}

/** Return the full log array (empty array if storage is absent or unparseable). */
export function getLog(): QueryLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueryLogEntry[];
  } catch {
    return [];
  }
}

/** Empty the log. */
export function clearLog(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

// ── CSV export ────────────────────────────────────────────────────────────────

/**
 * Serialise the log to a RFC-4180-compatible CSV string.
 *
 * Rules applied:
 *   • Every field is wrapped in double quotes.
 *   • Internal double quotes are escaped by doubling them ("").
 *   • Rows are separated by CRLF (\r\n) as required by RFC 4180.
 *   • First row is the column header.
 *
 * The returned string does NOT include a BOM; callers add one if needed.
 */
export function toCSV(log: QueryLogEntry[]): string {
  const esc = (s: string) => '"' + String(s).replace(/"/g, '""') + '"';
  const COLUMNS: Array<keyof QueryLogEntry> = ['timestamp', 'query', 'tier', 'score', 'matched'];
  const header = COLUMNS.map(esc).join(',');
  const rows   = log.map(e =>
    COLUMNS.map(col => esc(String(e[col]))).join(',')
  );
  return [header, ...rows].join('\r\n');
}
