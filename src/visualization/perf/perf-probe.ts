import { GpuResult, GpuTimer, GpuTimerFaults, TimerExtension, TimerGl } from './gpu-timer'
import { LongFrameRecorder, LongFrameSummary } from './long-frames'
import { SampleStats, Samples } from './samples'

export type GpuTimerStatus = 'not attached' | 'unavailable' | 'ready'

export type SectionSummary = { cpu: SampleStats | null; gpu: SampleStats | null }

export type ProbeSummary = {
  enabled: boolean
  gpuTimer: GpuTimerStatus
  gpuFaults: GpuTimerFaults | null
  frames: number
  /** Time between the start of one drawn frame and the next, and how many ran long. */
  gap: SampleStats | null
  gapOver25: number
  gapOver50: number
  /** From the start of the frame callback until the last draw call was submitted (CPU only, the GPU may still be working). */
  cpu: SampleStats | null
  /** All timed sections of one frame added up on the GPU. */
  gpuFrame: SampleStats | null
  sections: Record<string, SectionSummary>
  counters: Record<string, number>
  /** Live readings taken when the summary is asked for (three.js geometry, texture and program counts), for spotting what grows. */
  gauges: Record<string, number>
  /** Time from one named stamp to another, e.g. a config change to the pop-out window showing it. */
  latencies: Record<string, SampleStats | null>
  longFrames: Record<string, LongFrameSummary>
}

type Section = { cpu: Samples; gpu: Samples; start: number; gpuOpen: boolean }

// A gap this long is a background tab or a debugger pause, not a frame.
const GAP_MAX_MS = 2000
const HITCH_MS = 25
const STUTTER_MS = 50

export type PerfProbeOptions = {
  now?: () => number
}

/**
 * Measures where a frame's time goes, for the benchmark scripts and for looking at the page by hand. Off by default: every call
 * returns at once, so the draw loop pays a branch per call. When on it records, per named section, the CPU time to submit the work
 * and (where the browser allows) the GPU time it took, plus frame gaps, long animation frames of each watched window, counters, and
 * stamp-to-stamp latencies. Read the result with `summary()` (the page exposes it as `window.getPerfProbe`).
 */
export class PerfProbe {
  private enabled = false
  private readonly now: () => number
  private readonly sections = new Map<string, Section>()
  private readonly counters = new Map<string, number>()
  private readonly stamps = new Map<string, number>()
  private readonly gauges = new Map<string, () => number>()
  private readonly latencies = new Map<string, Samples>()
  private readonly windows = new Map<string, LongFrameRecorder>()
  private readonly gap = new Samples()
  private readonly cpu = new Samples()
  private readonly gpuFrame = new Samples()
  private gl: WebGL2RenderingContext | null = null
  private gpuTimer: GpuTimer | null = null
  private status: GpuTimerStatus = 'not attached'
  private frames = 0
  private frameStartedAt = 0
  private lastFrameStartedAt = 0
  private gapOver25 = 0
  private gapOver50 = 0
  // The GPU time of one frame arrives as several results, a few frames late; they are added up per frame tag.
  private gpuTag = -1
  private gpuAccumulated = 0

  constructor({ now = () => performance.now() }: PerfProbeOptions = {}) {
    this.now = now
  }

  isEnabled = (): boolean => this.enabled

  enable = (): void => {
    if (this.enabled) return
    this.enabled = true
    this.startGpuTimer()
  }

  disable = (): void => {
    this.enabled = false
    this.gpuTimer?.dispose()
    this.gpuTimer = null
    this.sections.forEach((section) => { section.gpuOpen = false })
  }

  /**
   * Gives the probe the page's WebGL context. GPU timing needs WebGL2 and `EXT_disjoint_timer_query_webgl2`, which a browser may hide
   * (it is off in some privacy modes); without it the probe still records CPU times and the status says why there is no GPU column.
   */
  attachGl = (gl: WebGLRenderingContext | WebGL2RenderingContext): void => {
    this.gl = 'createQuery' in gl ? gl : null
    this.status = this.gl && this.gl.getExtension('EXT_disjoint_timer_query_webgl2') ? 'ready' : 'unavailable'
    if (this.enabled) this.startGpuTimer()
  }

  /** Watches a window's long animation frames under a label ('page', 'popup'). The pop-out window has its own timeline. */
  watchWindow = (label: string, win: Window): void => {
    this.windows.get(label)?.disconnect()
    this.windows.set(label, new LongFrameRecorder(win))
  }

  unwatchWindow = (label: string): void => {
    this.windows.get(label)?.disconnect()
    this.windows.delete(label)
  }

