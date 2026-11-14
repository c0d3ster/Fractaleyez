import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ONSET_BANDS } from 'beatsense'

import { downloadJson } from '../download'
import { alignPasses } from '../recording/align'
import { deleteLabel, moveLabel, nudgeLabel } from '../recording/labelEdits'
import { LABEL_INFO, LABEL_KINDS, type Label } from '../recording/labels'
import { AGREE_MS, agreementByKind, groupLabels } from '../recording/mergeLabels'
import { checkSession, editedFileName, parseJson, serializeSessionFile, type LabSessionFile } from '../recording/sessionFile'
import {
  addPass, fromViewId, parseLabFile, PLAYBACK_CORRECTION_MS, PLAYBACK_MIN_OVERLAP_MS, removePass, samePlayback, serializeSongFile, setPassLabels, setPassOffset,
  passOrigin, songBounds, songFileName, songFrames, songLabels, songOrigin, type LabSongFile, type PassAlignment, type SongLabel, type SongPass,
} from '../recording/songFile'
import { beatMarks, formatTime, levelPeaks, sectionRuns, type View } from '../recording/timeline'
import type { TimelineData } from './drawTimeline'
import { PassList } from './PassList'
import { SessionTimeline } from './SessionTimeline'

// One frame at the capture hop (60 a second): the arrow keys' nudge. With Shift, 100 ms.
const NUDGE_MS = 1000 / 60
const NUDGE_SHIFT_MS = 100

/** The model's timelines from the reference pass (the first), on song time. */
const timelineData = (first: SongPass): TimelineData => {
  const { frames, drumHits } = songFrames(first)
  // A loop, not Math.min(...list): an hour is 216000 frames, more arguments than a call takes.
  let min = Infinity
  let max = -Infinity
  frames.forEach(({ bpm }) => {
    if (bpm === null) return
    min = Math.min(min, bpm)
    max = Math.max(max, bpm)
  })
  if (min > max) {
    min = 60
    max = 180
  }
  return {
    originMs: passOrigin(first),
    frames,
    runs: sectionRuns(frames, frames[frames.length - 1]?.t ?? 0),
    beats: beatMarks(frames),
    drumHits,
    levelPeaks: levelPeaks(frames, ONSET_BANDS.length),
    bpmRange: { min: Math.floor(min - 2), max: Math.ceil(max + 2) },
  }
}

/**
 * Where a pass sits on the song. Two passes of the same file through the lab's player already share song time, so only the small
 * correction (the speakers to the mic) is searched, around zero. Otherwise the whole song is searched; with no match the pass is lined up
 * start to start and marked as set by hand.
 */
const placePass = (song: LabSongFile, session: LabSessionFile): { offsetMs: number; alignment: PassAlignment | null } => {
  const first = song.passes[0]!
  const asPass = (offsetMs: number): SongPass => ({ name: '', offsetMs, alignment: null, session })
  if (samePlayback(first.session, session)) {
    const correction = alignPasses(songFrames(first).frames, songFrames(asPass(0)).frames, {
      hint: { offsetMs: 0, withinMs: PLAYBACK_CORRECTION_MS },
      minOverlapMs: PLAYBACK_MIN_OVERLAP_MS,
    })
    if (!correction) return { offsetMs: 0, alignment: null }
    return { offsetMs: correction.offsetMs, alignment: { score: correction.score, runnerUp: correction.runnerUp } }
  }
  const found = alignPasses(songFrames(first).frames, session.frames)
  if (!found) return { offsetMs: first.session.startMs - session.startMs, alignment: null }
  return { offsetMs: found.offsetMs, alignment: { score: found.score, runnerUp: found.runnerUp } }
}

const alignedPass = (song: LabSongFile, session: LabSessionFile, name: string): LabSongFile =>
  addPass(song, { name, ...placePass(song, session), session })

const allPasses = (song: LabSongFile): Set<number> => new Set(song.passes.map((_, i) => i))

/**
 * The review page: open a session or a song, add more passes over the same song (each aligned to the first by its onsets), see every
 * pass's labels on the song's timeline over the first pass's model output, move or delete labels, and export.
 */
