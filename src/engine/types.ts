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
