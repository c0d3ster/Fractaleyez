import React, { useEffect, useRef, useState } from 'react'
import './PerfHud.css'
import { subscribeUiTick } from '../../utils/uiTicker'
import { QUALITY_LABELS } from '../../config/quality.config'
import type { QualityStatus } from '../../visualization/quality-controller'
import type { AutoDiagnostics } from '../../visualization/quality-governor'
import { STUTTER_MS, STUTTER_WINDOW_MS, type StutterSummary } from '../../visualization/stutter-monitor'

type PerfData = {
  fps: number
  frameMs: number
  pingMs: number | null
  estimatedLagMs: number
  quality?: QualityStatus
  stutters?: { display: StutterSummary; video: StutterSummary }
}

const PERF_UPDATE_INTERVAL_MS = 250

const perfSourceWindow = (): Window => window.opener ?? window

// A fixed setting reads as its tier; Auto also says which tier it has settled on, e.g. "Auto (Balanced)".
const qualityLabel = ({ setting, tier }: QualityStatus): string =>
  setting === 'auto' ? `${QUALITY_LABELS.auto} (${QUALITY_LABELS[tier]})` : QUALITY_LABELS[tier]

const seconds = (ms: number): string => (ms / 1000).toFixed(1)
const oneDecimal = (value: number): string => value.toFixed(1)
const percent = (share: number, digits: number): string => `${(share * 100).toFixed(digits)}%`

type StutterRowProps = { label: string; summary: StutterSummary; hint: string }

// How many gaps over the threshold the last minute had, and the worst one: one short line.
const StutterRow = ({ label, summary, hint }: StutterRowProps): React.ReactElement => (
  <div className='perf-hud-row' title={hint}>
    <span className='perf-hud-key'>{label}</span>
    <div className='perf-hud-metric'>
      <span className={summary.count > 0 ? 'perf-hud-value perf-hud-value--bad' : 'perf-hud-value'}>{summary.count}</span>
      {summary.count > 0 ? <span className='perf-hud-frame-ms'> · {Math.round(summary.worstMs)} ms</span> : null}
    </div>
  </div>
)

type AutoRowsProps = { auto: AutoDiagnostics }

// What decides Auto's next move, live, one short line each; the hover text says what each number means.
const AutoRows = ({ auto }: AutoRowsProps): React.ReactElement => {
  const { frameMs, p95Ms, slowAboveMs, roughAboveMs, slowForMs, slowLimitMs, videoDropShare, videoDropLimit, cleanForMs, climbAfterMs, probationLeftMs, retryInMs, lastChange } = auto
  const upState = retryInMs > 0 ? `retry ${seconds(retryInMs)} s` : probationLeftMs > 0 ? `trial ${seconds(probationLeftMs)} s` : `${percent(videoDropShare, 1)} drop`
  const upAfter = climbAfterMs === null ? 'a cheaper scene' : `${seconds(climbAfterMs)} s`
  return (
    <>
      <div
        className='perf-hud-row'
        title={`Median and 95th percentile of the display frame times Auto judges. A window is slow when the median is over ${oneDecimal(slowAboveMs)} ms or the 95th percentile is over ${oneDecimal(roughAboveMs)} ms.`}
      >
        <span className='perf-hud-key'>Frames</span>
        <span className='perf-hud-value'>{frameMs === null || p95Ms === null ? '—' : `${oneDecimal(frameMs)} / ${oneDecimal(p95Ms)} ms`}</span>
      </div>
      <div className='perf-hud-row' title={`How long frames have been slow without a break. Auto steps down after ${seconds(slowLimitMs)} s.`}>
        <span className='perf-hud-key'>Down</span>
        <span className={slowForMs > 0 ? 'perf-hud-value perf-hud-value--bad' : 'perf-hud-value'}>{seconds(slowForMs)} / {seconds(slowLimitMs)} s</span>
      </div>
      <div
        className='perf-hud-row'
        title={`How long frames have been clean: no slow windows, and dropped video under ${percent(videoDropLimit, 0)} (now ${percent(videoDropShare, 1)}). Auto tries the next tier up after ${upAfter}, then watches it for a few seconds.`}
      >
        <span className='perf-hud-key'>Up</span>
        <div className='perf-hud-metric'>
          <span className='perf-hud-value'>{climbAfterMs === null ? '—' : `${seconds(cleanForMs)} / ${seconds(climbAfterMs)} s`}</span>
          <span className='perf-hud-frame-ms'> · {upState}</span>
        </div>
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
  const [perf, setPerf] = useState<PerfData>({ fps: 0, frameMs: 0, pingMs: null, estimatedLagMs: 0 })
  const wrapperRef = useRef<HTMLDivElement>(null)

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

  const pingLabel = perf.pingMs != null ? `${perf.pingMs}` : '—'
  const windowLabel = `${STUTTER_WINDOW_MS / 1000} s`

  return (
    <div className='perf-hud-wrapper' ref={wrapperRef}>
      <span className='perf-hud-label'>Performance</span>
      <div className='perf-hud-panel'>
        <div className='perf-hud-row'>
          <span className='perf-hud-key'>FPS</span>
          <div className='perf-hud-metric'>
            <span className='perf-hud-value'>{perf.fps}</span>
            {perf.frameMs > 0 ? (
              <span className='perf-hud-frame-ms'> · {perf.frameMs} ms</span>
            ) : null}
          </div>
        </div>
        {perf.quality ? (
          <div className='perf-hud-row'>
            <span className='perf-hud-key'>Quality</span>
            <span className='perf-hud-value'>{qualityLabel(perf.quality)}</span>
          </div>
        ) : null}
        {perf.quality?.auto ? <AutoRows auto={perf.quality.auto} /> : null}
        {perf.stutters ? (
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
        <div className='perf-hud-row'>
          <span className='perf-hud-key'>Ping</span>
          <span className={perf.pingMs != null ? 'perf-hud-value' : 'perf-hud-value perf-hud-value--muted'}>
            {pingLabel}
            {perf.pingMs != null ? ' ms' : ''}
          </span>
        </div>
        <div className='perf-hud-row'>
          <span className='perf-hud-key'>Lag</span>
          <span className='perf-hud-value'>{perf.estimatedLagMs} ms</span>
        </div>
      </div>
    </div>
  )
}
