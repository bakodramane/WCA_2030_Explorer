import { execSync } from 'node:child_process';

const steps = [
  'scripts/outline.ts',
  'scripts/chunk.ts',
  'scripts/embed.ts',
  'scripts/build-items.ts',
  'scripts/build-glossary.ts',
  'scripts/build-figures.ts',
  'scripts/build-qa.ts',
  'scripts/validate-data.ts',
];

for (const step of steps) {
  execSync(`npx tsx ${step}`, { stdio: 'inherit' });
}
