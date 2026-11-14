import React from 'react'

import type { LabPhase } from './labSession'
import { LABEL_INFO } from './recording/labels'
import { formatTime } from './recording/timeline'
import type { RecordingControls } from './useRecording'

type RecordBarProps = {
  controls: RecordingControls
  phase: LabPhase
}

/** The session controls in the top bar: Record and Stop, the recorded time, Undo, the newest label, Export once stopped and the review link. */
export const RecordBar = ({ controls, phase }: RecordBarProps): React.ReactElement => {
  const { status, recording, toggle, undo, exportFile } = controls
  const { durationMs, frames, lastLabel, file, startMs } = status
  return (
    <div className='lab-record'>
      <button
        type='button'
        className={`lab-button lab-record-button${recording ? ' lab-recording' : ''}`}
        onClick={toggle}
        disabled={phase !== 'running'}
        title={phase === 'running' ? undefined : 'Start the analysis first.'}
      >
        {recording ? 'Stop' : 'Record'}
      </button>
      {status.phase !== 'idle' && (
        <span className='lab-record-time'>
          <b>{formatTime(durationMs)}</b> {frames} frames
        </span>
      )}
      <button type='button' className='lab-label-button' onClick={undo} disabled={!recording} title='Remove the newest label (Backspace)'>
        Undo <kbd>⌫</kbd>
      </button>
      {recording && lastLabel && (
        <span className='lab-record-last'>{LABEL_INFO[lastLabel.kind].name} at {formatTime(lastLabel.t - startMs)}</span>
      )}
      {file && (
        <button type='button' className='lab-button' onClick={exportFile}>
          Export
        </button>
      )}
      <a className='lab-link' href='./review.html' target='_blank' rel='noreferrer'>Review</a>
    </div>
  )
}
