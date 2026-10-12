import React from 'react'
import './ParticleSpriteHud.css'

import { presetSpriteSrc } from '../../utils/presetSpriteSrc'

type UserSpriteTilesProps = {
  /** The viewer's persisted logo URL. No tile when they have none. */
  logoUrl: string | undefined
  logoSelected: boolean
  onPickLogo: (url: string) => void
  /** Admins only: adds the `@user` reference instead of the concrete URL. */
  isAdmin: boolean
  referenceSelected: boolean
  onPickReference: () => void
  disabled?: boolean
}

/** "Yours" row shared by the particle and logo pickers: the viewer's current logo, plus `@user` for admins. */
export const UserSpriteTiles = ({ logoUrl, logoSelected, onPickLogo, isAdmin, referenceSelected, onPickReference, disabled = false }: UserSpriteTilesProps): React.ReactElement | null => {
  if (!logoUrl && !isAdmin) return null
  return (
    <div>
      <div className='particle-sprite-hud__section-title'>Yours</div>
      <div className='particle-sprite-hud__library'>
        {logoUrl ? (
          <button
            type='button'
            className={`particle-sprite-hud__lib-btn${logoSelected ? ' particle-sprite-hud__lib-btn--selected' : ''}`}
            title='Your logo'
            onClick={() => onPickLogo(logoUrl)}
            disabled={disabled}
            aria-pressed={logoSelected}
          >
            <img src={presetSpriteSrc(logoUrl)} alt='Your logo' />
          </button>
        ) : null}
        {isAdmin ? (
          <button
            type='button'
            className={`particle-sprite-hud__lib-btn particle-sprite-hud__lib-btn--text${referenceSelected ? ' particle-sprite-hud__lib-btn--selected' : ''}`}
            title='Adds the @user reference: each viewer sees their own logo'
            onClick={onPickReference}
            disabled={disabled && !referenceSelected}
            aria-pressed={referenceSelected}
          >
            @user
          </button>
        ) : null}
      </div>
    </div>
  )
}
