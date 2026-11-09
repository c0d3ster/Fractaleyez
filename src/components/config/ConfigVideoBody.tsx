import React, { useState, useEffect, useRef, useSyncExternalStore } from 'react'
import './Checkbox.css'

import { connectConfigActions } from './context/ConfigProvider'
import { useConfigSelector } from './context/useConfigSelector'
import { AppConfig } from '../../config/configDefaults'
import { isLiveClip, LIVE_CLIP } from '../../config/video.config'
import { cameraSource, CameraState } from '../../visualization/camera-source'

type ClipRowProps = {
  clip: string
  active: boolean
  onToggle: () => void
}

const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const useCameraState = (): CameraState => useSyncExternalStore(cameraSource.subscribe, cameraSource.getState)

const ClipRow = ({ clip, active, onToggle }: ClipRowProps): React.ReactElement => {
  const [duration, setDuration] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const video = document.createElement('video')
    video.preload = 'metadata'
    const onLoaded = (): void => {
      if (cancelled) return
      setDuration(formatDuration(video.duration))
      video.removeAttribute('src')
      video.load()
    }
    video.onloadedmetadata = onLoaded
    video.src = `/${clip}`
    return () => {
      cancelled = true
      video.onloadedmetadata = null
      video.removeAttribute('src')
      video.load()
    }
  }, [clip])

  const name = clip.replace(/\.[^.]+$/, '')

  return (
    <div className='config-checkbox-container'>
      <input
        type='checkbox'
        id={clip}
        checked={active}
        onChange={onToggle}
      />
      <label htmlFor={clip} className='clip-label'>
        <span className='clip-name'>{name}</span>
        {duration && <span className='clip-duration'>{duration}</span>}
      </label>
    </div>
  )
}

const LIVE_STATUS: Record<CameraState['status'], string> = {
  idle: 'cam',
  starting: '…',
  live: '● live',
  error: '!',
}

/** The camera entry: no duration, a status in its place, and a camera picker while it is on and more than one is plugged in. */
const LiveRow = ({ active, onToggle }: Omit<ClipRowProps, 'clip'>): React.ReactElement => {
  const { status, error, devices, deviceId } = useCameraState()
  const selected = devices.some((device) => device.deviceId === deviceId) ? deviceId ?? '' : ''

  const onDeviceChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    cameraSource.setDevice(event.target.value || null)
  }

  return (
    <>
      <div className='config-checkbox-container'>
        <input type='checkbox' id={LIVE_CLIP} checked={active} onChange={onToggle} />
        <label htmlFor={LIVE_CLIP} className='clip-label' title='Live feed from a camera plugged into this computer'>
          <span className='clip-name'>{LIVE_CLIP}</span>
          <span className={`clip-duration${active && status === 'live' ? ' clip-live' : ''}`}>
            {active ? LIVE_STATUS[status] : LIVE_STATUS.idle}
          </span>
        </label>
      </div>
      {active && error && <div className='clip-live-error'>{error}</div>}
      {active && devices.length > 1 && (
        <select className='clip-camera-select' aria-label='Camera' value={selected} onChange={onDeviceChange}>
          <option value=''>Default camera</option>
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
          ))}
        </select>
      )}
    </>
  )
}

type ConfigVideoBodyProps = {
  updateVideoClips: (clips: string[]) => void
}

const selectVideo = (config: AppConfig): AppConfig['video'] => config.video

const ConfigVideoBodyInner = ({ updateVideoClips }: ConfigVideoBodyProps): React.ReactElement => {
  const { clips, allClips = clips } = useConfigSelector(selectVideo)
  // The clips that were on before the camera took over, so turning the camera off brings them back.
  const clipsBeforeLive = useRef<string[]>([])

  const toggle = (clip: string): void => {
    const isActive = clips.includes(clip)
    if (isLiveClip(clip)) {
      if (isActive) {
        updateVideoClips(clipsBeforeLive.current)
        return
      }
      clipsBeforeLive.current = clips
      updateVideoClips([LIVE_CLIP])
      return
    }
    // The camera plays on its own: picking a clip while it is on switches back to clips.
    const files = clips.filter((c) => !isLiveClip(c))
    updateVideoClips(isActive ? files.filter((c) => c !== clip) : [...files, clip])
  }

  return (
    <>
      {allClips.map((clip) => (isLiveClip(clip) ? (
        <LiveRow key={clip} active={clips.includes(clip)} onToggle={() => toggle(clip)} />
      ) : (
        <ClipRow key={clip} clip={clip} active={clips.includes(clip)} onToggle={() => toggle(clip)} />
      )))}
    </>
  )
}

export const ConfigVideoBody = connectConfigActions(ConfigVideoBodyInner)
