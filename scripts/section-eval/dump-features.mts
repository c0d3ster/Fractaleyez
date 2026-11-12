// Writes the section features (packages/beatsense/src/sections/section-features.ts) of every song in a levels directory, for training the section model.
//
//   tsx dump-features.mts <levels dir> <out dir>
//
// One <id>.feat file per song: raw float32, slots x FEATURE_COUNT, one row per 250 ms (row k ends at (k + 1) * 0.25 s).
// The grid columns come from a TempoTracker and BeatGrid fed the same frames, in the order AudioFeed feeds them.
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { OnsetDetector } from '../../packages/beatsense/src/onset/onset-detector.ts'
import { ONSET_BANDS, DEFAULT_ENABLED_BANDS } from '../../packages/beatsense/src/onset/onset-bands.ts'
import { FEATURE_COUNT, FEATURE_NAMES, SectionFeatures } from '../../packages/beatsense/src/sections/section-features.ts'
import { TempoTracker } from '../../packages/beatsense/src/tempo/tempo-tracker.ts'
import { BeatGrid } from '../../packages/beatsense/src/grid/beat-grid.ts'

const [dir, out] = [process.argv[2]!, process.argv[3]!]
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'names.json'), JSON.stringify(FEATURE_NAMES))
const BANDS = ONSET_BANDS.length
const FRAME_MS = 1000 / 60
const started = Date.now()
const ids = readdirSync(dir).filter((name) => name.endsWith('.f32')).map((name) => name.slice(0, -4)).sort()
let done = 0
for (const id of ids) {
  if (existsSync(join(out, `${id}.feat`))) continue
  const buffer = readFileSync(join(dir, `${id}.f32`))
  const frames = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
  const detector = new OnsetDetector(BANDS)
  const features = new SectionFeatures()
  const tempo = new TempoTracker()
  const grid = new BeatGrid(tempo)
  const rows: number[] = []
  const levels = new Array<number>(BANDS).fill(0)
  const count = frames.length / BANDS
  for (let f = 0; f < count; f++) {
    for (let b = 0; b < BANDS; b++) levels[b] = frames[f * BANDS + b]!
    const t = f * FRAME_MS
    const onset = detector.update(levels, FRAME_MS, 0, { enabledBands: DEFAULT_ENABLED_BANDS, sensitivity: 2, ignoreMs: 250, decayMs: 300 })
    tempo.push(t, levels)
    grid.push(t, levels)
    const row = features.push(t, levels, onset.analysisBeat, grid.getState())
    if (row) rows.push(...row)
  }
  writeFileSync(join(out, `${id}.feat`), Buffer.from(Float32Array.from(rows).buffer))
  done++
}
console.error(`${done} songs, ${FEATURE_COUNT} features, ${((Date.now() - started) / 1000).toFixed(1)} s`)
