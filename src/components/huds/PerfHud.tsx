import React, { useEffect, useState } from 'react'
import './PerfHud.css'

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
    let raf = 0
    let lastUpdateAt = 0
    const tick = (): void => {
      raf = requestAnimationFrame(tick)
      // A new object every frame would re-render this 60 times a second on the visualizer's main thread, and
      // the readout is a rolling median that doesn't change that fast.
      const now = performance.now()
      if (now - lastUpdateAt < PERF_UPDATE_INTERVAL_MS) return
      lastUpdateAt = now
      const data = perfSourceWindow().getPerfData?.()
      if (data) setPerf(data)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const pingLabel = perf.pingMs != null ? `${perf.pingMs}` : '—'

  return (
    <div className='perf-hud-wrapper'>
      <span className='perf-hud-label'>Performance</span>
      <div className='perf-hud-panel'>
        <div className='perf-hud-row'>
          <div className='perf-hud-metric'>
            <span className='perf-hud-key'>FPS</span>
            <span className='perf-hud-value'>{perf.fps}</span>
            {perf.frameMs > 0 ? (
              <span className='perf-hud-frame-ms'> · {perf.frameMs} ms</span>
            ) : null}
          </div>
          <div className='perf-hud-metric perf-hud-metric--ping'>
            <span className='perf-hud-key'>Ping</span>
            <span className={perf.pingMs != null ? 'perf-hud-value' : 'perf-hud-value perf-hud-value--muted'}>
              {pingLabel}
              {perf.pingMs != null ? ' ms' : ''}
            </span>
          </div>
        </div>
        <div className='perf-hud-row'>
          <span className='perf-hud-key'>AV delay</span>
          <span className='perf-hud-value'>{perf.estimatedLagMs} ms</span>
        </div>
      </div>
    </div>
  )
}
