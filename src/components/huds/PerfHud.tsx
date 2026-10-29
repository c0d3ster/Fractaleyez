import React, { useEffect, useRef, useState } from 'react'
import './PerfHud.css'
import { subscribeUiTick } from '../../utils/uiTicker'
import { AUTO_SLOW_FOR_MS, QUALITY_LABELS, SMOOTH_GOOD_MS } from '../../config/quality.config'
import type { QualityStatus } from '../../visualization/quality-controller'
import type { AutoDiagnostics } from '../../visualization/quality-governor'
import { STUTTER_MS, STUTTER_WINDOW_MS, type StutterSummary } from '../../visualization/stutter-monitor'

type PerfData = {
  fps: number
  frameMs: number
  estimatedLagMs: number
  quality?: QualityStatus
  stutters?: { display: StutterSummary; video: StutterSummary }
}

const PERF_UPDATE_INTERVAL_MS = 250
// The panel shows one stutter count by default; clicking its title switches to the debugging rows, and the choice is kept.
const DEBUG_STORAGE_KEY = 'perfHudDebug'

const readDebug = (): boolean => {
  try {
    return window.localStorage.getItem(DEBUG_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const writeDebug = (on: boolean): void => {
  try {
    window.localStorage.setItem(DEBUG_STORAGE_KEY, on ? '1' : '0')
  } catch {
    // Storage can be blocked; the panel still works, it just forgets the choice.
  }
}

const perfSourceWindow = (): Window => window.opener ?? window

// A fixed setting reads as its tier; Auto also says which tier it has settled on, e.g. "Auto (Balanced)".
const qualityLabel = ({ setting, tier }: QualityStatus): string =>
  setting === 'auto' ? `${QUALITY_LABELS.auto} (${QUALITY_LABELS[tier]})` : QUALITY_LABELS[tier]

const seconds = (ms: number): string => (ms / 1000).toFixed(1)
const oneDecimal = (value: number): string => value.toFixed(1)

type StutterRowProps = { label: string; summary: StutterSummary; hint: string }

// How many gaps over the threshold the last minute had, and the worst one: one short line.
const StutterRow = ({ label, summary, hint }: StutterRowProps): React.ReactElement => (
  <div className='perf-hud-row' title={hint}>
    <span className='perf-hud-key'>{label}</span>
    <div className='perf-hud-metric'>
      <span className={summary.count > 0 ? 'perf-hud-value perf-hud-value--warn' : 'perf-hud-value'}>{summary.count}</span>
      {summary.count > 0 ? <span className='perf-hud-frame-ms'> · {Math.round(summary.worstMs)} ms</span> : null}
    </div>
  </div>
)

type SmoothRowProps = { quality: QualityStatus }

// What Auto is waiting for, for the hover text: how long until it may try a higher tier.
const climbHint = (auto: AutoDiagnostics | null): string => {
  if (!auto) return ''
  if (auto.retryInMs > 0) return ` Auto may try a higher tier again in ${seconds(auto.retryInMs)} s.`
  if (auto.probationLeftMs > 0) return ` Auto is trying a higher tier and watching it for ${seconds(auto.probationLeftMs)} s more.`
  return ''
}

const smoothTone = (loading: boolean, ms: number): string => {
  if (loading) return 'perf-hud-value--muted'
  if (ms >= SMOOTH_GOOD_MS) return 'perf-hud-value--good'
  if (ms <= -AUTO_SLOW_FOR_MS) return 'perf-hud-value--bad'
  return ms < 0 ? 'perf-hud-value--warn' : ''
}

// How long the page has been smooth, or minus how long it has been struggling; a dash while something loads.
const SmoothRow = ({ quality }: SmoothRowProps): React.ReactElement => {
  const { loading, ms, reasons } = quality.smooth
  const loadingHint = reasons.length > 0
    ? `Loading ${reasons.join(', ')}: frame times are not judged until it is done.`
    : 'Settling after a resize, a tab change or a tier change: frame times are not judged for a moment.'
  const title = loading
    ? loadingHint
    : `How long frames have gone without trouble (slow frames or dropped video), green from ${SMOOTH_GOOD_MS / 1000} s. Negative is how long they have been slow: orange, then red from ${AUTO_SLOW_FOR_MS / 1000} s, where Auto steps down.${climbHint(quality.auto)}`
  return (
    <div className='perf-hud-row' title={title}>
      <span className='perf-hud-key'>Smooth</span>
      <span className={`perf-hud-value ${smoothTone(loading, ms)}`.trim()}>{loading ? '—' : `${ms < 0 ? '-' : ''}${seconds(Math.abs(ms))} s`}</span>
    </div>
  )
}

type AutoRowsProps = { auto: AutoDiagnostics }

// What decides Auto's next move, live, one short line each; the hover text says what each number means.
const AutoRows = ({ auto }: AutoRowsProps): React.ReactElement => {
  const { frameMs, p95Ms, slowAboveMs, roughAboveMs, lastChange } = auto
  return (
    <>
      <div
        className='perf-hud-row'
        title={`Median and 95th percentile of the display frame times Auto judges. A window is slow when the median is over ${oneDecimal(slowAboveMs)} ms or the 95th percentile is over ${oneDecimal(roughAboveMs)} ms.`}
      >
        <span className='perf-hud-key'>Frames</span>
        <span className='perf-hud-value'>{frameMs === null || p95Ms === null ? '—' : `${oneDecimal(frameMs)} / ${oneDecimal(p95Ms)} ms`}</span>
      </div>
      <div className='perf-hud-row' title='The last time Auto changed tier, and how long ago'>
        <span className='perf-hud-key'>Last</span>
        <span className='perf-hud-value'>{lastChange ? `${QUALITY_LABELS[lastChange.from]} → ${QUALITY_LABELS[lastChange.to]} · ${Math.round(lastChange.agoMs / 1000)} s` : '—'}</span>
      </div>
      <div className='perf-hud-row' title='Why Auto made that change: slow = median / 95th percentile frame time, clean = time with no slow frames or dropped video'>
        <span className='perf-hud-key'>Why</span>
        <span className='perf-hud-value'>{lastChange ? lastChange.reason : '—'}</span>
      </div>
    </>
  )
}

export const PerfHud = (): React.ReactElement => {
  const [perf, setPerf] = useState<PerfData>({ fps: 0, frameMs: 0, estimatedLagMs: 0 })
  const [debug, setDebug] = useState(readDebug)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const toggleDebug = (): void => {
    setDebug((on) => {
      writeDebug(!on)
      return !on
    })
  }

  useEffect(() => {
    let lastUpdateAt = 0
    const tick = (now: number): void => {
      // The readout is a rolling median that doesn't change as fast as the shared UI tick.
      if (now - lastUpdateAt < PERF_UPDATE_INTERVAL_MS) return
      lastUpdateAt = now
      const data = perfSourceWindow().getPerfData?.()
      if (data) setPerf(data)
    }
    return subscribeUiTick(tick, wrapperRef.current)
  }, [])

  const windowLabel = `${STUTTER_WINDOW_MS / 1000} s`

  return (
    <div className='perf-hud-wrapper' ref={wrapperRef}>
      <button
        type='button'
        className='perf-hud-label perf-hud-label--toggle'
        aria-pressed={debug}
        title={debug ? 'Back to the short list' : 'Show the debugging rows'}
        onClick={toggleDebug}
      >
        {debug ? 'Performance · debug' : 'Performance'}
      </button>
      <div className='perf-hud-panel'>
        <div className='perf-hud-row' title='Frames drawn per second and the time between them, the median of the last 60. With a frame cap on (the Saver, Balanced and Quality tiers) this is the cap, not the display rate.'>
          <span className='perf-hud-key'>FPS</span>
          <div className='perf-hud-metric'>
            <span className='perf-hud-value'>{perf.fps}</span>
            {perf.frameMs > 0 ? (
              <span className='perf-hud-frame-ms'> · {perf.frameMs} ms</span>
            ) : null}
          </div>
        </div>
        {perf.quality ? (
          <div className='perf-hud-row' title='The quality tier being drawn. Auto picks it from how smooth the frames are; the tier in brackets is the one it is on now.'>
            <span className='perf-hud-key'>Quality</span>
            <span className='perf-hud-value'>{qualityLabel(perf.quality)}</span>
          </div>
        ) : null}
        {debug && perf.quality?.auto ? <AutoRows auto={perf.quality.auto} /> : null}
        {perf.stutters && !debug ? (
          <StutterRow
            label={`Jumps >${STUTTER_MS}/m`}
            summary={perf.stutters.video}
            hint={`Times the playing video went over ${STUTTER_MS} ms between frames in the last ${windowLabel}, then the worst gap. A video frame arrives every 33 to 42 ms, so one late frame already counts. Click the title for the debugging rows, which add the screen count.`}
          />
        ) : null}
        {perf.stutters && debug ? (
          <>
            <StutterRow
              label={`Video >${STUTTER_MS}`}
              summary={perf.stutters.video}
              hint={`Gaps over ${STUTTER_MS} ms between frames of the playing video in the last ${windowLabel}: how many, then the worst. A video frame arrives every 33 to 42 ms, so one late frame already counts.`}
            />
            <StutterRow
              label={`Screen >${STUTTER_MS}`}
              summary={perf.stutters.display}
              hint={`Gaps over ${STUTTER_MS} ms between display frames of the whole page in the last ${windowLabel}: how many, then the worst. A display frame is 4 to 17 ms, so this is the page itself freezing.`}
            />
          </>
        ) : null}
        {perf.quality ? <SmoothRow quality={perf.quality} /> : null}
        <div className='perf-hud-row' title='A rough guess, not a measurement, of the delay from a sound reaching the audio engine to the next drawn frame: the Web Audio latencies, half the analysis window and half a frame. It leaves out the microphone and the display, and how long the beat detector takes to fire, so the real delay is longer.'>
          <span className='perf-hud-key'>Lag</span>
          <span className='perf-hud-value'>{perf.estimatedLagMs} ms</span>
        </div>
      </div>
    </div>
  )
}
