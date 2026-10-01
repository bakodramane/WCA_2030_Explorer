import { defineConfig } from 'vitest/config';

// Measurement scripts (not part of `npm test`): npm run probe
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/dev/*.eval.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
