import { defineConfig } from 'vitest/config'

// Own config so vitest does not pick up the Fractaleyez root config when run from the monorepo. beatsense resolves to its TS source under
// this condition, as in tsc; tests in the node environment resolve through the ssr conditions, and Vite replaces its defaults with the ones
// given, so they are listed again after it.
const SOURCE_CONDITION = '@fractaleyez/source'

export default defineConfig({
  ssr: {
    resolve: {
      conditions: [SOURCE_CONDITION, 'module', 'node', 'development|production'],
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
})
