import { AnalysisHost, AudioSource, DEFAULT_ENABLED_BANDS, DEFAULT_FEED_SETTINGS, RhythmLabeler, RollReader } from 'beatsense'
import type { FeedSettings, FrameReading, RhythmInput } from 'beatsense'
import { animationFrameTicker, type AnalysisSource, type Ticker } from 'beatsense-ui'
// The worklet entry, bundled on its own and served as its own module (see vite.config.ts); this is its URL.
import workletUrl from 'beatsense/worklet?worker&url'

import { AudioClock } from './audioClock'
import { FrameRate } from './frameRate'
import { PageFrames } from './pageFrames'
import { RollingStats, type PerfReading } from './perfStats'
import { isRiserOpen, labelKindFor, type Label, type LabelAction, type LabelKind } from './recording/labels'
import { LIVE_WINDOW_MS } from './recording/liveView'
import type { DrumDetection, LabSessionFile } from './recording/sessionFile'
import { SessionRecorder, type RecorderPhase } from './recording/sessionRecorder'

export type LabPhase = 'idle' | 'starting' | 'running' | 'failed'

/** The microphone: not open, waiting on the browser's permission prompt, open, or closed after it was open (unplugged, or access revoked). */
export type MicState = 'off' | 'asking' | 'on' | 'ended'

export type LabStatus = {
  phase: LabPhase
  mic: MicState
  /** The audio context's sample rate, Hz, while it is open. */
  sampleRate: number | null
  /** Frames that arrived from the capture worklet in the last second (60 while audio flows into it). */
  framesPerSecond: number
  /** Why the last start failed. */
  error: string | null
  /** What the page, the HUDs' drawing and the analysis cost over the last second. */
  perf: PerfReading
}

export type RecordingStatus = {
  phase: RecorderPhase
  /** Audio clock, ms, when Record was pressed. */
  startMs: number
  /** Recorded length so far, ms. */
  durationMs: number
  frames: number
  labelCounts: Record<LabelKind, number>
  /** Whether a riser is open (the riser button and R end it next). */
  riserOpen: boolean
  /** The newest label added, for the bar's feedback. */
  lastLabel: Label | null
  /** The stopped session, ready to export. */
  file: LabSessionFile | null
}

/** What the live strip draws: the session so far and the frames in its window. */
export type LiveSnapshot = {
  recording: boolean
  /** The strip's right edge, audio clock ms: now while recording, the stop time after. */
  nowMs: number
  startMs: number
  labels: readonly Label[]
  drumHits: readonly DrumDetection[]
  frames: readonly FrameReading[]
}

/** What a start was doing when it failed, for the message. */
type Stage = 'audio' | 'worklet' | 'microphone'

const errorText = (stage: Stage, err: unknown): string => {
  const detail = err instanceof Error ? err.message : String(err)
  if (stage === 'audio') return `The audio context could not start: ${detail}`
  if (stage === 'worklet') return `The capture worklet failed to load: ${detail}`
  if (err instanceof DOMException && err.name === 'NotAllowedError') return 'Microphone access was denied. Allow it for this page and press Retry.'
  if (err instanceof DOMException && err.name === 'NotFoundError') return 'No microphone was found.'
  if (err instanceof DOMException && err.name === 'NotReadableError') return 'The microphone could not be opened. Another app may be using it.'
  return `The microphone could not be opened: ${detail}`
}

/**
 * What the HUDs read, built from the running analysis the way the Fractaleyez app's main.ts hangs its getters on `window`. Every time is on
 * the audio clock: the analysers stamp theirs from the frames, and `now`, the rhythm name's hold and the snare roll read that clock too.
 */
const createSource = (host: AnalysisHost, clock: AudioClock, snareRoll: RollReader, settings: () => FeedSettings): AnalysisSource => {
  const { beatMonitor, tempoTracker, beatGrid, sectionTracker, drumHits, riserDetector, sweepDetector } = host.analysers
  const rhythmLabeler = new RhythmLabeler()
  const rhythmInput = (): RhythmInput => {
    const bpm = tempoTracker.getBpm()
    return { bandOnsets: beatMonitor.getBandOnsets(), periodMs: bpm === null ? null : 60000 / bpm }
  }
  return {
    now: clock.now,
    getBeatTimeline: beatMonitor.getTimeline,
    getBeatTimes: beatMonitor.getBeatTimes,
    getTempo: tempoTracker.getReading,
    getBeatGrid: beatGrid.getState,
    getRhythmLabel: () => rhythmLabeler.read(rhythmInput(), clock.now()),
    getSnareRoll: snareRoll.current,
    getDrumHits: drumHits.getLastHits,
    getRiser: riserDetector.getScore,
    getSweep: sweepDetector.getScore,
    getSongSection: sectionTracker.getState,
    getSectionHistory: sectionTracker.getHistory,
    // The app takes these from its Audio config and the Frequency HUD's toggles; the lab uses the package defaults and the toggles.
    getEnabledBands: () => settings().enabledBands,
    getIgnoreMs: () => settings().ignoreMs,
  }
}

