// Replays a fixed, seeded piece of synthetic music through the real AudioFeed and AudioAnalyser frame by frame (a measured capture frame
// pushed, then a drawn frame ticked, every 1/60 s) and checks that every analyser says exactly what it said when
// audio-feed.equivalence.golden.json was recorded. It is there for refactors that must not change the analysis: the output is hashed, so
// any difference at all fails it. The golden was re-recorded for the worklet capture (frames at a fixed hop, timed by their index).
//
//   pnpm vitest run src/audioanalysis/audio-feed.equivalence.test.ts
//   UPDATE_GOLDEN=1 ...      rewrites the golden (only for an intended change in the analysis output)
//   SECTION_LOG_OUT=<file>   also writes the section tracker's recording as a section log, for scripts/section-eval/replay-log.mts
import { createHash, type Hash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildSectionLog, DRUM_KINDS, nameRhythm, RhythmLabeler, SectionTracker, SpectrumReducer, type CaptureFrame, type DrumKind, type RhythmInput, type SongSection } from 'beatsense'
import { createAudioAnalysis } from '../audio'
import { AudioData } from '../audiostream/audio-data'
import { analyserConfig } from '../config/analyser.config'
import { AudioAnalyser } from './audio-analyser'
import { AudioFeed, type AudioFeedStream } from './audio-feed'

const GOLDEN = new URL('./audio-feed.equivalence.golden.json', import.meta.url)

const FPS = 60
const FRAME_MS = 1000 / FPS
const SAMPLE_RATE = 48000
// FFT_SIZE 512 in main.ts: 256 bins of frequency and time-domain data.
const BINS = 256
const BIN_HZ = SAMPLE_RATE / 2 / BINS
const BAND_EDGES_HZ = [40, 150, 500, 2000, 6000, 16000]
const BANDS = 5
// Every this many frames the slower reads (beat times, band onsets, rhythm, hit lists, the newest section slot) go into the record too.
const PERIODIC_EVERY = 30
const CHECKPOINT_EVERY = FPS * 10

/* eslint-disable no-bitwise */
/** Seeded generator (mulberry32), so the music is the same on every run and machine. */
const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/* eslint-enable no-bitwise */

type Drum = 'kick' | 'snare' | 'clap' | 'hat'

// What each drum adds to the five onset bands (bass, lo, mid, hi, air), in percent of full scale, and how fast it decays.
const DRUM_SOUND: Record<Drum, { bands: readonly number[]; tauMs: number }> = {
  kick: { bands: [30, 12, 3, 0.5, 0.2], tauMs: 90 },
  snare: { bands: [1, 10, 18, 9, 4], tauMs: 70 },
  clap: { bands: [0.5, 4, 14, 12, 5], tauMs: 45 },
  hat: { bands: [0, 0, 0.5, 4, 9], tauMs: 25 },
}

type Hit = { t: number; drum: Drum; velocity: number }

type Part = {
  name: string
  fromS: number
  toS: number
  bpm: number
  /** Hits per beat for each drum, from the part's first beat; 0.5 is every other beat, `backbeat` is beats 2 and 4. */
  drums: Partial<Record<Drum, number | 'backbeat'>>
  /** Steady band levels under the drums. */
  bed: readonly number[]
  /** The buildup's snare roll: hits per beat over the part, in steps. */
  roll?: readonly number[]
  riser?: boolean
  sweep?: boolean
}

// About two and a half minutes: silence (the feed waits for the first sound), hats, a groove, a buildup (snare roll speeding up, a riser,
// a sweeping tone), a drop, a break, a faster groove (a tempo change, maybe a new song) and silence again.
const PARTS: readonly Part[] = [
  { name: 'silence', fromS: 0, toS: 3, bpm: 124, drums: {}, bed: [0, 0, 0, 0, 0] },
  { name: 'intro', fromS: 3, toS: 19, bpm: 124, drums: { hat: 2 }, bed: [1, 1.5, 2, 1, 0.8] },
  { name: 'groove', fromS: 19, toS: 51, bpm: 124, drums: { kick: 1, snare: 'backbeat', hat: 2 }, bed: [6, 4, 3, 1.5, 1] },
  { name: 'buildup', fromS: 51, toS: 67, bpm: 124, drums: { hat: 2 }, bed: [2, 3, 4, 2, 1.5], roll: [1, 1, 1, 2, 2, 4, 4, 4], riser: true, sweep: true },
  { name: 'drop', fromS: 67, toS: 98, bpm: 124, drums: { kick: 1, clap: 'backbeat', hat: 4 }, bed: [12, 6, 4, 2, 1.5] },
  { name: 'break', fromS: 98, toS: 114, bpm: 124, drums: {}, bed: [1, 2, 8, 3, 2] },
  { name: 'groove140', fromS: 114, toS: 150, bpm: 140, drums: { kick: 1, snare: 'backbeat', hat: 2 }, bed: [7, 4, 3, 1.5, 1] },
  { name: 'silence', fromS: 150, toS: 155, bpm: 140, drums: {}, bed: [0, 0, 0, 0, 0] },
]
const END_MS = (PARTS[PARTS.length - 1]?.toS ?? 0) * 1000

