// Per-reading rhythm features from pattern-eval.mts dumps (each band's onsets and the tempo tracker's BPM every 500 ms), for tuning
// the rhythm model and testing new names offline (rhythm-fit.py, rhythm-names.py). Each reading sees what the app sees at that moment:
// every band's onsets over the last 12 s and the current tempo, through the same rhythmFeatures the app uses.
//
//   tsx rhythm-features.mts <run.json> <out.json>
//
// Writes { columns: [...], runs: [{ id, rhythm, rows: number[][] }] }, one row per reading (null BPM rows are all NaN but the time).
// Columns: t (s), bpm, then rhythm-model.json's features (rhythmFeatures in rhythm-pattern.ts): d<b> (hits per beat in band b: 0 bass,
// 1 lo, 2 mid, 3 hi, 4 air), r<b>_<lag> (share of band b's hits repeating `lag` beats later within 40 ms), ph<k> (share of hi hits in each
// sixth of a beat after the latest kick: swing shows late), then the level features (rhythm-levels.ts) when the run has them. `rhythm` is the run's held label when it has one (pattern-eval.mts), else its name.
import { readFileSync, writeFileSync } from 'node:fs'
import { rhythmFeatures } from '../../src/audioanalysis/rhythm-pattern.ts'
import { LEVEL_FEATURE_NAMES } from '../../src/audioanalysis/rhythm-levels.ts'
import modelData from '../../src/audioanalysis/rhythm-model.json' with { type: 'json' }

const [input, output] = process.argv.slice(2) as [string, string]
const WINDOW_MS = 12000

type Run = { id: string; rhythm: Array<string | null>; label?: Array<string | null>; bandOnsets: number[][]; bpm: Array<number | null>; levels?: number[][] }
const data = JSON.parse(readFileSync(input, 'utf8')) as { readEveryMs: number; runs: Run[] }
const onsetColumns = modelData.features.filter((name) => !LEVEL_FEATURE_NAMES.includes(name))
const withLevels = data.runs.every((run) => run.levels !== undefined)
const columns = ['t', 'bpm', ...onsetColumns, ...(withLevels ? LEVEL_FEATURE_NAMES : [])]

const windowOf = (onsets: number[], from: number, to: number): number[] => onsets.filter((time) => time >= from && time <= to)

const runs = data.runs.map((run) => {
  const bands = run.bandOnsets.map((list) => list.map((s) => s * 1000))
  const rows = run.bpm.map((bpm, i) => {
    const t = (i + 1) * data.readEveryMs
    const features = bpm === null ? null : rhythmFeatures({ bandOnsets: bands.map((list) => windowOf(list, t - WINDOW_MS, t)), periodMs: 60000 / bpm })
    if (bpm === null || features === null) return columns.map((c) => (c === 't' ? t / 1000 : NaN))
    return [t / 1000, bpm, ...features, ...(withLevels ? (run.levels?.[i] ?? []) : [])].map((x) => Math.round(x * 1000) / 1000)
  })
  return { id: run.id, rhythm: run.label ?? run.rhythm, rows }
})
writeFileSync(output, JSON.stringify({ columns, runs }))
console.error(`${runs.length} runs`)
