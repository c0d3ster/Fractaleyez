// Replays saved band levels the way AudioFeed runs them (OnsetDetector with the app's defaults, gated on TempoTracker, feeding a BeatMonitor)
// and records, every 500 ms, the rhythm pattern names the app can show: `patterns` is estimateTempo over the monitor's beat times (what the
// Beat HUD shows), `rhythm` is nameRhythm over the monitor's per-band onsets at the tracker's tempo, unheld, and `label` the Beat HUD's
// line (RhythmLabeler: held, with the tempo range, window.getRhythmLabel). Also writes,
// for offline experiments (pattern-rename.mts), the beat times, each band's onsets, the grid's beats and the tempo readings.
// Scored by pattern-score.py (--key rhythm for the second namer) against genre proxy labels.
//
//   tsx pattern-eval.mts <levels dir> <out.json> [--fps 60] [--ids a,b,c] [--shard i/n] [--no-dump]
import { readdirSync, writeFileSync } from 'node:fs'
import { OnsetDetector } from '../../src/audioanalysis/onset-detector.ts'
import { DEFAULT_ENABLED_BANDS } from '../../src/audioanalysis/onset-bands.ts'
import { estimateTempo } from '../../src/audioanalysis/tempo.ts'
import { TempoTracker } from '../../src/audioanalysis/tempo-tracker.ts'
import { BeatGrid } from '../../src/audioanalysis/beat-grid.ts'
import { BeatMonitor } from '../../src/audioanalysis/beat.ts'
import { nameRhythm, RhythmLabeler } from '../../src/audioanalysis/rhythm-pattern.ts'
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
const params = { sensitivity: 2, ignoreMs: 250, decayMs: 300, enabledBands: DEFAULT_ENABLED_BANDS }

type Run = {
  id: string
  patterns: Array<string | null>
  rhythm: Array<string | null>
  label: Array<string | null>
  beats?: number[]
  bandOnsets?: number[][]
  grid?: Array<[number, number, number]>
  bpm?: Array<number | null>
}

// BeatMonitor reads the clock to trim its history; the replay's clock is the frame time.
let clockMs = 0
globalThis.performance.now = (): number => clockMs

const allIds = option('ids', '') ? option('ids', '').split(',') : readdirSync(dir).filter((name) => name.endsWith('.f32')).map((name) => name.slice(0, -4)).sort()
const [shard, shards] = option('shard', '0/1').split('/').map(Number) as [number, number]
const ids = allIds.filter((_, i) => i % shards === shard)

const started = Date.now()
const runs: Run[] = []
const r3 = (x: number): number => Math.round(x) / 1000
for (const id of ids) {
  const frames = loadLevels(dir, id)
  const detector = new OnsetDetector(BANDS)
  const tempo = new TempoTracker()
  const grid = new BeatGrid(tempo)
  const monitor = new BeatMonitor()
  const count = frames.length / BANDS
  const step = SOURCE_FPS / fps
  const frameMs = 1000 / fps
  const levels = new Array<number>(BANDS).fill(0)
  const beats: number[] = []
  const bandOnsets: number[][] = Array.from({ length: BANDS }, () => [])
  const gridBeats: Array<[number, number, number]> = []
  const patterns: Array<string | null> = []
  const rhythm: Array<string | null> = []
  const label: Array<string | null> = []
  const labeler = new RhythmLabeler()
  const bpm: Array<number | null> = []
  let nextRead = READ_EVERY_MS
  for (let i = 0, k = 0; i < count; i += step, k++) {
    const f = Math.floor(i)
    for (let b = 0; b < BANDS; b++) levels[b] = frames[f * BANDS + b]!
    const t = k * frameMs
    clockMs = t
    const onset = detector.update(levels, frameMs, 0, { ...params, rhythm: tempo.getReading() !== null })
    monitor.record({ t, bands: onset.bands, beatBand: onset.beatBand })
    if (onset.beatBand !== null) beats.push(t)
    tempo.push(t, levels)
    if (grid.push(t, levels)) {
      const state = grid.getState()
      if (state) gridBeats.push([r3(state.lastBeatMs), state.beatInBar, state.barInPhrase])
    }
    if (t >= nextRead) {
      patterns.push(estimateTempo(monitor.getBeatTimes())?.pattern ?? null)
      const reading = tempo.getBpm()
      const bands = monitor.getBandOnsets()
      const input = { bandOnsets: bands, periodMs: reading === null ? null : 60000 / reading }
      rhythm.push(nameRhythm(input))
      label.push(labeler.read(input, t).text || null)
      bpm.push(reading === null ? null : Math.round(reading * 10) / 10)
      // Each band's onsets, collected from the monitor's window as they leave it (the window is longer than a reading's step).
      bands.forEach((list, b) => {
        const kept = bandOnsets[b]!
        const last = kept[kept.length - 1] ?? -Infinity
        list.forEach((time) => {
          if (r3(time) > last) kept.push(r3(time))
        })
      })
      nextRead += READ_EVERY_MS
    }
  }
  runs.push(dump ? { id, patterns, rhythm, label, beats: beats.map(r3), bandOnsets, grid: gridBeats, bpm } : { id, patterns, rhythm, label })
}
writeFileSync(output, JSON.stringify({ fps, readEveryMs: READ_EVERY_MS, runs }))
console.error(`${runs.length} tracks in ${((Date.now() - started) / 1000).toFixed(1)} s`)