export const ReviewPage = (): React.ReactElement => {
  const [song, setSong] = useState<LabSongFile | null>(null)
  /** The file it came from, and whether that was a session (a song of one pass from a session exports as a session again). */
  const [source, setSource] = useState<{ name: string; session: boolean } | null>(null)
  const [shown, setShown] = useState<ReadonlySet<number>>(new Set())
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [view, setView] = useState<View>({ startMs: 0, endMs: 1 })
  const [error, setError] = useState<string | null>(null)
  const [edited, setEdited] = useState(false)

  const reference = song?.passes[0]?.session ?? null
  // The model's lanes come from the first pass alone, so they are worked out again only when it changes (not on every label edit).
  const firstPass = song?.passes[0] ?? null
  const data = useMemo(() => (firstPass ? timelineData(firstPass) : null), [firstPass])
  const bounds = useMemo(() => (song ? songBounds(song) : { startMs: 0, endMs: 1 }), [song])
  const labels = useMemo(() => (song ? songLabels(song, shown) : []), [song, shown])
  const groups = useMemo(() => groupLabels(labels), [labels])
  const agreement = useMemo(() => agreementByKind(groups, labels), [groups, labels])
  const multiPass = (song?.passes.length ?? 0) > 1

  const update = useCallback((next: LabSongFile): void => {
    setSong(next)
    setEdited(true)
  }, [])

  const open = useCallback(async (picked: File): Promise<void> => {
    try {
      const text = await picked.text()
      const next = parseLabFile(text, picked.name)
      const { startMs, endMs } = songBounds(next)
      setSong(next)
      setSource({ name: picked.name, session: next.passes.length === 1 && !/\.song\.json$/i.test(picked.name) })
      setShown(allPasses(next))
      setSelectedId(null)
      setView({ startMs, endMs: Math.max(endMs, startMs + 1) })
      setEdited(false)
      setError(null)
    } catch (err) {
      setError(`${picked.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  const addPassFile = useCallback(async (picked: File): Promise<void> => {
    if (!song) return
    try {
      const next = alignedPass(song, checkSession(parseJson(await picked.text())), picked.name)
      update(next)
      setShown(allPasses(next))
      setError(null)
    } catch (err) {
      setError(`${picked.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [song, update])

  // A file dropped anywhere opens, or with a song open, is added as a pass.
  useEffect(() => {
    const handleDragOver = (event: DragEvent): void => event.preventDefault()
    const handleDrop = (event: DragEvent): void => {
      event.preventDefault()
      const picked = event.dataTransfer?.files[0]
      if (!picked) return
      const action = song && !/\.song\.json$/i.test(picked.name) ? addPassFile : open
      action(picked).catch(() => undefined)
    }
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    return (): void => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [open, addPassFile, song])

  /** Applies an edit to the labels of a label's pass, on that pass's own clock. */
  const editPass = useCallback((id: number, change: (passLabels: Label[], label: SongLabel, passBoundsOnOwnClock: { startMs: number; endMs: number }) => Label[]): void => {
    if (!song) return
    const label = labels.find((candidate) => candidate.id === id)
    const pass = label ? song.passes[label.passIndex] : undefined
    if (!label || !pass) return
    const own = { startMs: pass.session.startMs, endMs: pass.session.endMs }
    update(setPassLabels(song, label.passIndex, change(pass.session.labels, label, own)))
  }, [song, labels, update])

  // A move is by how far it went on song time, so it stays right within a slice of a pass that seeked or looped.
  const handleMove = useCallback((id: number, t: number): void => {
    editPass(id, (passLabels, label, own) => moveLabel(passLabels, label.labelId, label.passT + (t - label.t), own))
  }, [editPass])

  const handleDelete = useCallback((): void => {
    if (selectedId === null) return
    editPass(selectedId, (passLabels, label) => deleteLabel(passLabels, label.labelId))
    setSelectedId(null)
  }, [selectedId, editPass])

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
        editPass(selectedId, (passLabels, label, own) => nudgeLabel(passLabels, label.labelId, step, own))
      } else if (event.key === 'Escape') {
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    return (): void => window.removeEventListener('keydown', handleKey)
  }, [selectedId, editPass, handleDelete])

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!edited) return undefined
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => event.preventDefault()
    window.addEventListener('beforeunload', handleBeforeUnload)
    return (): void => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [edited])

  const handleToggle = (passIndex: number): void => {
    const next = new Set(shown)
    if (next.has(passIndex)) next.delete(passIndex)
    else next.add(passIndex)
    setShown(next)
  }

  const handleNudgePass = (passIndex: number, deltaMs: number): void => {
    if (!song) return
    update(setPassOffset(song, passIndex, song.passes[passIndex]!.offsetMs + deltaMs))
  }

  const handleRealign = (passIndex: number): void => {
    if (!song) return
    const { offsetMs, alignment } = placePass(song, song.passes[passIndex]!.session)
    if (!alignment) setError(`Pass ${passIndex + 1} could not be matched to the first pass; it keeps the player's or a start-to-start position.`)
    update(setPassOffset(song, passIndex, offsetMs, alignment))
  }

  const handleRemovePass = (passIndex: number): void => {
    if (!song) return
    const next = removePass(song, passIndex)
    update(next)
    setShown(allPasses(next))
    setSelectedId(null)
  }

  const handleExport = (): void => {
    if (!song || !source) return
    if (!multiPass && source.session) downloadJson(serializeSessionFile(song.passes[0]!.session), editedFileName(source.name))
    else downloadJson(serializeSongFile(song), songFileName(song.title))
    setEdited(false)
  }

  const selected = labels.find(({ id }) => id === selectedId) ?? null
  const selectedGroup = selected ? groups.find(({ members }) => members.some(({ id }) => id === selected.id)) ?? null : null
  const origin = song ? songOrigin(song) : 0
  const tagSuffix = useCallback((id: number): string => (multiPass ? String(fromViewId(id).passIndex + 1) : ''), [multiPass])

  return (
    <div className='lab review'>
      <header className='lab-bar'>
        <h1 className='lab-title'>beatsense review</h1>
        <div className='lab-controls'>
          <label className='lab-button review-open'>
            Open
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
          <label className={`lab-button review-open${song ? '' : ' review-disabled'}`} title='Another pass over the same song: a session exported from the lab. It is aligned to the first pass by its onsets.'>
            Add pass
            <input
              type='file'
              accept='application/json,.json'
              disabled={!song}
              onChange={(event): void => {
                const picked = event.target.files?.[0]
                event.target.value = ''
                if (picked) addPassFile(picked).catch(() => undefined)
              }}
            />
          </label>
          <button type='button' className='lab-button' onClick={handleExport} disabled={!song}>
            {!multiPass && source?.session ? 'Export session' : 'Export song'}{edited ? ' *' : ''}
          </button>
          <a className='lab-link' href='./'>Lab</a>
        </div>
        <p className='lab-status' role='status'>
          {!song && !error && <span>Open or drop a session exported from the lab, or a song. Drop more sessions of the same song to add passes.</span>}
          {song && reference && (
            <>
              <label className='review-title'>
                Song{' '}
                <input
                  value={song.title}
                  onChange={(event): void => update({ ...song, title: event.target.value })}
                  aria-label='Song title'
                />
              </label>
              <span>Length <b>{formatTime(bounds.endMs - bounds.startMs)}</b></span>
              <span>Passes <b>{song.passes.length}</b></span>
              <span>Recorded <b>{new Date(reference.recordedAt).toLocaleString()}</b></span>
            </>
          )}
          {error && <span className='lab-status-error'>{error}</span>}
        </p>
      </header>
      {song && data && (
        <main className='review-main'>
          {multiPass && (
            <PassList song={song} shown={shown} onToggle={handleToggle} onNudge={handleNudgePass} onRealign={handleRealign} onRemove={handleRemovePass} />
          )}
          <div className='review-labels'>
            {LABEL_KINDS.map((kind) => {
              const { passes, groups: count, agreed } = agreement[kind]
              const counted = labels.filter((label) => label.kind === kind).length
              return (
                <span
                  key={kind}
                  className='review-label-count'
                  style={{ borderColor: LABEL_INFO[kind].color }}
                  title={multiPass && passes > 1 ? `${agreed} of ${count} moments are labelled by all ${passes} passes that labelled ${LABEL_INFO[kind].name.toLowerCase()}s (within ${AGREE_MS} ms)` : undefined}
                >
                  {LABEL_INFO[kind].name} <b>{counted}</b>
                  {multiPass && passes > 1 && <> agreed <b>{agreed}</b>/{count}</>}
                </span>
              )
            })}
          </div>
          <SessionTimeline
            data={data}
            bounds={bounds}
            view={view}
            onViewChange={setView}
            labels={labels}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={handleMove}
            tagSuffix={tagSuffix}
          />
          <p className='review-selected'>
            {selected ? (
              <>
                <span>
                  <b>{LABEL_INFO[selected.kind].name}</b>
                  {multiPass && <> of pass <b>{fromViewId(selected.id).passIndex + 1}</b></>} at <b>{formatTime(selected.t - origin, true)}</b>
                  {multiPass && selectedGroup && (
                    <> (labelled by <b>{selectedGroup.members.length}</b> of {agreement[selected.kind].passes} passes)</>
                  )}
                </span>
                <button type='button' className='lab-button' onClick={handleDelete}>Delete</button>
                <span className='review-hint'>Drag to move, arrows nudge a frame (Shift: 100 ms), Delete removes, Escape deselects.</span>
              </>
            ) : (
              <span className='review-hint'>
                Click a label to select it. Wheel zooms, drag pans, double-click shows the whole song.
                {multiPass && ' The model\'s lanes are the first pass\'s; tags carry their pass number.'}
              </span>
            )}
          </p>
        </main>
      )}
    </div>
  )
}
