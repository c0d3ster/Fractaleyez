import { buildSectionLog, type FrameReading, type SectionTick } from 'beatsense'

import { DrumHitWatcher, type LastDrumHits } from './drumHitWatcher'

import { countLabels, sortLabels, type Label, type LabelKind } from './labels'
import { SESSION_FORMAT, SESSION_VERSION, type DrumDetection, type LabSessionFile } from './sessionFile'
import { frameIndexAt } from './timeline'

export type RecorderPhase = 'idle' | 'recording' | 'stopped'

export type { LastDrumHits } from './drumHitWatcher'

export type FileContext = {
  /** The section tracker's recording (SectionTracker.getRecording); only the ticks inside the session are kept. */
  sectionTicks: readonly SectionTick[]
  sampleRate: number | null
  /** When the file is made; the recording's stop time, normally. */
  savedAt?: Date
}

/**
 * One recording at a time: Record clears the last one, every reading pushed while recording is kept, and labels are stamped on the audio
 * clock by the caller. Nothing here reads a clock or the DOM, so a test drives it with synthetic frames.
 */
export class SessionRecorder {
  private phase: RecorderPhase = 'idle'
  private startMs = 0
  private endMs = 0
  private frames: FrameReading[] = []
  private drumHits: DrumDetection[] = []
  private labels: Label[] = []
  private nextId = 1
  /** Each drum hit once, though getLastHits repeats it every frame, and none from before the start. */
  private readonly watcher = new DrumHitWatcher()

  getPhase = (): RecorderPhase => this.phase

  isRecording = (): boolean => this.phase === 'recording'

  /** Starts a new recording at `t` (audio clock, ms), dropping the previous one. */
  start = (t: number): void => {
    this.phase = 'recording'
    this.startMs = t
    this.endMs = t
    this.frames = []
    this.drumHits = []
    this.labels = []
    this.nextId = 1
    this.watcher.reset(t)
  }

  /** Stops at `t` (or at the newest frame, if that is later). A no-op unless recording. */
  stop = (t: number): void => {
    if (this.phase !== 'recording') return
    this.phase = 'stopped'
    this.endMs = Math.max(t, this.endMs)
  }

  /**
   * Keeps one reading (copied, so a reused levels array cannot change it later) and any drum hit new since the last frame. Ignored unless
   * recording, and so are frames from before the start (a frame already queued when Record was pressed).
   */
  addFrame = (reading: FrameReading, lastHits?: LastDrumHits): void => {
    if (this.phase !== 'recording' || reading.t < this.startMs) return
    this.frames.push({ ...reading, levels: [...reading.levels] })
    this.endMs = Math.max(this.endMs, reading.t)
    if (lastHits) this.watcher.newHits(lastHits).forEach((hit) => this.drumHits.push(hit))
  }

  /** Adds a label at `t` while recording; returns it, or null when not recording. */
  addLabel = (kind: LabelKind, t: number): Label | null => {
    if (this.phase !== 'recording') return null
    const label: Label = { id: this.nextId++, kind, t }
    this.labels.push(label)
    return label
  }

  /** Removes the label added last (a mistaken key press), while recording; returns it, or null. */
  undoLabel = (): Label | null => {
    if (this.phase !== 'recording') return null
    return this.labels.pop() ?? null
  }

  /** Audio clock, ms, when the recording started. */
  getStartMs = (): number => this.startMs

  /** Audio clock, ms: the newest frame's time while recording, the stop time after. */
  getEndMs = (): number => this.endMs

  /** The labels so far, oldest first (live, not a copy: read, do not change). */
  getLabels = (): readonly Label[] => this.labels

  /** The model's drum hits so far (live, not a copy), in the order they were called. */
  getDrumHits = (): readonly DrumDetection[] => this.drumHits

  /** The frames from `t` on (a new list), for the live strip's window. */
  framesSince = (t: number): FrameReading[] => this.frames.slice(frameIndexAt(this.frames, t))

  frameCount = (): number => this.frames.length

  /** How many labels of each kind, for the buttons. */
  labelCounts = (): Record<LabelKind, number> => countLabels(this.labels)

  /** Recorded length, ms. */
  durationMs = (): number => this.endMs - this.startMs

  /** The session as a file, once stopped (null before). */
  toFile = ({ sectionTicks, sampleRate, savedAt = new Date() }: FileContext): LabSessionFile | null => {
    if (this.phase !== 'stopped') return null
    const ticks = sectionTicks.filter(({ t }) => t >= this.startMs && t <= this.endMs)
    return {
      format: SESSION_FORMAT,
      version: SESSION_VERSION,
      recordedAt: savedAt.toISOString(),
      sampleRate,
      startMs: this.startMs,
      endMs: this.endMs,
      frames: [...this.frames],
      // A hit is stamped when the model calls it, a little after its onset, so two drums can arrive out of order.
      drumHits: [...this.drumHits].sort((a, b) => a.t - b.t),
      labels: sortLabels(this.labels),
      sectionLog: buildSectionLog(ticks, savedAt),
    }
  }
}
