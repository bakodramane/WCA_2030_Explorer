# Evaluation — windowed chunks, chunk-raw ranking, tuned thresholds

Data: `public/data` — 414 chunks, 1016 embedded vectors. Ranking: `chunk-raw`. Thresholds: semantic 0.52, Q&A 0.8, lexical floor 0.38. Recall = the expected paragraph, or a chunk within one printed page of the expected page (short queries: the answer chunk contains the term; an item card or curated row counts when its verbatim text holds the answer).

## Full cascade (as the UI runs it)

|  | n | answered | recall@1 | recall@5 | top citation correct (of answered) |
| --- | --- | --- | --- | --- | --- |
| all gold | 140 | 100.0 % | 83.6 % | 94.3 % | 83.6 % |
| reworded | 80 | 100.0 % | 85.0 % | 96.3 % | 85.0 % |
| new | 40 | 100.0 % | 75.0 % | 90.0 % | 75.0 % |
| short | 20 | 100.0 % | 95.0 % | 95.0 % | 95.0 % |

Tier that answered: verified 69, document 61, item 4, glossary 6.

## Document tier only (lookups and Q&A bypassed): ranking comparison (C0.1)

| ranking | n | answered | recall@1 | recall@5 | top citation correct (of answered) |
| --- | --- | --- | --- | --- | --- |
| `section` | 140 | 95.0 % | 54.3 % | 76.4 % | 57.1 % |
| `chunk` | 140 | 99.3 % | 55.7 % | 82.1 % | 56.1 % |
| `chunk-raw` | 140 | 99.3 % | 63.6 % | 87.9 % | 64.0 % |

## False answers (full cascade; lower is better)

| set | questions | answered (false) | rate |
| --- | --- | --- | --- |
| tuning (off-topic.json) | 60 | 0 | 0.0 % |
| held-out (off-topic-heldout.json) | 36 | 2 | 5.6 % |
| near-domain traps (subset of held-out) | 10 | 2 | 20.0 % |
| held-out 2 (off-topic-heldout2.json; written before the entity gate was measured) | 36 | 2 | 5.6 % |
| near-domain traps (subset of held-out 2) | 10 | 1 | 10.0 % |

Leaked (held-out): “Which country has the largest cattle herd?”; “Which fertilizer should I use on my tomato plants?”

Leaked (held-out 2): “Which ocean is the saltiest?”; “What pesticide kills aphids on beans?”

## Semantic threshold sweep (document tier, raw best-window cosine)

| value | gold answered | gold recall@5 | tuning false | held-out false | near-domain false |
| --- | --- | --- | --- | --- | --- |
| 0.30 | 100.0 % | 90.0 % | 8/60 | 7/36 | 4/10 |
| 0.32 | 100.0 % | 90.0 % | 7/60 | 6/36 | 4/10 |
| 0.34 | 100.0 % | 90.0 % | 5/60 | 6/36 | 4/10 |
| 0.36 | 100.0 % | 90.0 % | 2/60 | 5/36 | 3/10 |
| 0.38 | 100.0 % | 90.0 % | 1/60 | 5/36 | 3/10 |
| 0.40 | 100.0 % | 90.0 % | 1/60 | 4/36 | 3/10 |
| 0.42 | 100.0 % | 90.0 % | 1/60 | 3/36 | 3/10 |
| 0.44 | 99.3 % | 89.3 % | 1/60 | 3/36 | 3/10 |
| 0.46 | 99.3 % | 89.3 % | 1/60 | 3/36 | 3/10 |
| 0.48 | 99.3 % | 88.6 % | 1/60 | 2/36 | 2/10 |
| 0.50 | 99.3 % | 88.6 % | 1/60 | 2/36 | 2/10 |
| 0.52 | 99.3 % | 87.9 % | 0/60 | 2/36 | 2/10 |
| 0.54 | 97.1 % | 84.3 % | 0/60 | 1/36 | 1/10 |
| 0.56 | 96.4 % | 82.9 % | 0/60 | 1/36 | 1/10 |
| 0.58 | 96.4 % | 81.4 % | 0/60 | 1/36 | 1/10 |
| 0.60 | 95.7 % | 82.1 % | 0/60 | 0/36 | 0/10 |

Lowest threshold with 0 tuning false answers: **0.52** → 99.3 % / 87.9 % / 0/60 / 2/36 / 2/10 (answered / recall@5 / tuning / held-out / near-domain).

## Lexical-fallback floor sweep (semantic threshold at its current value)

| value | gold answered | gold recall@5 | tuning false | held-out false | near-domain false |
| --- | --- | --- | --- | --- | --- |
| 0.30 | 99.3 % | 87.9 % | 1/60 | 2/36 | 2/10 |
| 0.34 | 99.3 % | 87.9 % | 0/60 | 2/36 | 2/10 |
| 0.38 | 99.3 % | 87.9 % | 0/60 | 2/36 | 2/10 |
| 0.42 | 99.3 % | 87.9 % | 0/60 | 2/36 | 2/10 |
| 0.46 | 98.6 % | 87.1 % | 0/60 | 2/36 | 2/10 |
| lexical off | 97.9 % | 86.4 % | 0/60 | 2/36 | 2/10 |

A pure domain-vocabulary query (C0.2) keeps floor 0 in every row.

## Curated-Q&A threshold sweep (full cascade)

| Q&A threshold | gold recall@5 | reworded | new | short | answered by Q&A | tuning false | held-out false | near-domain false |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.50 | 84.3 % | 96.3 % | 60.0 % | 85.0 % | 128 | 0/60 | 2/36 | 2/10 |
| 0.55 | 85.0 % | 96.3 % | 62.5 % | 85.0 % | 125 | 0/60 | 2/36 | 2/10 |
| 0.60 | 87.9 % | 97.5 % | 70.0 % | 85.0 % | 115 | 0/60 | 2/36 | 2/10 |
| 0.65 | 87.9 % | 96.3 % | 70.0 % | 90.0 % | 107 | 0/60 | 2/36 | 2/10 |
| 0.70 | 93.6 % | 98.8 % | 85.0 % | 90.0 % | 95 | 0/60 | 2/36 | 2/10 |
| 0.75 | 93.6 % | 97.5 % | 87.5 % | 90.0 % | 82 | 0/60 | 2/36 | 2/10 |
| 0.80 | 94.3 % | 96.3 % | 90.0 % | 95.0 % | 69 | 0/60 | 2/36 | 2/10 |
| 0.85 | 93.6 % | 95.0 % | 90.0 % | 95.0 % | 52 | 0/60 | 2/36 | 2/10 |
| 0.90 | 92.9 % | 93.8 % | 90.0 % | 95.0 % | 38 | 0/60 | 2/36 | 2/10 |
| 0.95 | 90.7 % | 90.0 % | 90.0 % | 95.0 % | 20 | 0/60 | 2/36 | 2/10 |
