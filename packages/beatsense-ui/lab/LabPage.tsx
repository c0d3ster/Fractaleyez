import React, { useCallback, useEffect, useState } from 'react'
import { BeatHud, FrequencyHud, HudProvider, SectionHud, type AnalysisSource } from 'beatsense-ui'

import { LabSession, type LabPhase } from './labSession'
import { LabelButtons } from './LabelButtons'
import { PlayerBar } from './player/PlayerBar'
import { RecordBar } from './RecordBar'
import { DRUM_LABEL_KINDS, SONG_LABEL_KINDS, type LabelAction } from './recording/labels'
import { LIVE_WINDOW_MS } from './recording/liveView'
import { DrumStrip } from './strips/DrumStrip'
import { SongStrip } from './strips/SongStrip'
import { StatusLine } from './StatusLine'
import { useRecording } from './useRecording'

// Until the analysis starts the HUDs read nothing and draw empty.
const EMPTY_SOURCE: AnalysisSource = {}

// The drum buttons under the Frequency HUD's drum lights (a 2 by 2 block, like their keys); the song labels and the riser toggle under
// the Section HUD.
const SONG_ACTIONS: readonly LabelAction[] = [...SONG_LABEL_KINDS, 'riser']

// The Section HUD's default view; it reports its own on mount.
const SECTION_VIEW_MS = 60000

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
  // Each HUD's view, which the strip under it follows (set by the HUD on mount and as it zooms).
  const [beatViewMs, setBeatViewMs] = useState(LIVE_WINDOW_MS)
  const [sectionViewMs, setSectionViewMs] = useState(SECTION_VIEW_MS)

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
        <PlayerBar session={session} phase={phase} recording={recording} />
        <StatusLine session={session} phase={phase} />
      </header>
      <main className='lab-huds'>
        <HudProvider source={source} ticker={session.ticker}>
          <div className='lab-hud lab-hud-frequency'>
            <FrequencyHud enabledBands={enabledBands} onEnabledBandsChange={handleEnabledBandsChange} />
            <LabelButtons controls={recording} actions={DRUM_LABEL_KINDS} name='Drum labels' />
          </div>
          <div className='lab-hud lab-hud-beat'>
            <BeatHud onViewChange={setBeatViewMs} />
            <DrumStrip session={session} windowMs={beatViewMs} />
          </div>
          <div className='lab-hud lab-hud-section'>
            <SectionHud onViewChange={setSectionViewMs} />
            <SongStrip session={session} windowMs={sectionViewMs} />
            <LabelButtons controls={recording} actions={SONG_ACTIONS} name='Song and riser labels' />
          </div>
        </HudProvider>
      </main>
    </div>
  )
}
