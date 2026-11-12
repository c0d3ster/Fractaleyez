import { FrontEnd } from '../frontend'
import type { SongSection } from '../sections'
import { createAnalysers } from './analysers'
import type { Analysers } from './analysers'
import { AudioFeed } from './audio-feed'
import type { AudioFeedOptions, AudioFrame } from './audio-feed'

export type AnalyzeOptions = AudioFeedOptions & {
  /** Frames a second (default 60, what the app runs and the models were trained at). */
  fps?: number
}

/** Mono PCM in the range -1..1. */
export type PcmInput = { pcm: Float32Array | Float64Array | readonly number[]; sampleRate: number }

/** Band levels a frame (five each, RMS in percent of full scale), for example from scripts/section-eval/levels.py. Energy is taken as nonzero. */
export type LevelsInput = { levels: readonly (readonly number[])[] }

/** What the analysers said at the end of one frame. */
export type FrameReading = {
  /** The frame's time in ms from the start of the audio. */
  t: number
  levels: number[]
  /** True on the frame a beat fires. */
  beat: boolean
  /** The band that set the beat off, or null. */
  beatBand: number | null
  bpm: number | null
  section: SongSection
  /** Riser and sweep scores. */
  riser: number
  sweep: number
}

export type Analysis = {
  frames: FrameReading[]
  /** The analysers after the last frame, for anything not in the per-frame reading (hit lists, the grid, the section history). */
  analysers: Analysers
}

/**
 * Analyse a whole recording: PCM (through the front end) or band levels in, a reading per frame out. Frame f ends at sample
 * floor(f * sampleRate / fps), as levels.py cuts it, and its time is f / fps seconds on the audio clock.
 */
export const analyze = (input: PcmInput | LevelsInput, options: AnalyzeOptions = {}): Analysis => {
  const { fps = 60, ...feedOptions } = options
  // The beat monitor trims what it returns against its clock, so that clock is the audio's: the time of the frame just pushed.
  let now = 0
  const analysers = createAnalysers(() => now)
  const feed = new AudioFeed(analysers, feedOptions)
  const frameMs = 1000 / fps
  const frames: FrameReading[] = []

  const run = (frame: AudioFrame): void => {
    now = frame.t
    const { onset } = feed.push(frame)
    frames.push({
      t: frame.t,
      levels: frame.levels,
      beat: onset.beat.fresh,
      beatBand: onset.beatBand,
      bpm: analysers.tempoTracker.getBpm(),
      section: analysers.sectionTracker.getState().section,
      riser: analysers.riserDetector.getScore(),
      sweep: analysers.sweepDetector.getScore(),
    })
  }

  if ('levels' in input) {
    input.levels.forEach((levels, f) => run({ t: f * frameMs, deltaMs: frameMs, levels: [...levels], energy: 1 }))
    return { frames, analysers }
  }

  const { pcm, sampleRate } = input
  const frontEnd = new FrontEnd(sampleRate, { spectrum: feed.wantsSpectrum() })
  const count = Math.floor((pcm.length / sampleRate) * fps)
  let fed = 0
  for (let f = 0; f < count; f++) {
    const end = Math.floor((f * sampleRate) / fps)
    frontEnd.push(pcm.slice(fed, end))
    fed = end
    const { levels, energy, spectrum } = frontEnd.read()
    run({ t: f * frameMs, deltaMs: frameMs, levels, energy, spectrum })
  }
  return { frames, analysers }
}
