// Names the rhythm pattern again from a pattern-eval.mts dump (its detected beats, each band's onsets and the tempo readings), without
// replaying the levels, so namers and their options can be compared in seconds. Writes the same shape pattern-score.py reads.
//
//   tsx pattern-rename.mts <dump.json>[,<dump.json>...] <out.json> [--namer tempo|rhythm] [--opts '{"shareBeatsHit":0.7}'] [--every n] [--ids a,b]
//
// --every n names only every nth reading (the rest are written as "skip", which pattern-score.py leaves out), for a quick search;
// --ids keeps only those tracks.
//
// tempo:  estimateTempo over the last 12 s of beats (what the Beat HUD shows), with --opts as its PatternOptions.
// rhythm: nameRhythm (rhythm-pattern.ts) over the last 12 s of each band's onsets, at the tempo tracker's beat, with --opts as its options.
import { readFileSync, writeFileSync } from 'node:fs'
import { estimateTempo } from '../../packages/soundsense/src/tempo.ts'
import { nameRhythm } from '../../packages/soundsense/src/rhythm-pattern.ts'

type Dump = { id: string; beats: number[]; bandOnsets: number[][]; bpm: Array<number | null>; patterns: Array<string | null> }

const args = process.argv.slice(2)
const option = (name: string, fallback: string): string => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1]! : fallback
}
const [inputs, output] = [args[0]!, args[1]!]
const namer = option('namer', 'tempo')
const opts = JSON.parse(option('opts', '{}')) as Record<string, number>
const every = Number(option('every', '1'))
const keepIds = option('ids', '') ? new Set(option('ids', '').split(',')) : null
const READ_EVERY_MS = 500
const WINDOW_MS = 12000

// The newest index whose time is at most `t`, searching from `from` (times are sorted and readings move forward).
const advance = (times: readonly number[], from: number, t: number): number => {
  let i = from
  while (i < times.length && times[i]! <= t) i++
  return i
}

const runs = inputs.split(',').flatMap((path) => (JSON.parse(readFileSync(path, 'utf8')) as { runs: Dump[] }).runs).filter(({ id }) => keepIds === null || keepIds.has(id)).map((run) => {
  const beats = run.beats.map((x) => x * 1000)
  const bands = run.bandOnsets.map((list) => list.map((x) => x * 1000))
  const patterns = run.bpm.map((bpm, i) => {
    if (i % every !== 0) return 'skip'
    const t = (i + 1) * READ_EVERY_MS
    if (namer === 'tempo') {
      const end = advance(beats, 0, t)
      const recent = beats.slice(0, end).filter((time) => time > t - WINDOW_MS)
      return estimateTempo(recent, opts)?.pattern ?? null
    }
    const recentBands = bands.map((list) => list.filter((time) => time > t - WINDOW_MS && time <= t))
    return nameRhythm({ bandOnsets: recentBands, periodMs: bpm ? 60000 / bpm : null }, opts)
  })
  return { id: run.id, patterns }
})
writeFileSync(output, JSON.stringify({ namer, opts, readEveryMs: READ_EVERY_MS, runs }))
console.error(`${runs.length} tracks`)
