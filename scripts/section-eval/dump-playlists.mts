// Builds random playlists from a levels directory and writes their section features with song-boundary labels, for training
// the song change detector.
//
//   tsx dump-playlists.mts <levels dir> <folds.json> <out dir> [--per-fold 30] [--songs 5] [--seed 1]
//
// For every fold, playlists are drawn only from that fold's songs, so the detector can be scored out of fold. Each playlist gets a
// random join: back to back (0 to 5 s of silence) or a crossfade (4 to 10 s). Writes <out>/pl<n>.feat (slots x features) and
// <out>/playlists.json ([{ fold, songs, gapSeconds, crossfadeSeconds, starts, slots }]).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { OnsetDetector } from '../../src/audioanalysis/onset-detector.ts'
import { DEFAULT_ENABLED_BANDS } from '../../src/audioanalysis/onset-bands.ts'
import { FEATURE_NAMES, SectionFeatures } from '../../src/audioanalysis/section-features.ts'
import { TempoTracker } from '../../src/audioanalysis/tempo-tracker.ts'
import { BeatGrid } from '../../src/audioanalysis/beat-grid.ts'
import { BANDS, SOURCE_FPS, joinSongs, loadLevels } from './stream.mts'

const args = process.argv.slice(2)
const option = (name: string, fallback: string): string => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1]! : fallback
}
const [dir, foldsPath, out] = [args[0]!, args[1]!, args[2]!]
const perFold = Number(option('per-fold', '30'))
const songsPer = Number(option('songs', '5'))
let seed = Number(option('seed', '1'))
const random = (): number => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'names.json'), JSON.stringify(FEATURE_NAMES))
const folds = JSON.parse(readFileSync(foldsPath, 'utf8')) as Record<string, number>
const byFold = new Map<number, string[]>()
Object.entries(folds).forEach(([id, fold]) => byFold.set(fold, [...(byFold.get(fold) ?? []), id]))

const FRAME_MS = 1000 / SOURCE_FPS
const meta: Array<{ fold: number; songs: string[]; gapSeconds: number; crossfadeSeconds: number; starts: number[]; slots: number }> = []
let n = 0
for (const [fold, ids] of [...byFold.entries()].sort((a, b) => a[0] - b[0])) {
  for (let p = 0; p < perFold; p++) {
    const pool = [...ids]
    const songs = Array.from({ length: songsPer }, () => pool.splice(Math.floor(random() * pool.length), 1)[0]!)
    const crossfade = random() < 0.3
    const gapSeconds = crossfade ? 0 : [0, 0, 0.5, 1, 2, 3, 5][Math.floor(random() * 7)]!
    const crossfadeSeconds = crossfade ? 4 + Math.round(random() * 6) : 0
    const { frames, starts } = joinSongs(songs.map((id) => loadLevels(dir, id)), gapSeconds, crossfadeSeconds)
    const detector = new OnsetDetector(BANDS)
    const features = new SectionFeatures()
    // One grid over the whole playlist, as the app runs one across songs.
    const tempo = new TempoTracker()
    const grid = new BeatGrid(tempo)
    const rows: number[] = []
    const levels = new Array<number>(BANDS).fill(0)
    for (let f = 0; f < frames.length / BANDS; f++) {
      for (let b = 0; b < BANDS; b++) levels[b] = frames[f * BANDS + b]!
      const onset = detector.update(levels, FRAME_MS, 0, { enabledBands: DEFAULT_ENABLED_BANDS, sensitivity: 2, ignoreMs: 250, decayMs: 300 })
      tempo.push(f * FRAME_MS, levels)
      grid.push(f * FRAME_MS, levels)
      const row = features.push(f * FRAME_MS, levels, onset.beatBand !== null, grid.getState())
      if (row) rows.push(...row)
    }
    writeFileSync(join(out, `pl${n}.feat`), Buffer.from(Float32Array.from(rows).buffer))
    meta.push({ fold, songs, gapSeconds, crossfadeSeconds, starts, slots: rows.length / FEATURE_NAMES.length })
    n++
  }
}
writeFileSync(join(out, 'playlists.json'), JSON.stringify(meta))
console.error(`${n} playlists`)
