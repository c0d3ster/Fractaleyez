import React, { useCallback } from 'react'
import '../huds/ParticleSpriteHud.css'

import { connectConfig, ConfigContextValue } from './context/ConfigProvider'
import { AppConfig } from '../../config/configDefaults'
import { BUILTIN_PARTICLE_SPRITES } from '../../config/particle.config'
import { presetSpriteSrc } from '../../utils/presetSpriteSrc'
import { useSpriteUpload } from '../huds/useSpriteUpload'
import { UserSpriteTiles } from '../huds/UserSpriteTiles'

type LogoSpritePickerProps = {
  config: AppConfig
  updateLogoSprite: (sprite: string) => Promise<void>
  applyUserReference: ConfigContextValue['applyUserReference']
  releaseUserReference: ConfigContextValue['releaseUserReference']
  userReferenceStandIn: ConfigContextValue['userReferenceStandIn']
  userSettings: ConfigContextValue['userSettings']
  isAdmin: boolean
  isSignedIn: boolean
  getToken: () => Promise<string | null>
}

const LogoSpritePickerInner = ({ config, updateLogoSprite, applyUserReference, releaseUserReference, userReferenceStandIn, userSettings, isAdmin, isSignedIn, getToken }: LogoSpritePickerProps): React.ReactElement => {
  const selected = config.logo.sprite.value[0]

  const choose = useCallback((src: string): void => {
    void updateLogoSprite(src)
  }, [updateLogoSprite])

  const { onFiles, uploadError } = useSpriteUpload({ isSignedIn, getToken, atCapacity: false, onUploaded: choose })

  // A custom upload is not in the built-in list, so it gets its own selected tile.
  // The viewer's own logo (plain or as @user) is drawn by the "Yours" row, so it never gets a duplicate tile here.
  const custom = selected && selected !== userSettings?.logoParticle && !(BUILTIN_PARTICLE_SPRITES as readonly string[]).includes(selected) ? selected : null
  const tiles = custom ? [...BUILTIN_PARTICLE_SPRITES, custom] : BUILTIN_PARTICLE_SPRITES

  return (
    <div className='particle-sprite-hud__panel'>
      <div className='particle-sprite-hud__library'>
        {tiles.map((src) => (
          <button
            key={src.slice(0, 48)}
            type='button'
            className={`particle-sprite-hud__lib-btn${src === selected ? ' particle-sprite-hud__lib-btn--selected' : ''}`}
            onClick={() => choose(src)}
            aria-pressed={src === selected}
          >
            <img src={presetSpriteSrc(src)} alt='' />
          </button>
        ))}
      </div>
      <UserSpriteTiles
        logoUrl={userSettings?.logoParticle}
        logoSelected={selected === userSettings?.logoParticle && userReferenceStandIn.logo === null}
        onPickLogo={(url) => void releaseUserReference('logo').then(() => choose(url))}
        isAdmin={isAdmin}
        referenceSelected={userReferenceStandIn.logo !== null}
        onPickReference={() => void applyUserReference('logo')}
      />
      <div className='particle-sprite-hud__upload'>
        <label
          className={`particle-sprite-hud__upload-label${isSignedIn ? '' : ' particle-sprite-hud__upload-label--disabled'}`}
          title={isSignedIn ? undefined : 'Sign in to upload a custom logo'}
        >
          + Add image
          <input type='file' accept='image/*' disabled={!isSignedIn} onChange={onFiles} />
        </label>
        {uploadError ? <div className='particle-sprite-hud__upload-error' role='alert'>{uploadError}</div> : null}
      </div>
    </div>
  )
}

export const LogoSpritePicker = connectConfig(LogoSpritePickerInner)