  /** Call at the top of each drawn frame. */
  frameStart = (): void => {
    if (!this.enabled) return
    this.frameStartedAt = this.now()
    this.frames++
    if (this.lastFrameStartedAt > 0) {
      const gap = this.frameStartedAt - this.lastFrameStartedAt
      if (gap < GAP_MAX_MS) {
        this.gap.push(gap)
        if (gap > HITCH_MS) this.gapOver25++
        if (gap > STUTTER_MS) this.gapOver50++
      }
    }
    this.lastFrameStartedAt = this.frameStartedAt
    this.gpuTimer?.collect(this.takeGpuResult)
  }

  /** Call after the last draw call of the frame. */
  frameEnd = (): void => {
    if (!this.enabled) return
    this.cpu.push(this.now() - this.frameStartedAt)
  }

  /** Starts timing a section; `gpu` also times it on the GPU (sections that use it must not overlap each other). */
  begin = (name: string, gpu = false): void => {
    if (!this.enabled) return
    const section = this.sectionFor(name)
    section.gpuOpen = gpu && this.gpuTimer !== null && this.gpuTimer.begin(name, this.frames)
    section.start = this.now()
  }

  end = (name: string): void => {
    if (!this.enabled) return
    const section = this.sections.get(name)
    if (!section) return
    section.cpu.push(this.now() - section.start)
    if (!section.gpuOpen) return
    section.gpuOpen = false
    this.gpuTimer?.end(name)
  }

  /** Adds a live reading to every summary, e.g. how many geometries three.js holds. The probe only calls it when a summary is asked for. */
  addGauge = (name: string, read: () => number): void => {
    this.gauges.set(name, read)
  }

  /** Counts an event, e.g. one commit of the pop-out window. */
  count = (name: string): void => {
    if (!this.enabled) return
    this.counters.set(name, (this.counters.get(name) ?? 0) + 1)
  }

  /** Remembers the time under a name, to be measured against later with `since`. */
  stamp = (name: string): void => {
    if (!this.enabled) return
    this.stamps.set(name, this.now())
  }

  /** Records the time from the last `stamp(from)` until now under `label`. Nothing is recorded without a stamp, and a stamp is used once. */
  since = (from: string, label: string): void => {
    if (!this.enabled) return
    const started = this.stamps.get(from)
    if (started === undefined) return
    this.stamps.delete(from)
    let samples = this.latencies.get(label)
    if (!samples) {
      samples = new Samples()
      this.latencies.set(label, samples)
    }
    samples.push(this.now() - started)
  }

  /** Forgets everything recorded so far (not which windows are watched). Call it after warm-up, before the measured stretch. */
  reset = (): void => {
    this.sections.forEach(({ cpu, gpu }) => {
      cpu.clear()
      gpu.clear()
    })
    this.counters.clear()
    this.stamps.clear()
    this.latencies.forEach((samples) => samples.clear())
    this.windows.forEach((recorder) => recorder.clear())
    this.gap.clear()
    this.cpu.clear()
    this.gpuFrame.clear()
    this.frames = 0
    this.lastFrameStartedAt = 0
    this.gapOver25 = 0
    this.gapOver50 = 0
    this.gpuTag = -1
    this.gpuAccumulated = 0
  }

  summary = (): ProbeSummary => {
    const sections: Record<string, SectionSummary> = {}
    this.sections.forEach(({ cpu, gpu }, name) => {
      sections[name] = { cpu: cpu.stats(), gpu: gpu.stats() }
    })
    const latencies: Record<string, SampleStats | null> = {}
    this.latencies.forEach((samples, name) => { latencies[name] = samples.stats() })
    const longFrames: Record<string, LongFrameSummary> = {}
    this.windows.forEach((recorder, label) => { longFrames[label] = recorder.summary() })
    return {
      enabled: this.enabled,
      gpuTimer: this.status,
      gpuFaults: this.gpuTimer?.getFaults() ?? null,
      frames: this.frames,
      gap: this.gap.stats(),
      gapOver25: this.gapOver25,
      gapOver50: this.gapOver50,
      cpu: this.cpu.stats(),
      gpuFrame: this.gpuFrame.stats(),
      sections,
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries([...this.gauges].map(([name, read]) => [name, read()])),
      latencies,
      longFrames,
    }
  }

  private sectionFor = (name: string): Section => {
    const existing = this.sections.get(name)
    if (existing) return existing
    const created: Section = { cpu: new Samples(), gpu: new Samples(), start: 0, gpuOpen: false }
    this.sections.set(name, created)
    return created
  }

  private startGpuTimer = (): void => {
    if (this.gpuTimer || this.status !== 'ready' || !this.gl) return
    const ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null
    if (ext) this.gpuTimer = new GpuTimer(this.gl as unknown as TimerGl, ext)
  }

  private takeGpuResult = ({ name, ms, tag }: GpuResult): void => {
    this.sectionFor(name).gpu.push(ms)
    if (tag !== this.gpuTag) {
      if (this.gpuTag !== -1) this.gpuFrame.push(this.gpuAccumulated)
      this.gpuTag = tag
      this.gpuAccumulated = 0
    }
    this.gpuAccumulated += ms
  }
}
