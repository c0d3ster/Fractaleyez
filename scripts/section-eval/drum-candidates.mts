// Replays real songs (or clips) through the drum hit classifier (drum-hits.ts) and writes every candidate compactly, for
// drum-real-thresholds.py and drum-weak-labels.py: drum-eval.mts --features writes the same as JSON, which is over a gigabyte for Raveform.
//
//   tsx drum-candidates.mts <levels dir> <out prefix> [--truth truth.jsonl] [--shard k/n]
//
// <out prefix>.bin: float32 rows of [track, t (ms), p kick, p hat, p snare, p clap, the model's inputs...], track being the index into
// <out prefix>.json's `tracks` (each its truth line). <out prefix>.json also names the kinds, the inputs and the row width.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DRUM_KINDS, DrumHits, type DrumCandidate } from '../../src/audioanalysis/drum-hits.ts'
import modelData from '../../src/audioanalysis/drum-hit-model.json' with { type: 'json' }
import { BANDS, SOURCE_FPS, loadLevels } from './stream.mts'

type Truth = { id: string } & Record<string, unknown>

const args = process.argv.slice(2)
const option = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : undefined
}
const [dir, prefix] = [args[0]!, args[1]!]
const [shard, shards] = (option('shard') ?? '0/1').split('/').map(Number) as [number, number]
const FRAME_MS = 1000 / SOURCE_FPS
// The Threshold slider value the model was trained at (drum-eval.mts).
const SENSITIVITY = 2

const tracks: Truth[] = readFileSync(option('truth') ?? join(dir, 'truth.jsonl'), 'utf8').split('\n').filter(Boolean)
  .map((line) => JSON.parse(line) as Truth).filter((_, i) => i % shards === shard)

const rows: number[] = []
let width = 0
tracks.forEach((truth, index) => {
  const frames = loadLevels(dir, truth.id)
  const drums = new DrumHits(({ t, probabilities, features }: DrumCandidate) => {
    width = 2 + probabilities.length + features.length
    rows.push(index, t, ...probabilities, ...features)
  })
  const levels = new Array<number>(BANDS).fill(0)
  for (let f = 0; f < frames.length / BANDS; f++) {
    for (let b = 0; b < BANDS; b++) levels[b] = frames[f * BANDS + b]!
    drums.push(f * FRAME_MS, levels, FRAME_MS, SENSITIVITY)
  }
})

writeFileSync(`${prefix}.bin`, new Float32Array(rows))
writeFileSync(`${prefix}.json`, JSON.stringify({ kinds: DRUM_KINDS, features: modelData.features, width, tracks }))
console.error(`${tracks.length} tracks, ${width > 0 ? rows.length / width : 0} candidates`)
