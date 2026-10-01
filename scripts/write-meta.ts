// B5: stamp model-meta.json with a content hash of chunks, qa, items, and glossary.
// Runs after every data builder in `npm run build-index` (and at the end of embed.ts).
import { writeModelMeta } from './lib/index-version';

const meta = writeModelMeta(process.cwd());
console.log(`model-meta.json: version=${meta.version} → src/data/ and public/data/`);
