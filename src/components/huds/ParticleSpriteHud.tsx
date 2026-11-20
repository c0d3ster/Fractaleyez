import React, { useCallback, useRef } from 'react'
import { useInfo } from '../config/info/info'
import './ParticleSpriteHud.css'

import { connectConfigActions, ConfigContextValue } from '../config/context/ConfigProvider'
import { useConfigSelector } from '../config/context/useConfigSelector'
import { AppConfig } from '../../config/configDefaults'
import { BUILTIN_PARTICLE_SPRITES, particleConfig } from '../../config/particle.config'
import { presetSpriteSrc } from '../../utils/presetSpriteSrc'
import { USER_REFERENCE } from '../../utils/userReference'
import { SpritePicker } from '../sprites'

const spriteLabel = (src: string): string => {
  if (src.startsWith('data:')) return 'Custom'
  const base = src.split('/').pop() ?? src
  return base.replace(/\.[^.]+$/, '') || base
}

type ParticleSpriteHudProps = {
  updateParticleSprites: (sprites: string[]) => Promise<void>
  applyUserReference: ConfigContextValue['applyUserReference']
  releaseUserReference: ConfigContextValue['releaseUserReference']
  userReferenceStandIn: ConfigContextValue['userReferenceStandIn']
  userSettings: ConfigContextValue['userSettings']
}

const selectSprites = (config: AppConfig): string[] => config.particle.sprites.value

const ParticleSpriteHudInner = ({ updateParticleSprites, applyUserReference, releaseUserReference, userReferenceStandIn, userSettings }: ParticleSpriteHudProps): React.ReactElement => {
  const info = useInfo()
  const sprites = useConfigSelector(selectSprites)
  const spritesRef = useRef(sprites)
  spritesRef.current = sprites
  const { sprites_MIN: minN, sprites_MAX: maxN } = particleConfig
  const atCapacity = sprites.length >= maxN

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

  // Built-in and uploaded images alike: in the list toggles out (down to the minimum), otherwise in (up to the maximum).
  const toggleSprite = useCallback(
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
  const isSelected = useCallback((src: string): boolean => sprites.includes(src), [sprites])
  const isTileDisabled = useCallback((): boolean => atCapacity, [atCapacity])
  const logoUrl = userSettings?.logoParticle

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
                {...info(src === userReferenceStandIn.particle ? USER_REFERENCE : spriteLabel(src))}
              >
                {src === userReferenceStandIn.particle ? (
                  <span className='particle-sprite-hud__chip-text'>{USER_REFERENCE}</span>
                ) : (
                  <img src={presetSpriteSrc(src)} alt='' />
                )}
                {sprites.length > minN ? (
                  <button
                    type='button'
                    className='ui-dismiss-bubble'
                    aria-label={`Remove ${src === userReferenceStandIn.particle ? USER_REFERENCE : spriteLabel(src)}`}
                    onClick={() => removeAt(index)}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <SpritePicker
          builtins={BUILTIN_PARTICLE_SPRITES}
          isSelected={isSelected}
          onPick={toggleSprite}
          onUploaded={onUploaded}
          logoSelected={logoUrl !== undefined && sprites.includes(logoUrl) && userReferenceStandIn.particle === null}
          // With @user active the logo is already in the list, so picking the plain tile turns that into a concrete sprite instead of removing it.
          onPickLogo={(url) => void (userReferenceStandIn.particle !== null ? releaseUserReference('particle') : Promise.resolve(toggleSprite(url)))}
          referenceSelected={userReferenceStandIn.particle !== null}
          onPickReference={() => void (userReferenceStandIn.particle !== null ? releaseUserReference('particle', { remove: true }) : applyUserReference('particle'))}
          isTileDisabled={isTileDisabled}
          addBlockedReason={atCapacity ? `Max ${maxN} particles reached` : undefined}
          noun='particle'
        />
      </div>
    </div>
  )
}

export const ParticleSpriteHud = connectConfigActions(ParticleSpriteHudInner)
