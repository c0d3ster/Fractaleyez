// Replays saved band levels (levels.py) through the real OnsetDetector and a tempo reader, and records the BPM it would show every 500 ms,
// the way the Beat HUD reads it. Scored by bpm-score.py against labelled tempos (the GiantSteps tempo set).
//
//   tsx bpm-eval.mts <levels dir> <out.json> [--reader current|tracker] [--fps 60] [--opts '{"memoryMs":8000}']
//
// current: estimateTempo over the last 12 s of beat times (what the Beat HUD shows today).
// tracker: TempoTracker (packages/beatsense/src/tempo/tempo-tracker.ts), fed every frame.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { OnsetDetector } from '../../packages/beatsense/src/onset/onset-detector.ts'
import { DEFAULT_ENABLED_BANDS } from '../../packages/beatsense/src/onset/onset-bands.ts'
import { estimateTempo } from '../../packages/beatsense/src/tempo/tempo.ts'
import { BANDS, SOURCE_FPS, loadLevels } from './stream.mts'

type Reader = { push: (t: number, levels: readonly number[], beat: boolean) => void; read: (t: number) => number | null }

const args = process.argv.slice(2)
const option = (name: string, fallback: string): string => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1]! : fallback
}
const [dir, output] = [args[0]!, args[1]!]
const readerName = option('reader', 'current')
const fps = Number(option('fps', '60'))
const READ_EVERY_MS = 500
const BEAT_WINDOW_MS = 12000

const currentReader = (): Reader => {
  const beats: number[] = []
  return {
    push: (t, _levels, beat) => {
      if (beat) beats.push(t)
    },
    read: (t) => estimateTempo(beats.filter((time) => time >= t - BEAT_WINDOW_MS))?.bpm ?? null,
  }
}

const trackerPath = resolve('../../packages/beatsense/src/tempo/tempo-tracker.ts')
const trackerReader = existsSync(trackerPath)
  ? ((await import(pathToFileURL(trackerPath).href)) as { TempoTracker: new (options?: unknown) => { push: Reader['push']; getBpm: () => number | null } }).TempoTracker
  : null
const makeReader = (): Reader => {
  if (readerName === 'current') return currentReader()
  if (!trackerReader) throw new Error('no tempo-tracker.ts yet')
  const tracker = new trackerReader(JSON.parse(option('opts', '{}')) as unknown)
  return { push: tracker.push, read: () => tracker.getBpm() }
}

const started = Date.now()
const runs: Array<{ id: string; readings: Array<number | null> }> = []
const ids = readdirSync(dir).filter((name) => name.endsWith('.f32')).map((name) => name.slice(0, -4)).sort()
for (const id of ids) {
  const frames = loadLevels(dir, id)
  const detector = new OnsetDetector(BANDS)
  const reader = makeReader()
  const count = frames.length / BANDS
  const step = SOURCE_FPS / fps
  const frameMs = 1000 / fps
  const levels = new Array<number>(BANDS).fill(0)
  const readings: Array<number | null> = []
  let nextRead = READ_EVERY_MS
  for (let i = 0, k = 0; i < count; i += step, k++) {
    const f = Math.floor(i)
    for (let b = 0; b < BANDS; b++) levels[b] = frames[f * BANDS + b]!
    const t = k * frameMs
    const onset = detector.update(levels, frameMs, 0, { enabledBands: DEFAULT_ENABLED_BANDS, sensitivity: 2, ignoreMs: 250, decayMs: 300 })
    reader.push(t, levels, onset.beatBand !== null)
    if (t >= nextRead) {
      const bpm = reader.read(t)
      readings.push(bpm === null ? null : Math.round(bpm * 10) / 10)
      nextRead += READ_EVERY_MS
    }
  }
  runs.push({ id, readings })
}
writeFileSync(output, JSON.stringify({ reader: readerName, opts: option('opts', '{}'), fps, readEveryMs: READ_EVERY_MS, runs }))
console.error(`${runs.length} tracks with ${readerName} in ${((Date.now() - started) / 1000).toFixed(1)} s`)
