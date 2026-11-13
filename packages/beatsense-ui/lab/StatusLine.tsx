import React, { useEffect, useState } from 'react'

import type { LabPhase, LabSession, LabStatus, MicState } from './labSession'

// Often enough for the frame rate to read as live; it covers the last second whenever it is read.
const REFRESH_MS = 500

const MIC_TEXT: Record<MicState, string> = {
  off: 'off',
  asking: 'waiting for permission',
  on: 'on',
  ended: 'ended (unplugged or access revoked)',
}

type StatusLineProps = {
  session: LabSession
  /** The page's phase: a change refreshes the line at once instead of on the next poll. */
  phase: LabPhase
}

/** The sample rate, the frames a second arriving from the worklet, the microphone and why a start failed, polled from the session. */
export const StatusLine = ({ session, phase }: StatusLineProps): React.ReactElement => {
  const [status, setStatus] = useState<LabStatus>(() => session.status())

  useEffect(() => {
    setStatus(session.status())
    const timer = window.setInterval(() => setStatus(session.status()), REFRESH_MS)
    return (): void => window.clearInterval(timer)
  }, [session, phase])

  const { sampleRate, framesPerSecond, mic, error } = status
  return (
    <p className='lab-status' role='status'>
      {phase === 'idle' && <span>Press Start and allow the microphone.</span>}
      {sampleRate !== null && <span>Sample rate <b>{sampleRate} Hz</b></span>}
      {phase === 'running' && <span>Frames <b>{Math.round(framesPerSecond)}/s</b></span>}
      <span>Mic <b>{MIC_TEXT[mic]}</b></span>
      {error && <span className='lab-status-error'>{error}</span>}
    </p>
  )
}
