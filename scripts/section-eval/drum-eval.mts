// Replays drum clips (drum-gen.py) or real songs through the drum hit classifier (drum-hits.ts) and the riser detector (riser.ts), the way
// audio-feed.ts runs them, and writes what the Frequency HUD's lights and riser meter would show. With --features it also writes every drum candidate's and every riser slot's model inputs, for
// drum-train.py and riser-train.py.
//
//   tsx drum-eval.mts <clips dir> <out.json> [--truth truth.jsonl] [--features | --riser-features | --drum-features] [--shard k/n]
//
// --riser-features writes only the riser slots' inputs (long real songs make a great many drum candidates), --drum-features only the drum
// candidates' and does not run the riser at all (real songs as weak kick labels for drum-train.py --real: the riser's slots cost most of
// the time and of the file).
//
// truth.jsonl (default <clips dir>/truth.jsonl) has one line per clip: { id, bpm, start, end, ... } (drum-gen.py writes the rest). Real songs
// work too: levels.py's .f32 files and a truth file with their ids.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DRUM_KINDS, DRUM_SENSITIVITY, DrumHits, type DrumCandidate } from '../../packages/beatsense/src/drum-hits.ts'
import { RiserDetector, type RiserSlot } from '../../packages/beatsense/src/riser.ts'
import { BANDS, SOURCE_FPS, loadLevels } from './stream.mts'

type Truth = { id: string; bpm: number; start: number; end: number } & Record<string, unknown>

const args = process.argv.slice(2)
const option = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : undefined
}
const [dir, output] = [args[0]!, args[1]!]
const withFeatures = args.includes('--features')
const withDrumFeatures = withFeatures || args.includes('--drum-features')
const withRiserFeatures = withFeatures || args.includes('--riser-features')
const withRiser = withRiserFeatures || !args.includes('--drum-features')
const [shard, shards] = (option('shard') ?? '0/1').split('/').map(Number) as [number, number]
const FRAME_MS = 1000 / SOURCE_FPS
const SENSITIVITY = DRUM_SENSITIVITY
const round = (v: number, places = 3): number => Math.round(v * 10 ** places) / 10 ** places

const truths: Truth[] = readFileSync(option('truth') ?? join(dir, 'truth.jsonl'), 'utf8').split('\n').filter(Boolean)
  .map((line) => JSON.parse(line) as Truth).filter((_, i) => i % shards === shard)

const results = truths.map((truth) => {
  const frames = loadLevels(dir, truth.id)
  const count = frames.length / BANDS
  const candidates: DrumCandidate[] = []
  const slots: RiserSlot[] = []
  const drums = new DrumHits((candidate) => candidates.push(candidate))
  const riser = new RiserDetector((slot) => slots.push(slot))
  const levels = new Array<number>(BANDS).fill(0)
  for (let f = 0; f < count; f++) {
    const t = f * FRAME_MS
    for (let b = 0; b < BANDS; b++) levels[b] = frames[f * BANDS + b]!
    drums.push(t, levels, FRAME_MS, SENSITIVITY)
    if (withRiser) riser.push(t, levels)
  }
  const calls = Object.fromEntries(DRUM_KINDS.map((kind) => [kind, candidates.filter(({ kinds }) => kinds.includes(kind)).map(({ t }) => Math.round(t))]))
  return {
    ...truth,
    calls,
    seconds: round(count / SOURCE_FPS, 2),
    riser: slots.map(({ t, probability }) => [Math.round(t), round(probability)]),
    ...(withDrumFeatures ? {
      candidates: candidates.map(({ t, features, probabilities }) => ({ t: Math.round(t), f: features.map((v) => round(v, 4)), p: probabilities.map((v) => round(v)) })),
    } : {}),
    ...(withRiserFeatures ? { riserFeatures: slots.map(({ features }) => features.map((v) => round(v, 3))) } : {}),
  }
})

writeFileSync(output, JSON.stringify({ sensitivity: SENSITIVITY, kinds: DRUM_KINDS, results }))
console.error(`${results.length} clips`)
