import { buildSectionLog, type FrameReading, type SectionTick } from 'beatsense'

import { DrumHitWatcher, type LastDrumHits } from './drumHitWatcher'

import { countLabels, sortLabels, type Label, type LabelKind } from './labels'
import { SESSION_FORMAT, SESSION_VERSION, type DrumDetection, type LabSessionFile, type SessionPlayback } from './sessionFile'
import { frameIndexAt } from './timeline'

export type RecorderPhase = 'idle' | 'recording' | 'stopped'

/**
 * The longest recording whose section log is whole: beatsense's SectionTracker keeps only its last 48000 ticks of 50 ms (40 minutes, its
 * RECORDING_TICKS), so a longer session's log starts after the session does and replays without its beginning.
 */
export const SECTION_LOG_MAX_MS = 48000 * 50

export type { LastDrumHits } from './drumHitWatcher'

export type FileContext = {
  /**
   * The section tracker's recording (SectionTracker.getRecording). Every tick up to the session's end is kept, the ones before it too (a
   * pre-roll): the tracker's state hangs on everything it heard (whether a song is confirmed, the drop timers, the smoothing), so a fresh
   * tracker replaying the log reaches the recorded sections only if it hears what the live one heard before Record.
   */
  sectionTicks: readonly SectionTick[]
  sampleRate: number | null
  /** When the file is made; the recording's stop time, normally. */
  savedAt?: Date
  /** What the lab's player played during the recording, if it played. */
  playback?: SessionPlayback
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

  /**
   * Starts a new recording at `t` (audio clock, ms), dropping the previous one. The section tracker keeps running as it was, so Record in
   * the middle of a buildup still reads it as one; the file's section log carries its earlier ticks for the replay (see FileContext).
   */
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
  toFile = ({ sectionTicks, sampleRate, savedAt = new Date(), playback }: FileContext): LabSessionFile | null => {
    if (this.phase !== 'stopped') return null
    // Up to the end, from as far back as the tracker keeps: the ticks before startMs are the replay's pre-roll.
    const ticks = sectionTicks.filter(({ t }) => t <= this.endMs)
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
      ...(playback ? { playback } : {}),
    }
  }
}
