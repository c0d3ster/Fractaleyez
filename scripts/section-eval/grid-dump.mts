// Writes the beat grid's state every 250 ms for every song in a levels directory, aligned with dump-features.mts (row k ends at (k + 1) * 0.25 s),
// for testing whether the grid helps the section model.
//
//   tsx grid-dump.mts <levels dir> <out dir>
//
// One <id>.grid file per song: raw float32, slots x GRID_COLUMNS.
import { mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { TempoTracker } from '../../packages/soundsense/src/tempo-tracker.ts'
import { BeatGrid } from '../../packages/soundsense/src/beat-grid.ts'
import { BANDS, SOURCE_FPS, loadLevels } from './stream.mts'

export const GRID_COLUMNS = [
  'gridLocked', 'beatInBar', 'barInPhrase', 'beatsIntoPhrase', 'beatsToLine', 'beatsSinceLine', 'beatPhase', 'downbeatConfidence', 'phraseConfidence',
]
const BEATS_PER_PHRASE = 32

const [dir, out] = [process.argv[2]!, process.argv[3]!]
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'names.json'), JSON.stringify(GRID_COLUMNS))
const FRAME_MS = 1000 / SOURCE_FPS
const ids = readdirSync(dir).filter((name) => name.endsWith('.f32')).map((name) => name.slice(0, -4)).sort()
for (const id of ids) {
  if (existsSync(join(out, `${id}.grid`))) continue
  const frames = loadLevels(dir, id)
  const tempo = new TempoTracker()
  const grid = new BeatGrid(tempo)
  const levels = new Array<number>(BANDS).fill(0)
  const rows: number[] = []
  let nextSlot = 250
  for (let f = 0; f < frames.length / BANDS; f++) {
    for (let b = 0; b < BANDS; b++) levels[b] = frames[f * BANDS + b]!
    const t = f * FRAME_MS
    tempo.push(t, levels)
    grid.push(t, levels)
    while (t >= nextSlot) {
      const s = grid.getState()
      if (!s) rows.push(0, 0, 0, 0, 0, 0, 0, 0, 0)
      else {
        // Beats into the 8-bar phrase, counting the current beat as whole and the time since it as a fraction.
        const into = (s.barInPhrase - 1) * 4 + (s.beatInBar - 1) + Math.min(0.999, (t - s.lastBeatMs) / s.periodMs)
        rows.push(1, s.beatInBar, s.barInPhrase, into, BEATS_PER_PHRASE - into, into, Math.min(0.999, (t - s.lastBeatMs) / s.periodMs), s.downbeatConfidence, s.phraseConfidence)
      }
      nextSlot += 250
    }
  }
  writeFileSync(join(out, `${id}.grid`), Buffer.from(Float32Array.from(rows).buffer))
}
console.error(`${ids.length} songs`)
