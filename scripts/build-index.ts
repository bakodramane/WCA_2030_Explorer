import { execSync } from 'node:child_process';

execSync('npx tsx scripts/chunk.ts', { stdio: 'inherit' });
execSync('npx tsx scripts/embed.ts', { stdio: 'inherit' });
