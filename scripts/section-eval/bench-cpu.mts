// Times each piece of the per-frame audio work on real songs, one frame at a time at 60 fps, the way the app runs it.
//
//   tsx bench-cpu.mts <levels dir> [--songs 20] [--old <old sections module>]
//
// Reports, per piece: the average CPU time per second of audio, the same as a share of a 60 fps frame's 16.7 ms, and the slowest single
// frame (the pieces that do their work every 250 or 500 ms spend it in one frame, so that frame is what could cause a dropped frame).
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'
import { OnsetDetector } from '../../src/audioanalysis/onset-detector.ts'
import { DEFAULT_ENABLED_BANDS } from '../../src/audioanalysis/onset-bands.ts'
import { estimateTempo } from '../../src/audioanalysis/tempo.ts'
import { SectionTracker } from '../../src/audioanalysis/sections.ts'
import { TempoTracker } from '../../src/audioanalysis/tempo-tracker.ts'
import { BANDS, loadLevels } from './stream.mts'

const args = process.argv.slice(2)
const option = (name: string, fallback: string | null): string | null => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1]! : fallback
}
const dir = args[0]!
const songs = Number(option('songs', '20'))
const oldPath = option('old', null)
const OldTracker = oldPath ? ((await import(pathToFileURL(resolve(oldPath)).href)) as { SectionTracker: new () => { push: SectionTracker['push'] } }).SectionTracker : null

type Timer = { name: string; total: number; max: number; samples: number[] }
const timers: Timer[] = ['onset detector', 'old section tracker', 'new section tracker', 'old tempo (HUD, every 500 ms)', 'new tempo tracker'].map((name) => ({ name, total: 0, max: 0, samples: [] }))
const time = (timer: Timer, work: () => void): void => {
  const start = performance.now()
  work()
  const spent = performance.now() - start
  timer.total += spent
  timer.max = Math.max(timer.max, spent)
  if (spent > 0.05) timer.samples.push(spent)
}

const FRAME_MS = 1000 / 60
let audioSeconds = 0
const ids = readdirSync(dir).filter((name) => name.endsWith('.f32')).map((name) => name.slice(0, -4)).sort().slice(0, songs)
// A warm-up song first, so the JIT has compiled everything before anything is timed.
for (const [round, list] of [[0, ids.slice(0, 1)], [1, ids]] as const) {
  for (const id of list) {
    const frames = loadLevels(dir, id)
    const detector = new OnsetDetector(BANDS)
    const oldTracker = OldTracker ? new OldTracker() : null
    const newTracker = new SectionTracker()
    const tempo = new TempoTracker()
    const beats: number[] = []
    const levels = new Array<number>(BANDS).fill(0)
    let nextTempo = 500
    const count = frames.length / BANDS
    for (let f = 0; f < count; f++) {
      for (let b = 0; b < BANDS; b++) levels[b] = frames[f * BANDS + b]!
      const t = f * FRAME_MS
      const timed = round === 1
      let beat = false
      const run = (i: number, work: () => void): void => (timed ? time(timers[i]!, work) : work())
      run(0, () => {
        beat = detector.update(levels, FRAME_MS, 0, { enabledBands: DEFAULT_ENABLED_BANDS, sensitivity: 2, ignoreMs: 250, decayMs: 300 }).beatBand !== null
      })
      if (beat) beats.push(t)
      if (oldTracker) run(1, () => oldTracker.push({ t, levels, beat }))
      run(2, () => newTracker.push({ t, levels, beat }))
      if (t >= nextTempo) {
        nextTempo += 500
        run(3, () => {
          estimateTempo(beats.filter((time) => time >= t - 12000))
        })
      }
      run(4, () => tempo.push(t, levels))
    }
    if (round === 1) audioSeconds += count / 60
  }
}
console.log(`${ids.length} songs, ${(audioSeconds / 60).toFixed(0)} min of audio at 60 fps`)
for (const timer of timers) {
  if (timer.total === 0) continue
  const msPerSecond = timer.total / audioSeconds
  const sorted = timer.samples.sort((a, b) => a - b)
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0
  const over = (ms: number): string => (timer.samples.filter((v) => v > ms).length / (audioSeconds / 3600)).toFixed(0)
  console.log(`${''.padEnd(32)} frames over 2 ms: ${over(2)} per hour, over 4 ms: ${over(4)} per hour, over 8 ms: ${over(8)} per hour`)
  console.log(`${timer.name.padEnd(32)} ${msPerSecond.toFixed(3).padStart(7)} ms per second of audio (${((msPerSecond / 60 / FRAME_MS) * 100).toFixed(2)}% of each frame), slowest frame ${timer.max.toFixed(2)} ms, p99 of the frames doing work ${p99.toFixed(2)} ms`)
}
const json = readFileSync(resolve('../../src/audioanalysis/section-model.json'), 'utf8')
const start = performance.now()
for (let i = 0; i < 10; i++) JSON.parse(json)
console.log(`parsing section-model.json (${(json.length / 1024).toFixed(0)} KB): ${((performance.now() - start) / 10).toFixed(1)} ms, once at startup`)
