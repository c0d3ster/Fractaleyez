import React, { useCallback, useEffect, useState } from 'react'

import type { LabSession, StripSnapshot } from '../labSession'
import { DRUM_LABEL_KINDS, LABEL_INFO } from '../recording/labels'
import type { SessionTally } from '../recording/liveView'
import { DRUM_STRIP_HEIGHT, drawDrumStrip } from './drawDrumStrip'
import { useStripCanvas } from './useStripCanvas'

// The tally covers the whole session, so it refreshes a couple of times a second rather than with every draw.
const TALLY_MS = 500

const EMPTY_SNAPSHOT: StripSnapshot = { nowMs: 0, session: null, drumHits: [], frames: [] }

type DrumStripProps = {
  session: LabSession
  /** The Beat HUD's view, ms, so the strip shows the same window. */
  windowMs: number
}

const tallyText = (tally: SessionTally | null): React.ReactNode => {
  if (!tally) return 'The model\'s drum hits. Record to add yours on top and pair them.'
  return (
    <>
      {DRUM_LABEL_KINDS.map((kind) => {
        const { labels, hits, matched } = tally.drums[kind]
        return (
          <span key={kind} title={`${LABEL_INFO[kind].name}: of your ${labels} labels, ${matched} paired with one of the model's ${hits} hits`}>
            {LABEL_INFO[kind].name} <b>{matched}</b>/{labels}
          </span>
        )
      })}
      <span title='The median of your label time minus the model hit it pairs with: your reaction time, plus any difference in timing.'>
        {tally.medianOffsetMs === null
          ? 'no pairs yet'
          : <>you <b>{Math.round(tally.medianOffsetMs)} ms</b> {tally.medianOffsetMs >= 0 ? 'after' : 'before'} the model</>}
      </span>
    </>
  )
}

/**
 * Under the Beat HUD, over its window: a lane per drum with the model's hits, and while recording your labels above them, paired one to
 * one. Below, how many of your labels paired per drum and how far behind the model you label.
 */
export const DrumStrip = ({ session, windowMs }: DrumStripProps): React.ReactElement => {
  const [tally, setTally] = useState<SessionTally | null>(null)
  const draw = useCallback((ctx: CanvasRenderingContext2D, width: number): void => {
    // Before the analysis starts, the empty lanes (so the layout does not jump when it does).
    drawDrumStrip(ctx, width, session.stripSnapshot(windowMs) ?? EMPTY_SNAPSHOT, windowMs)
  }, [session, windowMs])
  const { wrapperRef, canvasRef } = useStripCanvas(session.ticker, DRUM_STRIP_HEIGHT, draw)

  useEffect(() => {
    const update = (): void => setTally(session.tally())
    update()
    const timer = window.setInterval(update, TALLY_MS)
    return (): void => window.clearInterval(timer)
  }, [session])

  return (
    <div className='lab-strip'>
      <div className='lab-strip-canvas' ref={wrapperRef} title='Per drum, your labels on top and the model&apos;s hits below. A pair is joined by a green line; a label or hit with no partner is hollow. Follows the Beat HUD&apos;s zoom.'>
        <canvas ref={canvasRef} style={{ width: '100%', height: DRUM_STRIP_HEIGHT, display: 'block' }} />
      </div>
      <p className='lab-strip-tally'>{tallyText(tally)}</p>
    </div>
  )
}
