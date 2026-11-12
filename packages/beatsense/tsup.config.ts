import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
  },
  // The worklet processor and the Web Worker body are loaded by URL, so each is one self-contained file.
  {
    entry: { worklet: 'src/worklet/processor.ts', worker: 'src/host/worker.ts' },
    format: ['esm'],
    sourcemap: true,
    noExternal: [/.*/],
    splitting: false,
  },
])
