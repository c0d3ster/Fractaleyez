import React, { useEffect, useRef, useState } from 'react'

import type { LabSession } from '../labSession'
import { DRUM_LABEL_KINDS, LABEL_INFO } from '../recording/labels'
import { tallySession, type SessionTally } from '../recording/liveView'
import { drawLive, LIVE_HEIGHT } from './drawLive'

// The tally covers the whole session, so it refreshes a couple of times a second rather than with every draw.
const TALLY_MS = 500

type LiveCompareProps = {
  session: LabSession
  /** Whether a session has been recorded (the strip is empty before). */
  active: boolean
  /** How much time the strip shows, ms: the Beat HUD's view, so the two match as it zooms. */
  windowMs: number
}

/**
 * Your labels against the model's as the session records, the Beat HUD's window scrolling on the HUDs' ticker, with a tally per drum and
 * how far behind the model you label (the median over every pair). After Stop it holds the last window.
 */
export const LiveCompare = ({ session, active, windowMs }: LiveCompareProps): React.ReactElement => {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const [tally, setTally] = useState<SessionTally | null>(null)

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry?.contentRect.width ?? 0)))
    observer.observe(wrapper)
    return (): void => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || width === 0 || !active) return undefined
    const draw = (): void => {
      const snapshot = session.liveSnapshot(windowMs)
      if (!snapshot) return
      const ratio = window.devicePixelRatio || 1
      const w = Math.round(width * ratio)
      const h = Math.round(LIVE_HEIGHT * ratio)
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      drawLive(ctx, width, snapshot, windowMs)
    }
    draw()
    return session.ticker(draw, canvas)
  }, [session, width, active, windowMs])

  useEffect(() => {
    if (!active) return undefined
    const update = (): void => {
      const snapshot = session.liveSnapshot()
      setTally(snapshot ? tallySession(snapshot.labels, snapshot.drumHits) : null)
    }
    update()
    const timer = window.setInterval(update, TALLY_MS)
    return (): void => window.clearInterval(timer)
  }, [session, active])

  return (
    <section className='lab-live' ref={wrapperRef}>
      <header className='lab-live-head'>
        <h2 className='lab-live-title' title='Per drum, your labels on top and the model&apos;s hits below. A pair is joined by a green line; a label or hit with no partner is hollow.'>
          Live: you vs the model, last {(Math.round(windowMs / 100) / 10).toString()} s
        </h2>
        <span className='lab-live-legend'>yours on top, the model&apos;s below; hollow means no partner</span>
        {tally && (
          <p className='lab-live-tally'>
            {DRUM_LABEL_KINDS.map((kind) => {
              const { labels, hits, matched } = tally.drums[kind]
              return (
                <span key={kind} title={`${LABEL_INFO[kind].name}: your labels, the model's hits, and how many pair up`}>
                  {LABEL_INFO[kind].name} <b>{labels}</b> / <b>{hits}</b> paired <b>{matched}</b>
                </span>
              )
            })}
            <span title='Median of your label time minus the model hit it pairs with: your reaction time plus any difference in timing.'>
              {tally.medianOffsetMs === null
                ? 'No pairs yet'
                : <>You label <b>{Math.round(tally.medianOffsetMs)} ms</b> {tally.medianOffsetMs >= 0 ? 'after' : 'before'} the model ({tally.pairs} pairs)</>}
            </span>
          </p>
        )}
      </header>
      {active
        ? <canvas ref={canvasRef} style={{ width: '100%', height: LIVE_HEIGHT, display: 'block' }} />
        : <p className='lab-live-empty'>Press Record and label along: your labels show here against the model&apos;s, as they happen.</p>}
    </section>
  )
}
