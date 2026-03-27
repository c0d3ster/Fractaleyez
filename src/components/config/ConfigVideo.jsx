import React from 'react'
import './Checkbox.css'
import './ConfigCategory.css'

import { connectConfig } from './context/ConfigProvider'

const ConfigVideo = ({ config, updateVideoClips, isOpen, toggleOpen }) => {
  const { clips, allClips = clips } = config.video

  const toggle = (clip) => {
    const isActive = clips.includes(clip)
    const next = isActive ? clips.filter(c => c !== clip) : [...clips, clip]
    updateVideoClips(next)
  }

  return (
    <div className='category-container'>
      <h3 className='category-title' onClick={() => toggleOpen('video')}>
        video config
      </h3>
      <div className={`category-content${isOpen ? '' : ' hide-content'}`}>
        {allClips.map(clip => (
          <div className='config-checkbox-container' key={clip}>
            <input
              type='checkbox'
              id={clip}
              checked={clips.includes(clip)}
              onChange={() => toggle(clip)}
            />
            <label htmlFor={clip}>{clip.replace(/\.[^.]+$/, '')}</label>
          </div>
        ))}
      </div>
    </div>
  )
}

export default connectConfig(ConfigVideo)
