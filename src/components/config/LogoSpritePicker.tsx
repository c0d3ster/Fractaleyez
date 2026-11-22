import React, { useCallback, useMemo } from 'react'
import '../huds/ParticleSpriteHud.css'

import { connectConfigActions, ConfigContextValue } from './context/ConfigProvider'
import { useConfigSelector } from './context/useConfigSelector'
import { AppConfig } from '../../config/configDefaults'
import { BUILTIN_PARTICLE_SPRITES } from '../../config/particle.config'
import { SpritePicker, useUploadLibrary } from '../sprites'

type LogoSpritePickerProps = {
  updateLogoSprite: (sprite: string) => Promise<void>
  applyUserReference: ConfigContextValue['applyUserReference']
  releaseUserReference: ConfigContextValue['releaseUserReference']
  userReferenceStandIn: ConfigContextValue['userReferenceStandIn']
  userSettings: ConfigContextValue['userSettings']
}

const selectLogoSprite = (config: AppConfig): string | undefined => config.logo.sprite.value[0]

const LogoSpritePickerInner = ({ updateLogoSprite, applyUserReference, releaseUserReference, userReferenceStandIn, userSettings }: LogoSpritePickerProps): React.ReactElement => {
  const selected = useConfigSelector(selectLogoSprite)
  const { uploads } = useUploadLibrary()

  const choose = useCallback((src: string): void => {
    void updateLogoSprite(src)
  }, [updateLogoSprite])

  // A logo from someone else's preset is in neither set, so it gets its own selected tile after the built-ins. The viewer's own
  // logo and uploads are drawn under Yours, so they never get a duplicate here.
  const builtins = useMemo((): readonly string[] => {
    const known = selected === undefined
      || selected === userSettings?.logoParticle
      || (BUILTIN_PARTICLE_SPRITES as readonly string[]).includes(selected)
      || uploads.some((u) => u.url === selected)
    return known ? BUILTIN_PARTICLE_SPRITES : [...BUILTIN_PARTICLE_SPRITES, selected]
  }, [selected, userSettings?.logoParticle, uploads])

  const isSelected = useCallback((src: string): boolean => src === selected, [selected])

  return (
    <div className='particle-sprite-hud__panel'>
      <SpritePicker
        builtins={builtins}
        isSelected={isSelected}
        onPick={choose}
        onUploaded={choose}
        logoSelected={selected === userSettings?.logoParticle && userReferenceStandIn.logo === null}
        onPickLogo={(url) => void releaseUserReference('logo').then(() => choose(url))}
        referenceSelected={userReferenceStandIn.logo !== null}
        onPickReference={() => void applyUserReference('logo')}
        noun='logo'
      />
    </div>
  )
}

export const LogoSpritePicker = connectConfigActions(LogoSpritePickerInner)
