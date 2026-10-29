import { detectorDelayOf, median, tenth } from './lag-estimate'

// Calibrates the beat display's Lag figure: it sends silent test clicks into the audio graph, where a microphone's sound would
// enter, and times how long each takes to come out as a detected beat and as a submitted frame. What is left once the frame
// parts are taken out is the detector's own delay, which the live estimate (see lag-estimate.ts) then builds on. Run it in a quiet
// room (a real beat during the test would be matched to a click), and again after changing the bands or the Threshold. It cannot
// see the microphone and sound card before the graph, or the display after the frame is handed over.

const CLICKS = 10
const CLICK_GAP_S = 0.7
// Each click is moved later by up to this much, in a spread that never repeats, because 0.7 s is a whole number of frames at every
// frame rate (21 at 30 fps, 42 at 60, and so on): without it every click would meet the frame cycle at the same point, and a
// run would measure one lucky or unlucky wait for the next frame instead of their average.
const CLICK_JITTER_S = 0.04
const GOLDEN_FRACTION = 0.618034
const FIRST_CLICK_S = 0.4
// After the last click, how long to wait for its beat to come in.
const TAIL_S = 0.6
// The audio clock is read this many times, this far apart, to line it up with the page's clock.
const CLOCK_READS = 60
const CLOCK_READ_GAP_MS = 5
// A beat counts for a click if it lands from just before the click arrives to this long after; a later one is more likely something else in the room.
const MATCH_BEFORE_MS = 5
const MATCH_AFTER_MS = 150

/** When each click starts (audio-clock seconds), the first at `start`: about 0.7 s apart, spread across the frame cycle. */
export const clickSchedule = (start: number): number[] =>
  Array.from({ length: CLICKS }, (_, k) => start + k * CLICK_GAP_S + ((k * GOLDEN_FRACTION) % 1) * CLICK_JITTER_S)

/** One test click: when it reached the graph, when its beat was detected and when that frame was submitted (all `performance.now()` ms). */
export type LagSample = { clickAt: number, detectedAt: number | null, submittedAt: number | null }

export type LagMeasurement = {
  clicks: number
  /** How many clicks came out as a beat. */
  heard: number
  /** Median time from a click reaching the graph to its beat being detected. */
  detectMs: number
  /** Median time from a click reaching the graph to the frame that shows it being submitted to the GPU. */
  submitMs: number
  /** The slowest click, to the same point. */
  worstMs: number
  /** The drawn frame time at the time (longer than the monitor's refresh when a tier caps the frame rate). */
  frameMs: number
  /** One monitor refresh at the time: a finished frame appears at the next one. */
  refreshMs: number
  /** The page's usual time spent on a frame before handing it over, at the time. */
  workMs: number
  /** `submitMs` plus a monitor refresh: the delay to the screen, short of the monitor's own response. */
  totalMs: number
  /** The beat detector's own delay: `submitMs` less the wait for a frame and the time spent drawing. This is what gets saved. */
  detectorMs: number
  /** What the live estimate said just before this run, to check it against `totalMs`. */
  predictedMs: number
  /** False for a check, which leaves the saved detector delay alone. */
  saved: boolean
  /** When the measurement ran (`Date.now()`). */
  measuredAt: number
}

type DetectedBeat = { at: number, submittedAt: number | null }

/** Pairs each click with the first beat that follows it closely enough. */
export const matchClicks = (clickTimes: readonly number[], beats: readonly DetectedBeat[]): LagSample[] =>
  clickTimes.map((clickAt) => {
    const beat = beats.find(({ at }) => at >= clickAt - MATCH_BEFORE_MS && at <= clickAt + MATCH_AFTER_MS)
    return { clickAt, detectedAt: beat?.at ?? null, submittedAt: beat?.submittedAt ?? null }
  })

type LagContext = { frameMs: number, refreshMs: number, workMs: number, predictedMs: number, saved: boolean, measuredAt: number }

