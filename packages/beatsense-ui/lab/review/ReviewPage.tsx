import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ONSET_BANDS } from 'beatsense'

import { downloadJson } from '../download'
import { deleteLabel, moveLabel, nudgeLabel } from '../recording/labelEdits'
import { countLabels, LABEL_INFO, LABEL_KINDS, type Label } from '../recording/labels'
import { editedFileName, parseSessionFile, serializeSessionFile, withLabels, type LabSessionFile } from '../recording/sessionFile'
import { beatMarks, formatTime, levelPeaks, sectionRuns, type View } from '../recording/timeline'
import type { TimelineData } from './drawTimeline'
import { SessionTimeline } from './SessionTimeline'

// One frame at the capture hop (60 a second): the arrow keys' nudge. With Shift, 100 ms.
const NUDGE_MS = 1000 / 60
const NUDGE_SHIFT_MS = 100

type Loaded = { file: LabSessionFile; name: string; data: TimelineData }

const timelineData = (file: LabSessionFile): TimelineData => {
  // A reduce, not Math.min(...list): an hour is 216000 frames, more arguments than a call takes.
  let min = Infinity
  let max = -Infinity
  file.frames.forEach(({ bpm }) => {
    if (bpm === null) return
    min = Math.min(min, bpm)
    max = Math.max(max, bpm)
  })
  if (min > max) {
    min = 60
    max = 180
  }
  return {
    originMs: file.startMs,
    frames: file.frames,
    runs: sectionRuns(file.frames, file.endMs),
    beats: beatMarks(file.frames),
    drumHits: file.drumHits,
    levelPeaks: levelPeaks(file.frames, ONSET_BANDS.length),
    bpmRange: { min: Math.floor(min - 2), max: Math.ceil(max + 2) },
  }
}

/** The review page: open an exported session, see its timelines with the labels, move or delete labels and export the result. */
export const ReviewPage = (): React.ReactElement => {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [labels, setLabels] = useState<Label[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [view, setView] = useState<View>({ startMs: 0, endMs: 1 })
  const [error, setError] = useState<string | null>(null)
  const [edited, setEdited] = useState(false)

  const bounds = useMemo(() => (loaded ? { startMs: loaded.file.startMs, endMs: loaded.file.endMs } : { startMs: 0, endMs: 1 }), [loaded])

  const open = useCallback(async (picked: File): Promise<void> => {
    try {
      const file = parseSessionFile(await picked.text())
      setLoaded({ file, name: picked.name, data: timelineData(file) })
      setLabels(file.labels)
      setSelectedId(null)
      setView({ startMs: file.startMs, endMs: Math.max(file.endMs, file.startMs + 1) })
      setEdited(false)
      setError(null)
    } catch (err) {
      setError(`${picked.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  // A file dropped anywhere on the page opens.
  useEffect(() => {
    const handleDragOver = (event: DragEvent): void => event.preventDefault()
    const handleDrop = (event: DragEvent): void => {
      event.preventDefault()
      const picked = event.dataTransfer?.files[0]
      if (picked) open(picked).catch(() => undefined)
    }
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    return (): void => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [open])

  const edit = useCallback((next: Label[]): void => {
    setLabels(next)
    setEdited(true)
  }, [])

  const handleMove = useCallback((id: number, t: number): void => edit(moveLabel(labels, id, t, bounds)), [labels, bounds, edit])

  const handleDelete = useCallback((): void => {
    if (selectedId === null) return
    edit(deleteLabel(labels, selectedId))
    setSelectedId(null)
  }, [labels, selectedId, edit])

  // Delete or Backspace removes the selected label, the arrows nudge it, Escape clears the selection.
  useEffect(() => {
    if (selectedId === null) return undefined
    const handleKey = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        handleDelete()
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const step = (event.shiftKey ? NUDGE_SHIFT_MS : NUDGE_MS) * (event.key === 'ArrowLeft' ? -1 : 1)
        edit(nudgeLabel(labels, selectedId, step, bounds))
      } else if (event.key === 'Escape') {
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    return (): void => window.removeEventListener('keydown', handleKey)
  }, [selectedId, labels, bounds, edit, handleDelete])

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!edited) return undefined
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => event.preventDefault()
    window.addEventListener('beforeunload', handleBeforeUnload)
    return (): void => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [edited])

  const handleExport = (): void => {
    if (!loaded) return
    downloadJson(serializeSessionFile(withLabels(loaded.file, labels)), editedFileName(loaded.name))
    setEdited(false)
  }

  const selected = labels.find(({ id }) => id === selectedId) ?? null
  const counts = countLabels(labels)
  return (
    <div className='lab review'>
      <header className='lab-bar'>
        <h1 className='lab-title'>beatsense review</h1>
        <div className='lab-controls'>
          <label className='lab-button review-open'>
            Open session
            <input
              type='file'
              accept='application/json,.json'
              onChange={(event): void => {
                const picked = event.target.files?.[0]
                event.target.value = ''
                if (picked) open(picked).catch(() => undefined)
              }}
            />
          </label>
          <button type='button' className='lab-button' onClick={handleExport} disabled={!loaded}>
            Export{edited ? ' *' : ''}
          </button>
          <a className='lab-link' href='./'>Lab</a>
        </div>
        <p className='lab-status' role='status'>
          {!loaded && !error && <span>Open or drop a session exported from the lab.</span>}
          {loaded && (
            <>
              <span><b>{loaded.name}</b></span>
              <span>Recorded <b>{new Date(loaded.file.recordedAt).toLocaleString()}</b></span>
              <span>Length <b>{formatTime(loaded.file.endMs - loaded.file.startMs)}</b></span>
              <span>Frames <b>{loaded.file.frames.length}</b></span>
              {loaded.file.sampleRate !== null && <span>Sample rate <b>{loaded.file.sampleRate} Hz</b></span>}
            </>
          )}
          {error && <span className='lab-status-error'>{error}</span>}
        </p>
      </header>
      {loaded && (
        <main className='review-main'>
          <div className='review-labels'>
            {LABEL_KINDS.map((kind) => (
              <span key={kind} className='review-label-count' style={{ borderColor: LABEL_INFO[kind].color }}>
                {LABEL_INFO[kind].name} <b>{counts[kind]}</b>
              </span>
            ))}
          </div>
          <SessionTimeline
            data={loaded.data}
            bounds={bounds}
            view={view}
            onViewChange={setView}
            labels={labels}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={handleMove}
          />
          <p className='review-selected'>
            {selected ? (
              <>
                <span>
                  <b>{LABEL_INFO[selected.kind].name}</b> at <b>{formatTime(selected.t - loaded.file.startMs, true)}</b>
                </span>
                <button type='button' className='lab-button' onClick={handleDelete}>Delete</button>
                <span className='review-hint'>Drag to move, arrows nudge a frame (Shift: 100 ms), Delete removes, Escape deselects.</span>
              </>
            ) : (
              <span className='review-hint'>
                Click a label to select it. Wheel zooms, drag pans, double-click shows the whole session.
              </span>
            )}
          </p>
        </main>
      )}
    </div>
  )
}
