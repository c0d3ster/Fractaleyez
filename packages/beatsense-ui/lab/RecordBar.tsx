import React, { useCallback, useEffect, useState } from 'react'

import { downloadJson } from './download'
import type { LabPhase, LabSession, RecordingStatus } from './labSession'
import { labelForKey } from './recording/hotkeys'
import { LABEL_INFO, LABEL_KINDS, type LabelKind } from './recording/labels'
import { serializeSessionFile, sessionFileName } from './recording/sessionFile'
import { formatTime } from './recording/timeline'

// Often enough for the recorded time to tick visibly.
const REFRESH_MS = 200

type RecordBarProps = {
  session: LabSession
  phase: LabPhase
}

/**
 * Record and Stop, the label buttons (each with its hotkey and count, live while recording), Undo (Backspace) and Export once stopped.
 * The hotkeys listen on the whole window while recording.
 */
export const RecordBar = ({ session, phase }: RecordBarProps): React.ReactElement => {
  const [status, setStatus] = useState<RecordingStatus>(() => session.recordingStatus())
  const refresh = useCallback((): void => setStatus(session.recordingStatus()), [session])
  const recording = status.phase === 'recording'

  useEffect(() => {
    if (!recording) return undefined
    const timer = window.setInterval(refresh, REFRESH_MS)
    return (): void => window.clearInterval(timer)
  }, [recording, refresh])

  const handleLabel = useCallback((kind: LabelKind): void => {
    session.addLabel(kind)
    refresh()
  }, [session, refresh])

  const handleUndo = useCallback((): void => {
    session.undoLabel()
    refresh()
  }, [session, refresh])

  useEffect(() => {
    if (!recording) return undefined
    const handleKey = (event: KeyboardEvent): void => {
      const target = event.target instanceof HTMLElement ? event.target.tagName : undefined
      if (event.key === 'Backspace' && !event.repeat && target !== 'INPUT') {
        event.preventDefault()
        handleUndo()
        return
      }
      // The event's fields are getters on its prototype, so they are read one by one (a spread would copy none).
      const { key, ctrlKey, metaKey, altKey, repeat } = event
      const kind = labelForKey({ key, ctrlKey, metaKey, altKey, repeat, targetTag: target })
      if (!kind) return
      event.preventDefault()
      handleLabel(kind)
    }
    window.addEventListener('keydown', handleKey)
    return (): void => window.removeEventListener('keydown', handleKey)
  }, [recording, handleUndo, handleLabel])

  const handleRecord = useCallback((): void => {
    if (recording) session.stopRecording()
    else session.startRecording()
    refresh()
  }, [recording, session, refresh])

  const handleExport = useCallback((): void => {
    if (!status.file) return
    downloadJson(serializeSessionFile(status.file), sessionFileName(new Date(status.file.recordedAt)))
  }, [status])

  const { durationMs, frames, labelCounts, lastLabel, file } = status
  return (
    <div className='lab-record'>
      <button
        type='button'
        className={`lab-button lab-record-button${recording ? ' lab-recording' : ''}`}
        onClick={handleRecord}
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
      <div className='lab-labels' role='group' aria-label='Labels'>
        {LABEL_KINDS.map((kind) => {
          const { name, key, color } = LABEL_INFO[kind]
          return (
            <button
              key={kind}
              type='button'
              className='lab-label-button'
              style={{ borderColor: color }}
              onClick={(): void => handleLabel(kind)}
              disabled={!recording}
              title={`Add a ${name.toLowerCase()} label (key ${key.toUpperCase()})`}
            >
              {name} <kbd>{key.toUpperCase()}</kbd>
              {labelCounts[kind] > 0 && <span className='lab-label-count'>{labelCounts[kind]}</span>}
            </button>
          )
        })}
        <button type='button' className='lab-label-button' onClick={handleUndo} disabled={!recording} title='Remove the newest label (Backspace)'>
          Undo <kbd>⌫</kbd>
        </button>
      </div>
      {recording && lastLabel && (
        <span className='lab-record-last'>{LABEL_INFO[lastLabel.kind].name} at {formatTime(lastLabel.t - status.startMs)}</span>
      )}
      {file && (
        <button type='button' className='lab-button' onClick={handleExport}>
          Export
        </button>
      )}
      <a className='lab-link' href='./review.html' target='_blank' rel='noreferrer'>Review</a>
    </div>
  )
}
