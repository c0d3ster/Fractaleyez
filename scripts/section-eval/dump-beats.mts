// Beats per 250 ms slot under several onset band selections, for testing which beats the section model should count (exp_beats.py).
//
//   tsx dump-beats.mts <levels dir> <out dir>
//
// One <id>.beats file per song: raw float32, slots x columns, on the same slot clock as dump-features.mts (row k is the slot the
// k-th feature row closes). Columns, in `columns.json`: each band's own onsets (its rising edges, no dead time, whatever is enabled),
// then the merged beat (Ignore Time 250 ms, Threshold 2) for each selection in SELECTIONS, as the app's OnsetDetector fires it.
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { OnsetDetector } from '../../packages/beatsense/src/onset-detector.ts'
import { ONSET_BANDS } from '../../packages/beatsense/src/onset-bands.ts'
import { SectionFeatures } from '../../packages/beatsense/src/section-features.ts'

const SELECTIONS = ['10010', '11111', '10000', '01000', '00100', '00010', '00001', '11010', '10011', '11110', '01110']

const [dir, out] = [process.argv[2]!, process.argv[3]!]
mkdirSync(out, { recursive: true })
const BANDS = ONSET_BANDS.length
const columns = [...ONSET_BANDS.map(({ label }) => `own_${label}`), ...SELECTIONS.map((s) => `beat_${s}`)]
writeFileSync(join(out, 'columns.json'), JSON.stringify(columns))
const FRAME_MS = 1000 / 60
const started = Date.now()
const ids = readdirSync(dir).filter((name) => name.endsWith('.f32')).map((name) => name.slice(0, -4)).sort()
let done = 0
for (const id of ids) {
  if (existsSync(join(out, `${id}.beats`))) continue
  const buffer = readFileSync(join(dir, `${id}.f32`))
  const frames = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
  const detectors = SELECTIONS.map(() => new OnsetDetector(BANDS))
  const enabled = SELECTIONS.map((s) => [...s].map((c) => c === '1'))
  // Only for its slot clock: the slots close on the same frames as in dump-features.mts.
  const clock = new SectionFeatures()
  const counts = new Float64Array(columns.length)
  const rows: number[] = []
  const levels = new Array<number>(BANDS).fill(0)
  const count = frames.length / BANDS
  for (let f = 0; f < count; f++) {
    for (let b = 0; b < BANDS; b++) levels[b] = frames[f * BANDS + b]!
    detectors.forEach((detector, d) => {
      const onset = detector.update(levels, FRAME_MS, 0, { enabledBands: enabled[d]!, sensitivity: 2, ignoreMs: 250, decayMs: 300 })
      if (d === 0) onset.bands.forEach(({ rising }, b) => { if (rising) counts[b]!++ })
      if (onset.beatBand !== null) counts[BANDS + d]!++
    })
    if (clock.push(f * FRAME_MS, levels, false)) {
      rows.push(...counts)
      counts.fill(0)
    }
  }
  writeFileSync(join(out, `${id}.beats`), Buffer.from(Float32Array.from(rows).buffer))
  done++
}
console.error(`${done} songs, ${columns.length} columns, ${((Date.now() - started) / 1000).toFixed(1)} s`)
