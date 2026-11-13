import React, { useCallback, useEffect, useState } from 'react'
import { BeatHud, FrequencyHud, HudProvider, SectionHud, type AnalysisSource } from 'beatsense-ui'

import { LabSession, type LabPhase } from './labSession'
import { RecordBar } from './RecordBar'
import { StatusLine } from './StatusLine'

// Until the analysis starts the HUDs read nothing and draw empty.
const EMPTY_SOURCE: AnalysisSource = {}

const START_LABELS: Record<LabPhase, string> = {
  idle: 'Start',
  starting: 'Starting...',
  running: 'Listening',
  failed: 'Retry',
}

/** The lab: a bar with the controls and the status on top, the three HUDs filling the rest of the window. */
export const LabPage = (): React.ReactElement => {
  const [session] = useState(() => new LabSession())
  const [phase, setPhase] = useState<LabPhase>('idle')
  const [source, setSource] = useState<AnalysisSource>(EMPTY_SOURCE)
  const [enabledBands, setEnabledBands] = useState<readonly boolean[]>(() => session.getEnabledBands())

  // The page's frame rate shows from the start, so a slow page shows before the analysis runs too.
  useEffect(() => session.watchFrames(), [session])

  const handleStart = useCallback(async (): Promise<void> => {
    setPhase('starting')
    await session.start()
    setPhase(session.status().phase)
    setSource(session.getSource() ?? EMPTY_SOURCE)
  }, [session])

  const handleEnabledBandsChange = useCallback((next: boolean[]): void => {
    session.setEnabledBands(next)
    setEnabledBands(next)
  }, [session])

  return (
    <div className='lab'>
      <header className='lab-bar'>
        <h1 className='lab-title'>beatsense lab</h1>
        <div className='lab-controls'>
          <button type='button' className='lab-button' onClick={handleStart} disabled={phase === 'starting' || phase === 'running'}>
            {START_LABELS[phase]}
          </button>
          <RecordBar session={session} phase={phase} />
        </div>
        <StatusLine session={session} phase={phase} />
      </header>
      <main className='lab-huds'>
        <HudProvider source={source} ticker={session.ticker}>
          <div className='lab-hud lab-hud-frequency'>
            <FrequencyHud enabledBands={enabledBands} onEnabledBandsChange={handleEnabledBandsChange} />
          </div>
          <div className='lab-hud lab-hud-beat'>
            <BeatHud />
          </div>
          <div className='lab-hud lab-hud-section'>
            <SectionHud />
          </div>
        </HudProvider>
      </main>
    </div>
  )
}
