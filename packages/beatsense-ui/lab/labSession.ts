import { AnalysisHost, AudioSource, DEFAULT_ENABLED_BANDS, DEFAULT_FEED_SETTINGS, RhythmLabeler, RollReader } from 'beatsense'
import type { FeedSettings, RhythmInput } from 'beatsense'
import type { AnalysisSource } from 'beatsense-ui'
// The worklet entry, bundled on its own and served as its own module (see vite.config.ts); this is its URL.
import workletUrl from 'beatsense/worklet?worker&url'

import { AudioClock } from './audioClock'
import { FrameRate } from './frameRate'

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
  private readonly frameRate = new FrameRate()

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
  })

  /** What the HUDs read, once started. */
  getSource = (): AnalysisSource | null => this.source

  getEnabledBands = (): readonly boolean[] => this.settings.enabledBands

  /** Which onset bands can set off a beat (the Frequency HUD's toggles), applied from the next frame. */
  setEnabledBands = (enabledBands: readonly boolean[]): void => {
    this.settings = { ...this.settings, enabledBands: [...enabledBands] }
    this.host?.setSettings(this.settings)
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
      const { t } = host.push(frame)
      clock.observe(t)
      this.frameRate.count(performance.now())
      // The app ticks the roll on each drawn frame; here on each analysed frame, on the analysis clock. It reads at most 20 times a second.
      snareRoll.tick(drumHits.getRollHits, tempoTracker.getPeriodMs(), t)
    })
    // Through a unity gain, as the app routes the microphone through its volume.
    const gain = context.createGain()
    microphone.connect(gain)
    gain.connect(capture.input)
    this.host = host
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
    this.source = null
    this.mic = 'off'
    this.phase = 'failed'
    this.error = message
  }
}