const scheduleHits = (random: () => number): Hit[] => {
  const hits: Hit[] = []
  const push = (t: number, drum: Drum, velocity: number): void => {
    hits.push({ t: t + (random() - 0.5) * 6, drum, velocity: velocity * (0.9 + random() * 0.2) })
  }
  PARTS.forEach(({ fromS, toS, bpm, drums, roll }) => {
    const beatMs = 60000 / bpm
    const fromMs = fromS * 1000
    const toMs = toS * 1000
    const beats = Math.floor((toMs - fromMs) / beatMs)
    for (let beat = 0; beat < beats; beat++) {
      const at = fromMs + beat * beatMs
      Object.entries(drums).forEach(([drum, perBeat]) => {
        if (drum !== 'kick' && drum !== 'snare' && drum !== 'clap' && drum !== 'hat') return
        if (perBeat === 'backbeat') {
          if (beat % 2 === 1) push(at, drum, 1)
          return
        }
        if (perBeat === undefined) return
        for (let n = 0; n < perBeat; n++) push(at + (n * beatMs) / perBeat, drum, drum === 'hat' && n % 2 === 1 ? 0.6 : 1)
      })
      if (roll) {
        const step = roll[Math.min(roll.length - 1, Math.floor((beat / beats) * roll.length))] ?? 1
        // The roll gets louder toward the drop.
        for (let n = 0; n < step; n++) push(at + (n * beatMs) / step, 'snare', 0.5 + (0.5 * beat) / beats)
      }
    }
  })
  return hits.sort((a, b) => a.t - b.t)
}

const partAt = (t: number): Part => PARTS.find(({ toS }) => t < toS * 1000) ?? PARTS[PARTS.length - 1]!

type Frame = { levels: number[]; audio: AudioData }

/** The synthetic music, one frame at a time: the five band levels and the FFT and time-domain bytes the analyser node would give. */
const createMusic = (seed: number): ((t: number) => Frame) => {
  const random = createRandom(seed)
  const hits = scheduleHits(random)
  let firstLive = 0
  let phase = 0
  return (t: number): Frame => {
    const part = partAt(t)
    const progress = (t - part.fromS * 1000) / ((part.toS - part.fromS) * 1000)
    const levels = part.bed.map((level) => level * (1 + 0.05 * Math.sin(t / 700)))
    while (firstLive < hits.length && t - (hits[firstLive]?.t ?? t) > 600) firstLive++
    for (let i = firstLive; i < hits.length; i++) {
      const hit = hits[i]!
      if (hit.t > t) break
      const { bands, tauMs } = DRUM_SOUND[hit.drum]
      const envelope = hit.velocity * Math.exp(-(t - hit.t) / tauMs)
      for (let b = 0; b < BANDS; b++) levels[b] = (levels[b] ?? 0) + (bands[b] ?? 0) * envelope
    }
    if (part.riser) {
      const rise = progress ** 2
      levels[2] = (levels[2] ?? 0) + 3 * rise
      levels[3] = (levels[3] ?? 0) + 10 * rise
      levels[4] = (levels[4] ?? 0) + 12 * rise
    }
    // The sweep: a tone climbing from 400 Hz to 10 kHz over the part.
    const sweepHz = part.sweep ? 400 * 25 ** progress : null
    if (sweepHz !== null) {
      const band = BAND_EDGES_HZ.findIndex((edge, b) => sweepHz >= edge && sweepHz < (BAND_EDGES_HZ[b + 1] ?? Infinity))
      if (band >= 0 && band < BANDS) levels[band] = (levels[band] ?? 0) + 5
    }
    const silent = part.bed.every((level) => level === 0) && levels.every((level) => level < 0.01)
    const noisy = levels.map((level) => (silent ? 0 : level + 0.3 + 0.1 * random()))

    const frequencyData = new Uint8Array(BINS)
    for (let i = 0; i < BINS; i++) {
      const hz = (i + 0.5) * BIN_HZ
      const band = Math.max(0, Math.min(BANDS - 1, BAND_EDGES_HZ.findIndex((edge) => hz < edge) - 1))
      let binAmplitude = silent ? 0 : (noisy[band] ?? 0) / 100
      if (sweepHz !== null) binAmplitude += 0.08 * Math.exp(-(((hz - sweepHz) / (sweepHz * 0.08)) ** 2))
      const db = 20 * Math.log10(binAmplitude + 1e-6)
      frequencyData[i] = silent ? 0 : Math.max(0, Math.min(255, Math.round(((db + 100) / 70) * 255 + random() * 4)))
    }
    const total = Math.sqrt(noisy.reduce((sum, level) => sum + level * level, 0))
    const amplitude = Math.min(120, total * 1.5)
    phase += 0.37
    const timedomainData = new Uint8Array(BINS)
    for (let i = 0; i < BINS; i++) {
      timedomainData[i] = silent ? 128 : Math.max(0, Math.min(255, Math.round(128 + amplitude * Math.sin(phase + (2 * Math.PI * 7 * i) / BINS) + (random() - 0.5) * 2)))
    }
    return { levels: noisy, audio: new AudioData(timedomainData, frequencyData, BINS) }
  }
}

