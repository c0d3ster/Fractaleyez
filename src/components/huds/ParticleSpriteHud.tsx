import React, { useCallback, useRef } from 'react'
import './ParticleSpriteHud.css'

import { connectConfig } from '../config/context/ConfigProvider'
import { AppConfig } from '../../config/configDefaults'
import { BUILTIN_PARTICLE_SPRITES, particleConfig } from '../../config/particle.config'
import { presetSpriteSrc } from '../../utils/presetSpriteSrc'
import { useSpriteUpload } from './useSpriteUpload'

const spriteLabel = (src: string): string => {
  if (src.startsWith('data:')) return 'Custom'
  const base = src.split('/').pop() ?? src
  return base.replace(/\.[^.]+$/, '') || base
}

type ParticleSpriteHudProps = {
  config: AppConfig
  updateParticleSprites: (sprites: string[]) => Promise<void>
  isSignedIn: boolean
  getToken: () => Promise<string | null>
}

const ParticleSpriteHudInner = ({ config, updateParticleSprites, isSignedIn, getToken }: ParticleSpriteHudProps): React.ReactElement => {
  const sprites = config.particle.sprites.value
  const spritesRef = useRef(sprites)
  spritesRef.current = sprites
  const { sprites_MIN: minN, sprites_MAX: maxN } = particleConfig
  const atCapacity = sprites.length >= maxN
  const uploadDisabled = atCapacity || !isSignedIn

  const setSprites = useCallback(
    (next: string[]) => {
      void updateParticleSprites(next)
    },
    [updateParticleSprites],
  )

  const removeAt = useCallback(
    (index: number) => {
      if (sprites.length <= minN) return
      setSprites(sprites.filter((_, i) => i !== index))
    },
    [sprites, minN, setSprites],
  )

  const toggleBuiltin = useCallback(
    (path: string) => {
      const i = sprites.indexOf(path)
      if (i >= 0) {
        if (sprites.length <= minN) return
        setSprites(sprites.filter((_, j) => j !== i))
        return
      }
      if (sprites.length >= maxN) return
      setSprites([...sprites, path])
    },
    [sprites, minN, maxN, setSprites],
  )

  // setSprites -> updateParticleSprites awaits the sprite cache warming before
  // updating the live config, so the particle system rebuild it triggers resolves
  // straight to the cached blob: URL instead of racing a cold cross-origin fetch.
  const onUploaded = useCallback((url: string): void => setSprites([...spritesRef.current, url]), [setSprites])

  const { onFiles, uploadError } = useSpriteUpload({ isSignedIn, getToken, atCapacity, onUploaded })

  return (
    <div className='particle-sprite-hud'>
      <span className='particle-sprite-hud__label'>Particles</span>
      <div className='particle-sprite-hud__panel'>
        <div>
          <div className='particle-sprite-hud__section-heading'>
            <span className='particle-sprite-hud__section-title'>Active</span>
            <span className='particle-sprite-hud__section-count'>
              {sprites.length} / {maxN} (min {minN})
            </span>
          </div>
          <div className='particle-sprite-hud__active'>
            {sprites.map((src, index) => (
              <div
                key={`${src.slice(0, 48)}-${index}`}
                className='particle-sprite-hud__chip particle-sprite-hud__chip--on'
                title={spriteLabel(src)}
              >
                <img src={presetSpriteSrc(src)} alt='' />
                {sprites.length > minN ? (
                  <button
                    type='button'
                    className='ui-dismiss-bubble'
                    aria-label={`Remove ${spriteLabel(src)}`}
                    onClick={() => removeAt(index)}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className='particle-sprite-hud__section-title'>Built-in</div>
          <div className='particle-sprite-hud__library'>
            {BUILTIN_PARTICLE_SPRITES.map((path) => {
              const selected = sprites.includes(path)
              return (
                <button
                  key={path}
                  type='button'
                  className={`particle-sprite-hud__lib-btn${selected ? ' particle-sprite-hud__lib-btn--selected' : ''}`}
                  title={path}
                  onClick={() => toggleBuiltin(path)}
                  aria-pressed={selected}
                >
                  <img src={`/${path}`} alt='' />
                </button>
              )
            })}
          </div>
        </div>
        <div className='particle-sprite-hud__upload'>
          <label
            className={`particle-sprite-hud__upload-label${uploadDisabled ? ' particle-sprite-hud__upload-label--disabled' : ''}`}
            title={!isSignedIn ? 'Sign in to upload a custom particle' : atCapacity ? `Max ${maxN} particles reached` : undefined}
          >
            + Add image
            <input
              type='file'
              accept='image/*'
              disabled={uploadDisabled}
              onChange={onFiles}
            />
          </label>
          {uploadError ? (
            <div className='particle-sprite-hud__upload-error' role='alert'>
              {uploadError}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export const ParticleSpriteHud = connectConfig(ParticleSpriteHudInner)
