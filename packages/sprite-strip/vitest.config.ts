import { defineConfig } from 'vitest/config'

// Own config so vitest does not pick up the Fractaleyez root config when run from the monorepo.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
