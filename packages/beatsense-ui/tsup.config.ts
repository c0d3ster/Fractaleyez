import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  // The HUDs' stylesheets go into the bundle and are added to the page when it is imported, so the package keeps its one entry (no CSS file to import on its own).
  injectStyle: true,
})