/** The medians over the clicks that were heard, or null if none was. */
export const summarizeLag = (samples: readonly LagSample[], { frameMs, refreshMs, workMs, predictedMs, saved, measuredAt }: LagContext): LagMeasurement | null => {
  const detect = samples.flatMap(({ clickAt, detectedAt }) => (detectedAt === null ? [] : [detectedAt - clickAt]))
  const submit = samples.flatMap(({ clickAt, submittedAt }) => (submittedAt === null ? [] : [submittedAt - clickAt]))
  if (detect.length === 0 || submit.length === 0) return null
  const submitMs = median(submit)
  return {
    clicks: samples.length,
    heard: detect.length,
    detectMs: tenth(median(detect)),
    submitMs: tenth(submitMs),
    worstMs: tenth(Math.max(...submit)),
    frameMs: tenth(frameMs),
    refreshMs: tenth(refreshMs),
    workMs: tenth(workMs),
    totalMs: tenth(submitMs + refreshMs),
    detectorMs: tenth(detectorDelayOf(submitMs, frameMs, workMs)),
    predictedMs: tenth(predictedMs),
    saved,
    measuredAt,
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) })

type LagProbeDeps = {
  context: Pick<BaseAudioContext, 'currentTime' | 'state'>
  /** Starts a click at the given audio-clock time (seconds), silently, at the point a microphone's sound enters. */
  injectClick: (contextTime: number) => void
  /** Calls the listener on the frame each beat is detected; returns the unsubscribe. */
  subscribeBeat: (listener: () => void) => () => void
  /** When the detector last fired (`performance.now()`), read inside the listener. */
  lastBeatTime: () => number | null
  now: () => number
  /** The page's current drawn frame time. */
  frameMs: () => number
  /** The monitor's refresh interval. */
  refreshMs: () => number
  /** The page's usual time spent on a frame before handing it over. */
  workMs: () => number
  /** The live estimate of the whole delay, read before a run so it can be checked against the measurement. */
  predictMs: () => number
  /** Called with each measurement that heard at least one click, to keep its detector delay. */
  onMeasured: (measurement: LagMeasurement) => void
}

export class LagProbe {
  private running: Promise<LagMeasurement | null> | null = null
  private last: LagMeasurement | null = null
  private beats: DetectedBeat[] = []
  private collecting = false

  constructor(private readonly deps: LagProbeDeps) {}

  /** The latest measurement, or null before the first. */
  getLast = (): LagMeasurement | null => this.last

  isRunning = (): boolean => this.running !== null

  /** Runs the calibration (about 9 seconds), or with `save` false only a check of the live estimate. Resolves null if the audio is not running or no click was heard. Asking again while it runs returns the same run. */
  measure = (save = true): Promise<LagMeasurement | null> => {
    this.running ??= this.run(save).finally(() => {
      this.running = null
    })
    return this.running
  }

  /** The render loop calls this right after it has drawn a frame, so a beat found on that frame knows when it was submitted. */
  frameSubmitted = (at: number): void => {
    if (!this.collecting) return
    const beat = this.beats[this.beats.length - 1]
    if (beat && beat.submittedAt === null) beat.submittedAt = at
  }

  // The audio clock reads a little behind the real time (it only advances a render quantum at a time), so the smallest gap seen is the closest to the truth.
  private clockOffsetMs = async (): Promise<number> => {
    const { context, now } = this.deps
    let offset = Infinity
    for (let read = 0; read < CLOCK_READS; read++) {
      offset = Math.min(offset, now() - context.currentTime * 1000)
      await sleep(CLOCK_READ_GAP_MS)
    }
    return offset
  }

  private onBeat = (): void => {
    this.beats.push({ at: this.deps.lastBeatTime() ?? this.deps.now(), submittedAt: null })
  }

  private run = async (save: boolean): Promise<LagMeasurement | null> => {
    const { context, injectClick, subscribeBeat, frameMs, refreshMs, workMs, predictMs, onMeasured } = this.deps
    if (context.state !== 'running') return null
    const predictedMs = predictMs()
    const offsetMs = await this.clockOffsetMs()
    const start = context.currentTime + FIRST_CLICK_S
    const clickTimes = clickSchedule(start)
    this.beats = []
    this.collecting = true
    const unsubscribe = subscribeBeat(this.onBeat)
    clickTimes.forEach(injectClick)
    await sleep((FIRST_CLICK_S + (CLICKS - 1) * CLICK_GAP_S + CLICK_JITTER_S + TAIL_S) * 1000)
    unsubscribe()
    this.collecting = false
    const result = summarizeLag(matchClicks(clickTimes.map((time) => offsetMs + time * 1000), this.beats), { frameMs: frameMs(), refreshMs: refreshMs(), workMs: workMs(), predictedMs, saved: save, measuredAt: Date.now() })
    if (result) {
      this.last = result
      if (save) onMeasured(result)
    }
    return result
  }
}
