// Times each piece of the per-frame audio work, one frame at a time at 60 fps, the way the app runs it.
//
//   tsx bench-cpu.mts [<levels dir>] [--songs 20] [--old <old sections module>] [--view-ms 8000] [--mirrored] [--seconds 60]
//
// With no levels dir the bench runs on a synthetic track (kick, snare, hat and a sweep, `--seconds` long) pushed through the front end, so it
// works on a clean checkout; real songs (levels.py output) give the numbers worth quoting. The spectrum the sweep reads always comes from the
// front end on the synthetic track. It ends with PASS/FAIL against the budgets below (a proposal, to be confirmed in review), exit code 1 on FAIL:
//
//   analysis budget: the analysers the driver runs, summed, under 10 ms of CPU per second of audio
//   worklet budget: one 128-sample quantum (front end and framing) under 0.3 ms on average
//
// The Beat HUD's plot (the band waveform, see waveformTrack.ts) is timed on its UI tick (20 Hz): folding in the new samples, recording the grid's beat and issuing its draw calls to a
// context that does nothing, so it is the JavaScript side only. The canvas's own work happens in the browser; time that there.
//
// Reports, per piece: the average CPU time per second of audio, the same as a share of a 60 fps frame's 16.7 ms, and the slowest single
// frame (the pieces that do their work every 250 or 500 ms spend it in one frame, so that frame is what could cause a dropped frame).
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'
import { OnsetDetector } from '../../packages/beatsense/src/onset/onset-detector.ts'
import { DEFAULT_ENABLED_BANDS } from '../../packages/beatsense/src/onset/onset-bands.ts'
import { estimateTempo } from '../../packages/beatsense/src/tempo/tempo.ts'
import { SectionTracker } from '../../packages/beatsense/src/sections/sections.ts'
import { loadSectionModel } from '../../packages/beatsense/src/sections/load-model.ts'
import { TempoTracker } from '../../packages/beatsense/src/tempo/tempo-tracker.ts'
import { BEAT_NET_MODEL, BeatGrid } from '../../packages/beatsense/src/grid/index.ts'
import { DRUM_SENSITIVITY, DrumHits } from '../../packages/beatsense/src/drums/index.ts'
import { RiserDetector, SweepDetector } from '../../packages/beatsense/src/risers/index.ts'
import { FrontEnd } from '../../packages/beatsense/src/frontend/index.ts'
import { FrameEmitter } from '../../packages/beatsense/src/worklet/frame-emitter.ts'
import type { BeatSample } from '../../packages/beatsense/src/onset/beat.ts'
import { DEFAULT_VIEW_MS, WaveformTrack, type WaveformContext, type WaveformView } from '../../packages/beatsense-ui/src/waveformTrack.ts'
import { BANDS, loadLevels } from './stream.mts'

const ANALYSIS_BUDGET_MS_PER_SECOND = 10
const WORKLET_BUDGET_MS_PER_QUANTUM = 0.3

const args = process.argv.slice(2)
const option = (name: string, fallback: string | null): string | null => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1]! : fallback
}
const dir = args[0] && !args[0].startsWith('--') ? args[0] : null
const songs = Number(option('songs', '20'))
const oldPath = option('old', null)
const OldTracker = oldPath ? ((await import(pathToFileURL(resolve(oldPath)).href)) as { SectionTracker: new () => { push: SectionTracker['push'] } }).SectionTracker : null

const SAMPLE_RATE = 44100
const QUANTUM = 128
const FPS = 60

type Timer = { name: string; total: number; max: number; calls: number; samples: number[] }
const NAMES = ['onset detector', 'old section tracker', 'new section tracker', 'old tempo (HUD, every 500 ms)', 'new tempo tracker', 'beat grid', 'Beat HUD plot (every 50 ms)', 'beat net + grid', 'drum hits', 'riser', 'sweep']
const timers: Timer[] = NAMES.map((name) => ({ name, total: 0, max: 0, calls: 0, samples: [] }))
const timerOf = (name: string): Timer => timers.find((timer) => timer.name === name)!
const index = (name: string): number => NAMES.indexOf(name)
const time = (timer: Timer, work: () => void): void => {
  const start = performance.now()
  work()
  const spent = performance.now() - start
  timer.total += spent
  timer.calls++
  timer.max = Math.max(timer.max, spent)
  if (spent > 0.05) timer.samples.push(spent)
}

