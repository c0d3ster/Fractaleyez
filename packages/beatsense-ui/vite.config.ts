import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defaultClientConditions, defineConfig } from 'vite'

// The lab page (lab/): a standalone page with the HUDs on a live microphone, for working on beatsense. It is a dev tool, never part of the
// package build (tsup builds src/index.ts) or the published files. `pnpm lab` serves it, `pnpm lab:build` builds it into lab/dist.
// beatsense and beatsense-ui resolve to their TS source under this condition, as in the Fractaleyez app, so edits show up on save.
const SOURCE_CONDITION = '@fractaleyez/source'

export default defineConfig({
  root: 'lab',
  plugins: [react()],
  resolve: {
    conditions: [SOURCE_CONDITION, ...defaultClientConditions],
  },
  // The capture worklet is imported with `?worker&url`, so it is bundled on its own; as an ES module, which is how audioWorklet.addModule loads it.
  worker: {
    format: 'es',
  },
  // Off the Fractaleyez app's ports (3000 and 8080), so both can run at once.
  server: {
    port: 4000,
  },
  preview: {
    port: 4000,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Two pages: the lab (live HUDs and recording) and the review page for an exported session.
    rollupOptions: {
      input: {
        lab: fileURLToPath(new URL('./lab/index.html', import.meta.url)),
        review: fileURLToPath(new URL('./lab/review.html', import.meta.url)),
      },
    },
  },
})
