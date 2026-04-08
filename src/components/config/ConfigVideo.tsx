import React, { useState, useEffect } from 'react'
import './Checkbox.css'
import './ConfigCategory.css'

import { connectConfig } from './context/ConfigProvider'
import { AppConfig } from '../../config/configDefaults'

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
    <div className='config-checkbox-container' key={clip}>
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

type ConfigVideoProps = {
  config: AppConfig
  updateVideoClips: (clips: string[]) => void
  isOpen: boolean
  toggleOpen: (name: string) => void
}

const ConfigVideoInner = ({ config, updateVideoClips, isOpen, toggleOpen }: ConfigVideoProps): React.ReactElement => {
  const { clips, allClips = clips } = config.video

  const toggle = (clip: string): void => {
    const isActive = clips.includes(clip)
    const next = isActive ? clips.filter(c => c !== clip) : [...clips, clip]
    updateVideoClips(next)
  }

  return (
    <div className='category-container category-container--video'>
      <h3 className='category-title' onClick={() => toggleOpen('video')}>
        video config
      </h3>
      <div className={`category-content${isOpen ? '' : ' hide-content'}`}>
        {allClips.map(clip => (
          <ClipRow
            key={clip}
            clip={clip}
            active={clips.includes(clip)}
            onToggle={() => toggle(clip)}
          />
        ))}
      </div>
    </div>
  )
}

export const ConfigVideo = connectConfig(ConfigVideoInner)
