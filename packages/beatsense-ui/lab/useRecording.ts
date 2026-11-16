import { useCallback, useEffect, useState } from 'react'

import { downloadJson } from './download'
import type { LabSession, RecordingStatus } from './labSession'
import { actionForKey, isUndoKey, type KeyPress } from './recording/hotkeys'
import type { LabelAction } from './recording/labels'
import { serializeSessionFile, sessionFileNameFor } from './recording/sessionFile'

// Often enough for the recorded time to tick visibly.
const REFRESH_MS = 200

const DROP_SESSION_TEXT = 'The stopped session has not been exported. A new recording drops it. Record anyway?'

export type RecordingControls = {
  status: RecordingStatus
  recording: boolean
  /** Record (asking first if that would drop a stopped session that was never exported), or Stop while recording. */
  toggle: () => void
  /** The player and a recording together, asking first as Record does. */
  playAndRecord: () => void
  addLabel: (action: LabelAction) => void
  undo: () => void
  /** Downloads the stopped session. */
  exportFile: () => void
  /** Reads the status again now (after something outside these controls started or stopped a recording). */
  refresh: () => void
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

  const addLabel = useCallback((action: LabelAction): void => {
    session.addLabel(action)
    refresh()
  }, [session, refresh])

  const undo = useCallback((): void => {
    session.undoLabel()
    refresh()
  }, [session, refresh])

  useEffect(() => {
    if (!recording) return undefined
    const handleKey = (event: KeyboardEvent): void => {
      // The event's fields are getters on its prototype, so they are read one by one (a spread would copy none).
      const { key, ctrlKey, metaKey, altKey, repeat, target } = event
      const press: KeyPress = {
        key, ctrlKey, metaKey, altKey, repeat,
        targetTag: target instanceof HTMLElement ? target.tagName : undefined,
        targetType: target instanceof HTMLInputElement ? target.type : undefined,
        targetEditable: target instanceof HTMLElement && target.isContentEditable,
      }
      if (isUndoKey(press)) {
        event.preventDefault()
        undo()
        return
      }
      const action = actionForKey(press)
      if (!action) return
      event.preventDefault()
      addLabel(action)
    }
    window.addEventListener('keydown', handleKey)
    return (): void => window.removeEventListener('keydown', handleKey)
  }, [recording, undo, addLabel])

  /** Whether a new recording may start: yes unless it would drop a stopped session that was never exported and the person says no. */
  const mayDropSession = useCallback((): boolean => !session.hasUnexportedSession() || window.confirm(DROP_SESSION_TEXT), [session])

  const toggle = useCallback((): void => {
    if (recording) session.stopRecording()
    else if (mayDropSession()) session.startRecording()
    refresh()
  }, [recording, session, refresh, mayDropSession])

  const playAndRecord = useCallback((): void => {
    if (recording || !mayDropSession()) return
    session.playAndRecord()
    refresh()
  }, [recording, session, refresh, mayDropSession])

  const exportFile = useCallback((): void => {
    if (!status.file) return
    downloadJson(serializeSessionFile(status.file), sessionFileNameFor(status.file))
    session.markExported()
  }, [status, session])

  return { status, recording, toggle, playAndRecord, addLabel, undo, exportFile, refresh }
}