type Coverage = {
  frames: number
  beats: number
  beatListenerCalls: number
  framesWithTempo: number
  bpmsSeen: number[]
  maxGridBeat: number
  sections: SongSection[]
  maxDropCount: number
  maxSongIndex: number
  drumHits: Record<DrumKind, number>
  maxRiser: number
  maxSweep: number
  rhythmNames: string[]
  recordedTicks: number
  replayedSlots: number
}

type EquivalenceResult = {
  hashes: { frames: string; periodic: string; recording: string; replay: string }
  /** The frame hash every 10 s, so a mismatch shows when the output first differs. */
  checkpoints: string[]
  coverage: Coverage
}

const update = (hash: Hash, value: unknown): void => {
  hash.update(JSON.stringify(value))
  hash.update('\n')
}

const run = (): EquivalenceResult => {
  let clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  const { threshold_DEFAULT: soundThreshold, ignoreTime_DEFAULT: ignoreTime } = analyserConfig.options.peakDetection.options
  vi.stubGlobal('window', { config: { audio: { soundThreshold: { value: soundThreshold }, ignoreTime: { value: ignoreTime } } } })

  const music = createMusic(20261111)
  let frame: Frame = music(0)
  const stream: AudioFeedStream = { getAudioData: () => frame.audio }
  const reducer = new SpectrumReducer(SAMPLE_RATE, BINS)
  // What the worklet's front end would measure from this frame: the band levels, the energy (mean distance of the time-domain bytes from 128) and the pooled spectrum.
  const captureOf = (index: number): CaptureFrame => {
    const { levels, audio } = frame
    const energy = audio.timedomainData.reduce((sum, byte) => sum + Math.abs(byte - 128), 0) / audio.timedomainData.length
    return { index, levels, energy, spectrum: Uint8Array.from(reducer.reduce(audio.frequencyData)) }
  }
  const analysis = createAudioAnalysis()
  const { beatMonitor, tempoTracker, beatGrid, sectionTracker, drumHits, riserDetector, sweepDetector } = analysis
  const feed = new AudioFeed(stream, new AudioAnalyser(BINS), analysis)
  const rhythmLabeler = new RhythmLabeler()
  let beatListenerCalls = 0
  beatMonitor.subscribe(() => {
    beatListenerCalls++
  })

  const frames = createHash('sha256')
  const periodic = createHash('sha256')
  const checkpoints: string[] = []
  const coverage: Coverage = {
    frames: 0, beats: 0, beatListenerCalls: 0, framesWithTempo: 0, bpmsSeen: [], maxGridBeat: 0, sections: [], maxDropCount: 0, maxSongIndex: 0,
    drumHits: { kick: 0, hat: 0, snare: 0, clap: 0 }, maxRiser: 0, maxSweep: 0, rhythmNames: [], recordedTicks: 0, replayedSlots: 0,
  }
  let lastHits = drumHits.getLastHits()
  const start = Date.UTC(2026, 0, 1)

  for (let n = 0; clock < END_MS; n++) {
    clock = n * FRAME_MS
    frame = music(clock)
    feed.push(captureOf(n + 1), clock)
    const snapshot = feed.tick(FRAME_MS, new Date(start + Math.round(clock)))
    const samples = beatMonitor.getTimeline().samples
    const section = sectionTracker.getState()
    const reading = tempoTracker.getReading()
    const grid = beatGrid.getState()
    const hitsNow = drumHits.getLastHits()
    update(frames, [
      snapshot.beat, samples[samples.length - 1] ?? null, reading, grid, beatGrid.getActivation(), section, hitsNow,
      riserDetector.getScore(), sweepDetector.getScore(), feed.isSilent(),
    ])

    coverage.frames++
    if (snapshot.beat.fresh) coverage.beats++
    if (reading) {
      coverage.framesWithTempo++
      const bpm = Math.round(reading.bpm)
      if (!coverage.bpmsSeen.includes(bpm)) coverage.bpmsSeen.push(bpm)
    }
    coverage.maxGridBeat = Math.max(coverage.maxGridBeat, grid?.beat ?? 0)
    if (coverage.sections[coverage.sections.length - 1] !== section.section) coverage.sections.push(section.section)
    coverage.maxDropCount = Math.max(coverage.maxDropCount, section.dropCount)
    coverage.maxSongIndex = Math.max(coverage.maxSongIndex, section.songIndex)
    DRUM_KINDS.forEach((kind) => {
      if (hitsNow[kind] !== lastHits[kind]) coverage.drumHits[kind]++
    })
    lastHits = hitsNow
    coverage.maxRiser = Math.max(coverage.maxRiser, riserDetector.getScore())
    coverage.maxSweep = Math.max(coverage.maxSweep, sweepDetector.getScore())

    if (n % PERIODIC_EVERY === 0) {
      const bpm = tempoTracker.getBpm()
      const input: RhythmInput = { bandOnsets: beatMonitor.getBandOnsets(), periodMs: bpm === null ? null : 60000 / bpm }
      const name = nameRhythm(input)
      const history = sectionTracker.getHistory()
      update(periodic, [
        beatMonitor.getBeatTimes(), input.bandOnsets, name, rhythmLabeler.read(input, clock), drumHits.getHits(), drumHits.getRollHits(),
        tempoTracker.getOnsets(), history.length, history[history.length - 1] ?? null,
      ])
      if (name !== null && !coverage.rhythmNames.includes(name)) coverage.rhythmNames.push(name)
    }
    if ((n + 1) % CHECKPOINT_EVERY === 0) checkpoints.push(frames.copy().digest('hex').slice(0, 16))
  }
  coverage.beatListenerCalls = beatListenerCalls

  // The recording, replayed tick by tick through a fresh tracker the way scripts/section-eval/replay-log.mts does.
  const ticks = sectionTracker.getRecording()
  coverage.recordedTicks = ticks.length
  const recording = createHash('sha256')
  update(recording, ticks)
  const log = buildSectionLog(ticks, new Date(start))
  if (process.env.SECTION_LOG_OUT) writeFileSync(process.env.SECTION_LOG_OUT, JSON.stringify(log))
  const replay = createHash('sha256')
  const replayTracker = new SectionTracker()
  log.ticks.forEach((tick) => {
    replayTracker.pushTick(tick)
    update(replay, replayTracker.getState())
  })
  coverage.replayedSlots = replayTracker.getHistory().length

  return {
    hashes: { frames: frames.digest('hex'), periodic: periodic.digest('hex'), recording: recording.digest('hex'), replay: replay.digest('hex') },
    checkpoints,
    coverage,
  }
}

const isEquivalenceResult = (value: unknown): value is EquivalenceResult =>
  typeof value === 'object' && value !== null && 'hashes' in value && 'checkpoints' in value && 'coverage' in value

describe('AudioFeed equivalence', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('gives exactly the recorded analysis for the synthetic song', () => {
    const result = run()
    if (process.env.UPDATE_GOLDEN) {
      writeFileSync(GOLDEN, `${JSON.stringify(result, null, 2)}\n`)
      return
    }
    expect(existsSync(GOLDEN)).toBe(true)
    const golden: unknown = JSON.parse(readFileSync(GOLDEN, 'utf8'))
    expect(isEquivalenceResult(golden)).toBe(true)
    expect(result).toEqual(golden)
  }, 60000)
})
