import React, { useEffect, useState } from 'react'
import './PerfHud.css'
import { subscribeUiTick } from '../../utils/uiTicker'

type PerfData = {
  fps: number
  frameMs: number
  pingMs: number | null
  estimatedLagMs: number
}

const PERF_UPDATE_INTERVAL_MS = 250

const perfSourceWindow =(): Window => window.opener ?? window

export const PerfHud = (): React.ReactElement => {
  const [perf, setPerf] = useState<PerfData>({ fps: 0, frameMs: 0, pingMs: null, estimatedLagMs: 0 })

  useEffect(() => {
    let lastUpdateAt = 0
    const tick = (now: number): void => {
      // The readout is a rolling median that doesn't change as fast as the shared UI tick.
      if (now - lastUpdateAt < PERF_UPDATE_INTERVAL_MS) return
      lastUpdateAt = now
      const data = perfSourceWindow().getPerfData?.()
      if (data) setPerf(data)
    }
    return subscribeUiTick(tick)
  }, [])

  const pingLabel = perf.pingMs != null ? `${perf.pingMs}` : '—'

  return (
    <div className='perf-hud-wrapper'>
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
