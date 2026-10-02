// What a modal needs from the app (E3): the engine, the search box, and two actions.
import type { RetrievalEngine } from '../engine/retrieval';
import type { ItemRow } from '../engine/types';
import type { SearchBar } from './SearchBar';

export interface UiContext {
  engine: RetrievalEngine;
  searchBar: SearchBar;
  runSearch(query: string): Promise<void>;
  showItemCard(item: ItemRow): void;
}
