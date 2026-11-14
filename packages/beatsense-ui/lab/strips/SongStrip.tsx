import React, { useCallback } from 'react'

import type { LabSession, StripSnapshot } from '../labSession'
import { drawSongStrip, SONG_STRIP_HEIGHT } from './drawSongStrip'
import { useStripCanvas } from './useStripCanvas'

const EMPTY_SNAPSHOT: StripSnapshot = { nowMs: 0, session: null, drumHits: [], frames: [] }

type SongStripProps = {
  session: LabSession
  /** The Section HUD's view, ms, so the strip shows the same window. */
  windowMs: number
}

/** Under the Section HUD, over its window: the model's sections and riser score, and while recording your song labels and risers on them. */
export const SongStrip = ({ session, windowMs }: SongStripProps): React.ReactElement => {
  const draw = useCallback((ctx: CanvasRenderingContext2D, width: number): void => {
    // Before the analysis starts, the empty lanes (so the layout does not jump when it does).
    drawSongStrip(ctx, width, session.stripSnapshot(windowMs) ?? EMPTY_SNAPSHOT, windowMs)
  }, [session, windowMs])
  const { wrapperRef, canvasRef } = useStripCanvas(session.ticker, SONG_STRIP_HEIGHT, draw)
  return (
    <div className='lab-strip'>
      <div className='lab-strip-canvas' ref={wrapperRef} title='Your song labels over the model&apos;s sections, and your risers behind its riser score. Follows the Section HUD&apos;s zoom.'>
        <canvas ref={canvasRef} style={{ width: '100%', height: SONG_STRIP_HEIGHT, display: 'block' }} />
      </div>
    </div>
  )
}
