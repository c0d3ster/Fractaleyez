// Replays saved band levels through the OnsetDetector with the app's defaults (bass and hi enabled, Threshold 2, Ignore Time 250 ms) and
// records which band fired each beat. With --gain the levels are scaled first (a quieter or louder mic).
//
//   tsx onset-eval.mts <levels dir> <out.json> [--gain 1] [--bands 1,0,0,1,0] [--opts '{"floorMarginDb":6}'] [--rhythm app|off|gated]
//
// onset-score.py turns it into beats per minute per band (for noise: every one is false) and an F-measure against marked beats.
import { readdirSync, writeFileSync } from 'node:fs'
import { OnsetDetector } from '../../packages/soundsense/src/onset-detector.ts'
import { TempoTracker } from '../../packages/soundsense/src/tempo-tracker.ts'
import { BANDS, SOURCE_FPS, loadLevels } from './stream.mts'

const args = process.argv.slice(2)
const option = (name: string, fallback: string): string => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1]! : fallback
}
const [dir, output] = [args[0]!, args[1]!]
const gain = Number(option('gain', '1'))
const enabledBands = option('bands', '1,0,0,1,0').split(',').map((v) => v === '1')
const detectorOptions = JSON.parse(option('opts', '{}')) as Record<string, number>
const FRAME_MS = 1000 / SOURCE_FPS
const runs: Array<{ id: string; seconds: number; beats: Array<[number, number]> }> = []
for (const id of readdirSync(dir).filter((name) => name.endsWith('.f32')).map((name) => name.slice(0, -4)).sort()) {
  const frames = loadLevels(dir, id)
  const detector = new OnsetDetector(BANDS, detectorOptions)
  // --rhythm app: what AudioFeed does (the noise gates on while the tempo tracker shows no tempo); off: never (the old behaviour); on: always.
  const tempo = new TempoTracker()
  const levels = new Array<number>(BANDS).fill(0)
  const beats: Array<[number, number]> = []
  const count = frames.length / BANDS
  for (let f = 0; f < count; f++) {
    for (let b = 0; b < BANDS; b++) levels[b] = frames[f * BANDS + b]! * gain
    const mode = option('rhythm', 'app')
    const rhythm = mode === 'app' ? tempo.getReading() !== null : mode === 'off' ? undefined : false
    const onset = detector.update(levels, FRAME_MS, 0, { enabledBands, sensitivity: 2, ignoreMs: 250, decayMs: 300, rhythm })
    tempo.push(f * FRAME_MS, levels)
    if (onset.beatBand !== null) beats.push([Math.round(f * FRAME_MS) / 1000, onset.beatBand])
  }
  runs.push({ id, seconds: count / SOURCE_FPS, beats })
}
writeFileSync(output, JSON.stringify({ gain, enabledBands, runs }))
console.error(`${runs.length} files`)
