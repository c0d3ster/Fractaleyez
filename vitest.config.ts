import { defineConfig } from 'vitest/config'

// Workspace packages (packages/*) resolve to their TS source under this condition, as in webpack and tsc. Tests in the node environment
// resolve through the ssr conditions, and Vite replaces its defaults with the ones given, so they are listed again after it.
const SOURCE_CONDITION = '@fractaleyez/source'

export default defineConfig({
  ssr: {
    resolve: {
      conditions: [SOURCE_CONDITION, 'module', 'node', 'development|production'],
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'api/**/*.test.ts'],
  },
})
