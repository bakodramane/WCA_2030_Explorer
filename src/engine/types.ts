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
