import { useCallback, useEffect, useState } from 'react'

import { downloadJson } from './download'
import type { LabSession, RecordingStatus } from './labSession'
import { labelForKey } from './recording/hotkeys'
import type { LabelKind } from './recording/labels'
import { serializeSessionFile, sessionFileName } from './recording/sessionFile'

// Often enough for the recorded time to tick visibly.
const REFRESH_MS = 200

export type RecordingControls = {
  status: RecordingStatus
  recording: boolean
  /** Record, or Stop while recording. */
  toggle: () => void
  addLabel: (kind: LabelKind) => void
  undo: () => void
  /** Downloads the stopped session. */
  exportFile: () => void
}

/**
 * The recording's state and actions, shared by the top bar and the label buttons under the HUDs. While recording it polls the status and
 * listens for the hotkeys on the whole window (Backspace undoes the newest label).
 */
export const useRecording = (session: LabSession): RecordingControls => {
  const [status, setStatus] = useState<RecordingStatus>(() => session.recordingStatus())
  const refresh = useCallback((): void => setStatus(session.recordingStatus()), [session])
  const recording = status.phase === 'recording'

  useEffect(() => {
    if (!recording) return undefined
    const timer = window.setInterval(refresh, REFRESH_MS)
    return (): void => window.clearInterval(timer)
  }, [recording, refresh])

  const addLabel = useCallback((kind: LabelKind): void => {
    session.addLabel(kind)
    refresh()
  }, [session, refresh])

  const undo = useCallback((): void => {
    session.undoLabel()
    refresh()
  }, [session, refresh])

  useEffect(() => {
    if (!recording) return undefined
    const handleKey = (event: KeyboardEvent): void => {
      const target = event.target instanceof HTMLElement ? event.target.tagName : undefined
      if (event.key === 'Backspace' && !event.repeat && target !== 'INPUT') {
        event.preventDefault()
        undo()
        return
      }
      // The event's fields are getters on its prototype, so they are read one by one (a spread would copy none).
      const { key, ctrlKey, metaKey, altKey, repeat } = event
      const kind = labelForKey({ key, ctrlKey, metaKey, altKey, repeat, targetTag: target })
      if (!kind) return
      event.preventDefault()
      addLabel(kind)
    }
    window.addEventListener('keydown', handleKey)
    return (): void => window.removeEventListener('keydown', handleKey)
  }, [recording, undo, addLabel])

  const toggle = useCallback((): void => {
    if (recording) session.stopRecording()
    else session.startRecording()
    refresh()
  }, [recording, session, refresh])

  const exportFile = useCallback((): void => {
    if (!status.file) return
    downloadJson(serializeSessionFile(status.file), sessionFileName(new Date(status.file.recordedAt)))
  }, [status])

  return { status, recording, toggle, addLabel, undo, exportFile }
}
