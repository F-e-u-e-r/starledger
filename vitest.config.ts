import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Resolve workspace packages to their TypeScript source so tests run without a
// build step. Mirrors the `paths` mapping in tsconfig.base.json.
const root = import.meta.dirname;

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@starred/schema': resolve(root, 'packages/schema/src/index.ts'),
      '@starred/github-client': resolve(root, 'packages/github-client/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/tests/**/*.test.ts', 'apps/**/src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
