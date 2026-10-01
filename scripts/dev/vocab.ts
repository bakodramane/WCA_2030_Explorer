import path from 'node:path';
import { loadEngine, readFixture, type GoldItem } from '../lib/eval-engine';
const engine = await loadEngine(path.join(process.cwd(), 'public', 'data'));
const gold = readFixture<{ items: GoldItem[] }>('gold.json').items.filter(g => g.kind === 'short');
for (const g of gold) console.log(engine.isVocabularyQuery(g.question) ? 'vocab  ' : 'NOT    ', g.question);
const sets = ['off-topic.json', 'off-topic-heldout.json', 'off-topic-heldout2.json'].flatMap(f => readFixture<{ questions: string[] }>(f).questions);
console.log('off-topic questions that count as vocabulary queries:', sets.filter(q => engine.isVocabularyQuery(q)));
