import React, { useCallback, useEffect, useState } from 'react'

import type { LabPhase, LabSession } from '../labSession'
import { formatTime } from '../recording/timeline'
import type { RecordingControls } from '../useRecording'
import type { PlayerMode, PlayerState } from './localPlayer'

// Often enough for the position to move smoothly enough to read.
const REFRESH_MS = 200

const EMPTY: PlayerState = { file: null, playing: false, positionMs: 0, loop: null, mode: 'mic', loading: false, error: null }

const MODE_TEXT: Record<PlayerMode, { name: string; title: string }> = {
  mic: { name: 'Mic', title: 'Out through the speakers and back in through the microphone: what the app hears live, room and all.' },
  direct: { name: 'Direct', title: 'Straight into the analysis (and the speakers), the microphone muted: clean and exact, but no room.' },
}

const isAudioFile = (file: File): boolean => file.type.startsWith('audio/') || /\.(wav|mp3|flac|ogg|oga|m4a|aac|aif|aiff|opus|webm)$/i.test(file.name)

type PlayerBarProps = {
  session: LabSession
  phase: LabPhase
  recording: RecordingControls
}

/**
 * The lab's file player: open or drop an audio file, play and pause it, seek, loop a stretch (A then B), choose whether the analysis hears
 * it through the mic or directly, and start playing and recording together, so a pass knows exactly where in the song it was.
 */
export const PlayerBar = ({ session, phase, recording }: PlayerBarProps): React.ReactElement => {
  const player = phase === 'running' ? session.getPlayer() : null
  const [state, setState] = useState<PlayerState>(EMPTY)
  const [loopStartMs, setLoopStartMs] = useState<number | null>(null)
  const refresh = useCallback((): void => setState(player?.state() ?? EMPTY), [player])

  useEffect(() => {
    refresh()
    if (!player) return undefined
    const timer = window.setInterval(refresh, REFRESH_MS)
    return (): void => window.clearInterval(timer)
  }, [player, refresh])

  const open = useCallback(async (picked: File): Promise<void> => {
    if (!player) return
    setLoopStartMs(null)
    const decoding = player.load(picked)
    refresh()
    await decoding
    refresh()
  }, [player, refresh])

  // An audio file dropped anywhere on the page loads (other files are left to the page).
  useEffect(() => {
    if (!player) return undefined
    const handleDragOver = (event: DragEvent): void => event.preventDefault()
    const handleDrop = (event: DragEvent): void => {
      const dropped = event.dataTransfer?.files[0]
      if (!dropped || !isAudioFile(dropped)) return
      event.preventDefault()
      open(dropped).catch(() => undefined)
    }
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    return (): void => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [player, open])

  const act = (action: () => void): void => {
    action()
    refresh()
  }

  const { file, playing, positionMs, loop, mode, loading, error } = state
  const ready = Boolean(player && file && !loading)
  const handleLoopPoint = (): void => {
    if (!player) return
    if (loopStartMs === null) {
      setLoopStartMs(positionMs)
      return
    }
    act(() => player.setLoop({ startMs: Math.min(loopStartMs, positionMs), endMs: Math.max(loopStartMs, positionMs) }))
    setLoopStartMs(null)
  }

  return (
    <div className='lab-player'>
      <label className={`lab-button lab-player-open${player ? '' : ' lab-player-disabled'}`} title={player ? 'Open an audio file, or drop one on the page' : 'Start the analysis first.'}>
        {loading ? 'Loading...' : 'Open track'}
        <input
          type='file'
          accept='audio/*'
          disabled={!player}
          onChange={(event): void => {
            const picked = event.target.files?.[0]
            event.target.value = ''
            if (picked) open(picked).catch(() => undefined)
          }}
        />
      </label>
      <button type='button' className='lab-button' disabled={!ready} onClick={(): void => act(() => (playing ? player!.pause() : player!.play()))}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <button
        type='button'
        className='lab-button lab-record-button'
        disabled={!ready || recording.recording}
        onClick={(): void => {
          session.playAndRecord()
          refresh()
          recording.refresh()
        }}
        title='Start playing and a recording together'
      >
        Play &amp; record
      </button>
      <span className='lab-player-name' title={file?.name}>{file ? file.name : 'No track'}</span>
      <span className='lab-player-time'>{formatTime(positionMs)} / {formatTime(file?.durationMs ?? 0)}</span>
      <input
        className='lab-player-seek'
        type='range'
        min={0}
        max={Math.max(1, Math.round(file?.durationMs ?? 1))}
        step={100}
        value={Math.round(positionMs)}
        disabled={!ready}
        onChange={(event): void => act(() => player!.seek(Number(event.target.value)))}
        aria-label='Song position'
      />
      <button
        type='button'
        className={`lab-label-button${loopStartMs !== null ? ' lab-label-active' : ''}`}
        disabled={!ready}
        onClick={handleLoopPoint}
        title={loopStartMs === null ? 'Mark where a loop starts (then press again where it ends)' : 'Mark where the loop ends'}
      >
        {loopStartMs === null ? 'Loop A' : `B (A ${formatTime(loopStartMs)})`}
      </button>
      {loop && (
        <button type='button' className='lab-label-button lab-label-active' onClick={(): void => act(() => player!.setLoop(null))} title='Stop looping'>
          Loop {formatTime(loop.startMs)}-{formatTime(loop.endMs)} ✕
        </button>
      )}
      <span className='lab-player-mode' role='radiogroup' aria-label='How the analysis hears the track'>
        {(Object.keys(MODE_TEXT) as PlayerMode[]).map((option) => (
          <button
            key={option}
            type='button'
            role='radio'
            aria-checked={mode === option}
            className={`lab-label-button${mode === option ? ' lab-label-active' : ''}`}
            disabled={!player}
            onClick={(): void => act(() => player!.setMode(option))}
            title={MODE_TEXT[option].title}
          >
            {MODE_TEXT[option].name}
          </button>
        ))}
      </span>
      {error && <span className='lab-status-error'>{error}</span>}
    </div>
  )
}
