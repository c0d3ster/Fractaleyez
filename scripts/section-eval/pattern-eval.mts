// Replays saved band levels the way AudioFeed runs them (OnsetDetector with the app's defaults, gated on TempoTracker, a 12 s beat history) and
// records the rhythm pattern name the Beat HUD would show every 500 ms (estimateTempo). Also writes, for
// offline experiments, each band's own onsets (a detector per band, 100 ms ignore time), the grid's beats and the tempo readings.
// Scored by pattern-score.py against genre proxy labels.
//
//   tsx pattern-eval.mts <levels dir> <out.json> [--fps 60] [--ids a,b,c] [--shard i/n] [--no-dump]
import { readdirSync, writeFileSync } from 'node:fs'
import { OnsetDetector } from '../../src/audioanalysis/onset-detector.ts'
import { DEFAULT_ENABLED_BANDS } from '../../src/audioanalysis/onset-bands.ts'
import { estimateTempo } from '../../src/audioanalysis/tempo.ts'
import { TempoTracker } from '../../src/audioanalysis/tempo-tracker.ts'
import { BeatGrid } from '../../src/audioanalysis/beat-grid.ts'
import { BANDS, SOURCE_FPS, loadLevels } from './stream.mts'

const args = process.argv.slice(2)
const option = (name: string, fallback: string): string => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1]! : fallback
}
const [dir, output] = [args[0]!, args[1]!]
const fps = Number(option('fps', '60'))
const dump = !args.includes('--no-dump')
const READ_EVERY_MS = 500
const BEAT_WINDOW_MS = 12000
const BAND_IGNORE_MS = 100
const params = { sensitivity: 2, ignoreMs: 250, decayMs: 300 }

type Run = {
  id: string
  patterns: Array<string | null>
  beats?: number[]
  bandOnsets?: number[][]
  grid?: Array<[number, number, number]>
  bpm?: Array<number | null>
}

const allIds = option('ids', '') ? option('ids', '').split(',') : readdirSync(dir).filter((name) => name.endsWith('.f32')).map((name) => name.slice(0, -4)).sort()
const [shard, shards] = option('shard', '0/1').split('/').map(Number) as [number, number]
const ids = allIds.filter((_, i) => i % shards === shard)

const started = Date.now()
const runs: Run[] = []
const r3 = (x: number): number => Math.round(x) / 1000
for (const id of ids) {
  const frames = loadLevels(dir, id)
  const detector = new OnsetDetector(BANDS)
  const bandDetectors = Array.from({ length: BANDS }, () => new OnsetDetector(BANDS))
  const tempo = new TempoTracker()
  const grid = new BeatGrid(tempo)
  const count = frames.length / BANDS
  const step = SOURCE_FPS / fps
  const frameMs = 1000 / fps
  const levels = new Array<number>(BANDS).fill(0)
  const beats: number[] = []
  const bandOnsets: number[][] = Array.from({ length: BANDS }, () => [])
  const gridBeats: Array<[number, number, number]> = []
  const patterns: Array<string | null> = []
  const bpm: Array<number | null> = []
  let nextRead = READ_EVERY_MS
  for (let i = 0, k = 0; i < count; i += step, k++) {
    const f = Math.floor(i)
    for (let b = 0; b < BANDS; b++) levels[b] = frames[f * BANDS + b]!
    const t = k * frameMs
    const rhythm = tempo.getReading() !== null
    const onset = detector.update(levels, frameMs, 0, { ...params, enabledBands: DEFAULT_ENABLED_BANDS, rhythm })
    if (onset.beatBand !== null) beats.push(t)
    if (dump) {
      bandDetectors.forEach((bandDetector, b) => {
        const reading = bandDetector.update(levels, frameMs, 0, { ...params, ignoreMs: BAND_IGNORE_MS, enabledBands: levels.map((_, j) => j === b), rhythm })
        if (reading.beatBand !== null) bandOnsets[b]!.push(r3(t))
      })
    }
    tempo.push(t, levels)
    if (grid.push(t, levels)) {
      const state = grid.getState()
      if (state) gridBeats.push([r3(state.lastBeatMs), state.beatInBar, state.barInPhrase])
    }
    if (t >= nextRead) {
      const recent = beats.filter((time) => time >= t - BEAT_WINDOW_MS)
      patterns.push(estimateTempo(recent)?.pattern ?? null)
      const reading = tempo.getBpm()
      bpm.push(reading === null ? null : Math.round(reading * 10) / 10)
      nextRead += READ_EVERY_MS
    }
  }
  runs.push(dump ? { id, patterns, beats: beats.map(r3), bandOnsets, grid: gridBeats, bpm } : { id, patterns })
}
writeFileSync(output, JSON.stringify({ fps, readEveryMs: READ_EVERY_MS, runs }))
console.error(`${runs.length} tracks in ${((Date.now() - started) / 1000).toFixed(1)} s`)
