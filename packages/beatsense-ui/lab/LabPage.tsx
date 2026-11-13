import React, { useCallback, useEffect, useState } from 'react'
import { BeatHud, FrequencyHud, HudProvider, SectionHud, type AnalysisSource } from 'beatsense-ui'

import { LabSession, type LabPhase } from './labSession'
import { LabelButtons } from './LabelButtons'
import { LiveCompare } from './live/LiveCompare'
import { RecordBar } from './RecordBar'
import { DRUM_LABEL_KINDS, SONG_LABEL_KINDS, type LabelAction } from './recording/labels'
import { StatusLine } from './StatusLine'
import { useRecording } from './useRecording'

// Until the analysis starts the HUDs read nothing and draw empty.
const EMPTY_SOURCE: AnalysisSource = {}

// The drum buttons and the riser's under the Frequency HUD (its drum lights and riser meter), the song labels under the Section HUD.
const FREQUENCY_ACTIONS: readonly LabelAction[] = [...DRUM_LABEL_KINDS, 'riser']

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
  const recording = useRecording(session)

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
          <RecordBar controls={recording} phase={phase} />
        </div>
        <StatusLine session={session} phase={phase} />
      </header>
      <main className='lab-huds'>
        <HudProvider source={source} ticker={session.ticker}>
          <div className='lab-hud lab-hud-frequency'>
            <FrequencyHud enabledBands={enabledBands} onEnabledBandsChange={handleEnabledBandsChange} />
            <LabelButtons controls={recording} actions={FREQUENCY_ACTIONS} name='Drum and riser labels' />
          </div>
          <div className='lab-hud lab-hud-beat'>
            <BeatHud />
          </div>
          <div className='lab-hud lab-hud-section'>
            <SectionHud />
            <LabelButtons controls={recording} actions={SONG_LABEL_KINDS} name='Song labels' />
          </div>
        </HudProvider>
        <div className='lab-hud-live'>
          <LiveCompare session={session} active={recording.status.phase !== 'idle'} />
        </div>
      </main>
    </div>
  )
}