/**
 * The lab's live analysis: the audio context, the capture worklet, the microphone and the analysers, started by a click (a browser only
 * lets an audio context run after a user gesture). The analysis runs here on the page's thread through beatsense's AnalysisHost, so the
 * HUDs can read the analysers directly.
 */
export class LabSession {
  private phase: LabPhase = 'idle'
  private mic: MicState = 'off'
  private error: string | null = null
  private settings: FeedSettings = { ...DEFAULT_FEED_SETTINGS, enabledBands: [...DEFAULT_ENABLED_BANDS] }
  private context: AudioContext | null = null
  private capture: AudioSource | null = null
  private stream: MediaStream | null = null
  private host: AnalysisHost | null = null
  private source: AnalysisSource | null = null
  private clock: AudioClock | null = null
  private readonly recorder = new SessionRecorder()
  private lastLabel: Label | null = null
  private file: LabSessionFile | null = null
  private readonly frameRate = new FrameRate()
  private readonly pageFrames = new PageFrames()
  private readonly drawTimes = new RollingStats()
  private readonly analysisTimes = new RollingStats()

  /** The HUDs' ticker (the package default, 30 a second), timing each redraw for the status line. */
  readonly ticker: Ticker = (listener, element) => animationFrameTicker((now) => {
    const started = performance.now()
    listener(now)
    this.drawTimes.add(performance.now() - started, started)
  }, element)

  /** Starts counting the page's frames for the status line (stopped by the returned function). */
  watchFrames = (): (() => void) => {
    this.pageFrames.start()
    return this.pageFrames.stop
  }

  /** Opens the audio and starts the analysis. Never rejects: a failure shows in `status().error`, and calling it again retries. */
  start = async (): Promise<void> => {
    if (this.phase === 'starting' || this.phase === 'running') return
    this.phase = 'starting'
    this.error = null
    let stage: Stage = 'audio'
    try {
      const context = new AudioContext()
      this.context = context
      // Made inside a click, so the browser lets it run; resumed in case it started suspended anyway.
      await context.resume()
      const capture = new AudioSource({ context, workletUrl })
      this.capture = capture
      stage = 'worklet'
      await capture.start()
      stage = 'microphone'
      this.mic = 'asking'
      const microphone = await capture.connectMicrophone()
      this.stream = microphone.mediaStream
      this.mic = 'on'
      microphone.mediaStream.getAudioTracks().forEach((track) => track.addEventListener('ended', this.handleMicEnded))
      this.run(context, capture, microphone)
      this.phase = 'running'
    } catch (err) {
      this.fail(errorText(stage, err))
    }
  }

  status = (): LabStatus => ({
    phase: this.phase,
    mic: this.mic,
    sampleRate: this.context?.sampleRate ?? null,
    framesPerSecond: this.frameRate.perSecond(performance.now()),
    error: this.error,
    perf: this.perf(performance.now()),
  })

  private perf = (now: number): PerfReading => {
    const page = this.pageFrames.read(now)
    const analysis = this.analysisTimes.read(now)
    return {
      pageFps: page.fps,
      worstFrameMs: page.worstMs,
      drawMs: this.drawTimes.read(now).mean,
      analysisMs: analysis.mean,
      // Analysis time over the last second, as a share of that second.
      analysisShare: analysis.total / 1000,
    }
  }

  /** What the HUDs read, once started. */
  getSource = (): AnalysisSource | null => this.source

  getEnabledBands = (): readonly boolean[] => this.settings.enabledBands

  /** Which onset bands can set off a beat (the Frequency HUD's toggles), applied from the next frame. */
  setEnabledBands = (enabledBands: readonly boolean[]): void => {
    this.settings = { ...this.settings, enabledBands: [...enabledBands] }
    this.host?.setSettings(this.settings)
  }