const FRAME_MS = 1000 / FPS
const UI_TICK_MS = 50
const HUD_HISTORY_MS = 5000
const noop = (): void => {}
const nullContext: WaveformContext = {
  clearRect: noop, fillRect: noop, beginPath: noop, rect: noop, fill: noop, moveTo: noop, lineTo: noop, closePath: noop, stroke: noop, fillText: noop, setLineDash: noop,
  fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textBaseline: 'alphabetic',
}
const view: WaveformView = { now: 0, viewMs: Number(option('view-ms', String(DEFAULT_VIEW_MS))), enabled: DEFAULT_ENABLED_BANDS, ignoreMs: 250, mirrored: args.includes('--mirrored') }

// The synthetic track, rendered once: PCM, then its front end reading per frame (levels and the pooled spectrum), as the worklet gives them.
const mod = (value: number, by: number): number => ((value % by) + by) % by
const syntheticPcm = (seconds: number): Float32Array => {
  const out = new Float32Array(Math.floor(seconds * SAMPLE_RATE))
  for (let n = 0; n < out.length; n++) {
    const t = n / SAMPLE_RATE
    const kick = 0.5 * Math.sin(2 * Math.PI * 60 * t) * Math.exp(-30 * mod(t, 0.5))
    const snare = 0.2 * Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-40 * mod(t + 0.25, 0.5))
    const hat = 0.1 * Math.sin(2 * Math.PI * 9000 * t) * Math.exp(-90 * mod(t + 0.125, 0.25))
    const sweep = 0.1 * Math.sin(2 * Math.PI * (300 + 40 * mod(t, 8)) * t)
    out[n] = kick + snare + hat + sweep
  }
  return out
}
const pcm = syntheticPcm(Number(option('seconds', '60')))
const frameEnd = (f: number): number => Math.floor((f * SAMPLE_RATE) / FPS)
const synthetic: { levels: number[]; spectrum: Uint8Array }[] = []
{
  const frontEnd = new FrontEnd(SAMPLE_RATE)
  for (let f = 1; frameEnd(f) <= pcm.length; f++) {
    frontEnd.push(pcm.subarray(frameEnd(f - 1), frameEnd(f)))
    const { levels, spectrum } = frontEnd.read()
    synthetic.push({ levels, spectrum: Uint8Array.from(spectrum ?? []) })
  }
}
const sectionModel = await loadSectionModel()

let audioSeconds = 0
const ids = dir ? readdirSync(dir).filter((name) => name.endsWith('.f32')).map((name) => name.slice(0, -4)).sort().slice(0, songs) : ['synthetic']
// A warm-up song first, so the JIT has compiled everything before anything is timed.
for (const [round, list] of [[0, ids.slice(0, 1)], [1, ids]] as const) {
  for (const id of list) {
    const frames = dir ? loadLevels(dir, id) : Float32Array.from(synthetic.flatMap(({ levels }) => levels))
    const detector = new OnsetDetector(BANDS)
    const oldTracker = OldTracker ? new OldTracker() : null
    const newTracker = new SectionTracker(sectionModel)
    const tempo = new TempoTracker()
    const grid = new BeatGrid(tempo)
    const netGrid = new BeatGrid(tempo, {}, BEAT_NET_MODEL)
    const drums = new DrumHits()
    const riser = new RiserDetector()
    const sweep = new SweepDetector()
    const track = new WaveformTrack()
    // The beat monitor's 5 s of samples, as the HUD reads them.
    const history: BeatSample[] = []
    let nextUiTick = UI_TICK_MS
    const beats: number[] = []
    const levels = new Array<number>(BANDS).fill(0)
    let nextTempo = 500
    const count = frames.length / BANDS
    for (let f = 0; f < count; f++) {
      for (let b = 0; b < BANDS; b++) levels[b] = frames[f * BANDS + b]!
      const t = f * FRAME_MS
      const timed = round === 1
      let beat = false
      const run = (name: string, work: () => void): void => (timed ? time(timers[index(name)]!, work) : work())
      run('onset detector', () => {
        const onset = detector.update(levels, FRAME_MS, 0, { enabledBands: DEFAULT_ENABLED_BANDS, sensitivity: 2, ignoreMs: 250, decayMs: 300 })
        beat = onset.beatBand !== null
        history.push({ t, bands: onset.bands, beatBand: onset.beatBand })
      })
      if (history[0]!.t < t - HUD_HISTORY_MS * 1.25) history.splice(0, history.findIndex((sample) => sample.t >= t - HUD_HISTORY_MS))
      if (beat) beats.push(t)
      if (oldTracker) run('old section tracker', () => oldTracker.push({ t, levels, beat }))
      run('new section tracker', () => newTracker.push({ t, levels, beat }))
      if (t >= nextTempo) {
        nextTempo += 500
        run('old tempo (HUD, every 500 ms)', () => {
          estimateTempo(beats.filter((time) => time >= t - 12000))
        })
      }
      run('new tempo tracker', () => tempo.push(t, levels))
      run('beat grid', () => grid.push(t, levels))
      run('beat net + grid', () => netGrid.push(t, levels))
      run('drum hits', () => drums.push(t, levels, FRAME_MS, DRUM_SENSITIVITY))
      run('riser', () => riser.push(t, levels))
      run('sweep', () => sweep.push(t, synthetic[f % synthetic.length]!.spectrum))
      if (t >= nextUiTick) {
        nextUiTick += UI_TICK_MS
        run('Beat HUD plot (every 50 ms)', () => {
          track.ingest(history)
          track.recordGrid(grid.getState())
          view.now = t
          track.draw(nullContext, view)
        })
      }
    }
    if (round === 1) audioSeconds += count / FPS
  }
}
console.log(`${ids.length} ${dir ? 'songs' : 'synthetic track'}, ${(audioSeconds / 60).toFixed(1)} min of audio at ${FPS} fps`)
for (const timer of timers) {
  if (timer.total === 0) continue
  const msPerSecond = timer.total / audioSeconds
  const sorted = timer.samples.sort((a, b) => a - b)
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0
  const over = (ms: number): string => (timer.samples.filter((v) => v > ms).length / (audioSeconds / 3600)).toFixed(0)
  console.log(`${''.padEnd(32)} frames over 2 ms: ${over(2)} per hour, over 4 ms: ${over(4)} per hour, over 8 ms: ${over(8)} per hour`)
  console.log(`${timer.name.padEnd(32)} ${msPerSecond.toFixed(3).padStart(7)} ms per second of audio (${((msPerSecond / FPS / FRAME_MS) * 100).toFixed(2)}% of each frame, ${(timer.total / timer.calls).toFixed(4)} ms per call), slowest frame ${timer.max.toFixed(2)} ms, p99 of the frames doing work ${p99.toFixed(2)} ms`)
}

