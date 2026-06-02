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
