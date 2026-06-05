export interface Chunk {
  id: string;
  sectionTitle: string;
  pageRef: number;
  text: string;
  priority: 'high' | 'normal';
  embedding: number[];
}

export interface RankedResult {
  chunk: Chunk;
  score: number;
  matchType: 'semantic' | 'lexical';
}

export interface SectionResult {
  sectionTitle: string;
  pageStart: number;
  pageEnd: number;
  score: number;
  topChunks: RankedResult[];
}

export interface SectionDebugEntry {
  sectionId: string;
  sectionTitle: string;
  chunkCount: number;
  pageStart: number;
  pageEnd: number;
}

// ── Query log ─────────────────────────────────────────────────────────────────

export interface QueryLogEntry {
  timestamp: string;  // ISO 8601, e.g. "2026-06-03T14:22:11Z"
  query:     string;
  tier:      'verified' | 'document' | 'not-found';
  score:     number;  // best score from whichever tier answered (0 if not-found)
  matched:   string;  // Tier-1: matched question text; Tier-2: section title; Tier-3: ""
}

// ── Q&A curated layer ─────────────────────────────────────────────────────────

export interface QaRow {
  question:      string;
  answer:        string;
  page_number:   string;   // stored as string (comes from CSV)
  section_title: string;
  excerpt:       string;
  tags:          string;
  confidence:    string;
  embedding:     number[];
}

export interface QaResult {
  row:   QaRow;
  score: number;
}