  /** Starts a recording (dropping the last one) at the audio clock's now. A no-op until the analysis runs. */
  startRecording = (): void => {
    if (!this.clock || this.recorder.isRecording()) return
    this.recorder.start(this.clock.now())
    this.lastLabel = null
    this.file = null
  }

  /** Stops the recording and makes its file, with the section tracker's ticks from the session. */
  stopRecording = (): LabSessionFile | null => {
    if (!this.clock || !this.host || !this.recorder.isRecording()) return null
    this.recorder.stop(this.clock.now())
    this.file = this.recorder.toFile({
      sectionTicks: this.host.analysers.sectionTracker.getRecording(),
      sampleRate: this.context?.sampleRate ?? null,
    })
    return this.file
  }

  /**
   * Adds a label at the audio clock's now: the newest audio delivered, so the label lands where the person heard the hit, plus their
   * reaction time (moved on the review page). Null when not recording.
   */
  addLabel = (action: LabelAction): Label | null => {
    if (!this.clock) return null
    const label = this.recorder.addLabel(labelKindFor(action, this.recorder.getLabels()), this.clock.now())
    if (label) this.lastLabel = label
    return label
  }

  /** Removes the newest label (a mistaken press) while recording. */
  undoLabel = (): Label | null => {
    const label = this.recorder.undoLabel()
    if (label) this.lastLabel = null
    return label
  }

  recordingStatus = (): RecordingStatus => ({
    phase: this.recorder.getPhase(),
    startMs: this.recorder.getStartMs(),
    durationMs: this.recorder.durationMs(),
    frames: this.recorder.frameCount(),
    labelCounts: this.recorder.labelCounts(),
    riserOpen: isRiserOpen(this.recorder.getLabels()),
    lastLabel: this.lastLabel,
    file: this.file,
  })

  /**
   * The session for the live strip, with the frames of the last `windowMs`, or null before the first Record. Reads the recorder's lists in
   * place (no copies at 30 a second).
   */
  liveSnapshot = (windowMs: number = LIVE_WINDOW_MS): LiveSnapshot | null => {
    const phase = this.recorder.getPhase()
    if (phase === 'idle') return null
    const recording = phase === 'recording'
    const nowMs = recording && this.clock ? this.clock.now() : this.recorder.getEndMs()
    return {
      recording,
      nowMs,
      startMs: this.recorder.getStartMs(),
      labels: this.recorder.getLabels(),
      drumHits: this.recorder.getDrumHits(),
      frames: this.recorder.framesSince(nowMs - windowMs),
    }
  }

  private run = (context: AudioContext, capture: AudioSource, microphone: MediaStreamAudioSourceNode): void => {
    const host = new AnalysisHost()
    host.setSettings(this.settings)
    const clock = new AudioClock()
    const snareRoll = new RollReader()
    const { drumHits, tempoTracker } = host.analysers
    // Every frame the worklet measures goes to the analysis, whatever the display is doing; the riser and sweep are always shown here, so
    // the frames always carry the spectrum (the AudioSource and AnalysisHost default).
    capture.onFrame((frame) => {
      const started = performance.now()
      const reading = host.push(frame)
      const { t } = reading
      this.analysisTimes.add(performance.now() - started, started)
      clock.observe(t)
      if (this.recorder.isRecording()) this.recorder.addFrame(reading, drumHits.getLastHits())
      this.frameRate.count(performance.now())
      // The app ticks the roll on each drawn frame; here on each analysed frame, on the analysis clock. It reads at most 20 times a second.
      snareRoll.tick(drumHits.getRollHits, tempoTracker.getPeriodMs(), t)
    })
    // Through a unity gain, as the app routes the microphone through its volume.
    const gain = context.createGain()
    microphone.connect(gain)
    gain.connect(capture.input)
    this.host = host
    this.clock = clock
    this.source = createSource(host, clock, snareRoll, () => this.settings)
  }

  private handleMicEnded = (): void => {
    this.mic = 'ended'
  }

  private fail = (message: string): void => {
    console.error(`beatsense lab: ${message}`)
    this.capture?.stop()
    this.stream?.getTracks().forEach((track) => track.stop())
    this.context?.close().catch(() => undefined)
    this.capture = null
    this.stream = null
    this.context = null
    this.host = null
    this.clock = null
    this.source = null
    this.mic = 'off'
    this.phase = 'failed'
    this.error = message
  }
}
