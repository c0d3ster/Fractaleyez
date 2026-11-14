import React from 'react'

import { isSureAlignment } from '../recording/align'
import { passBounds, songOrigin, type LabSongFile } from '../recording/songFile'
import { formatTime } from '../recording/timeline'

// The nudges for a pass's offset: a frame-ish step, and a bigger one for a pass that landed a beat off.
const NUDGES_MS = [-100, -10, 10, 100]

type PassListProps = {
  song: LabSongFile
  shown: ReadonlySet<number>
  onToggle: (passIndex: number) => void
  onNudge: (passIndex: number, deltaMs: number) => void
  onRealign: (passIndex: number) => void
  onRemove: (passIndex: number) => void
}

const alignmentText = (song: LabSongFile, passIndex: number): React.ReactNode => {
  const { alignment, session } = song.passes[passIndex]!
  const played = session.playback ? ` (played ${session.playback.file.name}${session.playback.mode === 'direct' ? ', direct' : ''})` : ''
  if (passIndex === 0) return <span className='review-pass-note'>reference{played}</span>
  if (!alignment) return <span className='review-pass-note'>{session.playback ? `from the player${played}` : 'set by hand'}</span>
  const sure = isSureAlignment(alignment)
  return (
    <span
      className={sure ? 'review-pass-note' : 'review-pass-warn'}
      title={`Onset match ${alignment.score.toFixed(2)}, best other offset ${alignment.runnerUp.toFixed(2)}. ${sure ? 'It stands out clearly.' : 'It does not stand out: check the labels line up, and nudge or re-align.'}`}
    >
      {sure ? 'aligned' : 'check alignment'} ({alignment.score.toFixed(2)} vs {alignment.runnerUp.toFixed(2)})
    </span>
  )
}

/** The song's passes: show or hide each one's labels, where it sits in the song, how sure its alignment is, and nudge or re-align it. */
export const PassList = ({ song, shown, onToggle, onNudge, onRealign, onRemove }: PassListProps): React.ReactElement => {
  const origin = songOrigin(song)
  return (
    <ol className='review-passes'>
      {song.passes.map((pass, i) => {
        const { startMs, endMs } = passBounds(pass)
        return (
          <li key={`${i}-${pass.name}`} className='review-pass'>
            <label className='review-pass-name'>
              <input type='checkbox' checked={shown.has(i)} onChange={(): void => onToggle(i)} />
              <b>{i + 1}</b> {pass.name}
            </label>
            <span className='review-pass-span'>{formatTime(startMs - origin)} to {formatTime(endMs - origin)}, {pass.session.labels.length} labels</span>
            {alignmentText(song, i)}
            {i > 0 && (
              <span className='review-pass-actions'>
                {NUDGES_MS.map((delta) => (
                  <button key={delta} type='button' className='lab-label-button' onClick={(): void => onNudge(i, delta)} title={`Move this pass ${Math.abs(delta)} ms ${delta < 0 ? 'earlier' : 'later'}`}>
                    {delta > 0 ? '+' : ''}{delta}
                  </button>
                ))}
                <button type='button' className='lab-label-button' onClick={(): void => onRealign(i)}>Re-align</button>
                <button type='button' className='lab-label-button' onClick={(): void => onRemove(i)}>Remove</button>
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