// The analysers a frame runs through in the driver (the Beat HUD plot, the old modules and the net-less grid are not part of it).
const ANALYSIS = ['onset detector', 'new section tracker', 'new tempo tracker', 'beat net + grid', 'drum hits', 'riser', 'sweep']
const total = ANALYSIS.reduce((sum, name) => sum + timerOf(name).total / audioSeconds, 0)

// The front end alone, then the worklet's work per 128-sample quantum (front end plus framing), on the same PCM. Round 0 warms the JIT.
const frontEnd = new FrontEnd(SAMPLE_RATE)
const emitter = new FrameEmitter(SAMPLE_RATE)
let frontEndMs = 0
let frontEndFrames = 0
let quantumTotal = 0
let quantumMax = 0
let quanta = 0
for (let round = 0; round < 2; round++) {
  for (let f = 1; frameEnd(f) <= pcm.length; f++) {
    const block = pcm.subarray(frameEnd(f - 1), frameEnd(f))
    const start = performance.now()
    frontEnd.push(block)
    frontEnd.read()
    if (round === 1) {
      frontEndMs += performance.now() - start
      frontEndFrames++
    }
  }
  for (let at = 0; at + QUANTUM <= pcm.length; at += QUANTUM) {
    const block = pcm.subarray(at, at + QUANTUM)
    const start = performance.now()
    emitter.push(block)
    const spent = performance.now() - start
    if (round === 1) {
      quantumTotal += spent
      quantumMax = Math.max(quantumMax, spent)
      quanta++
    }
  }
}
const frontEndPerSecond = frontEndMs / (frontEndFrames / FPS)
const quantumAverage = quantumTotal / quanta

const verdict = (ok: boolean): string => (ok ? 'PASS' : 'FAIL')
const analysisOk = total < ANALYSIS_BUDGET_MS_PER_SECOND
const workletOk = quantumAverage < WORKLET_BUDGET_MS_PER_QUANTUM
console.log('')
console.log(`${'front end'.padEnd(32)} ${frontEndPerSecond.toFixed(3).padStart(7)} ms per second of audio (band levels, energy and spectrum, in the worklet)`)
console.log(`${`worklet quantum (${QUANTUM} samples)`.padEnd(32)} average ${quantumAverage.toFixed(4)} ms, slowest ${quantumMax.toFixed(3)} ms; budget ${WORKLET_BUDGET_MS_PER_QUANTUM} ms average: ${verdict(workletOk)}`)
console.log(`${'analysis total'.padEnd(32)} ${total.toFixed(3).padStart(7)} ms per second of audio (${ANALYSIS.join(', ')}); budget ${ANALYSIS_BUDGET_MS_PER_SECOND} ms: ${verdict(analysisOk)}`)
if (!analysisOk || !workletOk) process.exitCode = 1
