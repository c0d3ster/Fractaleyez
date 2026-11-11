// Replays spectra (50 ms ticks x 40 bands, as analyser.py and the training recorder write them) through the sweep detector (sweep.ts) and
// writes its probability per slot and, with --features, every input, for sweep-train.py and sweep-score.py.
//
//   tsx sweep-eval.mts <dir> <out.json> [--truth truth.jsonl] [--features] [--shard k/n]
//
// truth.jsonl (default <dir>/truth.jsonl) has one line per clip or song with at least its id; every field is copied into the output.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SPECTRUM_BANDS } from '../../src/audioanalysis/tick-extras.ts'
import { SweepDetector, type SweepSlot } from '../../src/audioanalysis/sweep.ts'

type Truth = { id: string } & Record<string, unknown>

const args = process.argv.slice(2)
const option = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : undefined
}
const [dir, output] = [args[0]!, args[1]!]
const withFeatures = args.includes('--features')
const [shard, shards] = (option('shard') ?? '0/1').split('/').map(Number) as [number, number]
const TICK_MS = 50
const round = (v: number, places = 3): number => Math.round(v * 10 ** places) / 10 ** places

const truths: Truth[] = readFileSync(option('truth') ?? join(dir, 'truth.jsonl'), 'utf8').split('\n').filter(Boolean)
  .map((line) => JSON.parse(line) as Truth).filter((_, i) => i % shards === shard)

const results = truths.filter(({ id }) => existsSync(join(dir, `${id}.spec`))).map((truth) => {
  const buffer = readFileSync(join(dir, `${truth.id}.spec`))
  const ticks = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
  const slots: SweepSlot[] = []
  const detector = new SweepDetector((slot) => slots.push(slot))
  const count = ticks.length / SPECTRUM_BANDS
  for (let i = 0; i < count; i++) detector.pushTick((i + 1) * TICK_MS, Array.from(ticks.subarray(i * SPECTRUM_BANDS, (i + 1) * SPECTRUM_BANDS)))
  return {
    ...truth,
    sweep: slots.map(({ t, probability }) => [Math.round(t), round(probability)]),
    ...(withFeatures ? { sweepFeatures: slots.map(({ features }) => features.map((v) => round(v, 3))) } : {}),
  }
})

writeFileSync(output, JSON.stringify({ results }))
console.error(`${results.length} clips`)
