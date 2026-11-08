import React, { useCallback, useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import './UserSettingsPage.css'

import { connectConfigActions } from '../config/context/ConfigProvider'
import { ConfigSlider } from '../config/ConfigSlider'
import { UserSettings } from '../../config/userSettings.config'
import {
  isQualitySetting,
  QUALITY_HINTS,
  QUALITY_LABELS,
  QUALITY_SETTING_DEFAULT,
  QUALITY_SETTINGS,
} from '../../config/quality.config'
import {
  PARTICLE_CROSSFADE_DURATION_DEFAULT_MS,
  PARTICLE_CROSSFADE_DURATION_MIN_MS,
  PARTICLE_CROSSFADE_DURATION_MAX_MS,
} from '../../config/visualizer.config'

const CROSSFADE_DURATION_STEP_MS = 50

type UserSettingsPageProps = {
  userSettings: UserSettings | null
  updateUserSettings: (patch: Partial<UserSettings>) => void
}

// Rendered as a custom tab inside Clerk's UserButton "Manage account" modal (see TopBar) --
// Clerk only mounts this when a signed-in user has that modal open, so there's no isSignedIn
// gate or open/close state to manage here, unlike the old floating gear-button panel.
const UserSettingsPageInner = ({ userSettings, updateUserSettings }: UserSettingsPageProps): React.ReactElement => {
  const { user } = useUser()
  // Tracks the slider's position while dragging without pushing every tick through
  // updateUserSettings (which re-renders the whole ConfigProvider tree and schedules a
  // server PATCH) -- only the final value on release/keyup is committed.
  const [draggingCrossfadeMs, setDraggingCrossfadeMs] = useState<number | null>(null)

  const crossfadeMs = draggingCrossfadeMs ?? userSettings?.crossfadeDurationMs ?? PARTICLE_CROSSFADE_DURATION_DEFAULT_MS

  // The logo follows the account photo (ConfigProvider saves it as logoParticle), so this tab only previews it.
  // hasImage is false for Clerk's generated placeholder avatar.
  const logoPreviewUrl = userSettings?.logoParticle ?? (user?.hasImage ? user.imageUrl : null)

  const onCrossfadeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDraggingCrossfadeMs(Number(e.target.value))
  }, [])

  const onCrossfadeCommit = useCallback((value: number) => {
    setDraggingCrossfadeMs(null)
    updateUserSettings({ crossfadeDurationMs: value })
  }, [updateUserSettings])

  const quality = userSettings?.quality ?? QUALITY_SETTING_DEFAULT

  const onQualityChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = e.target
    if (isQualitySetting(value)) updateUserSettings({ quality: value })
  }, [updateUserSettings])

  const warnBeforeRedZone = userSettings?.skipRedZoneWarning !== true

  const onRedZoneWarningChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateUserSettings({ skipRedZoneWarning: !e.target.checked })
  }, [updateUserSettings])

  return (
    <div className='user-settings-page'>
      <div className='user-settings-page__section-title'>Visualizer</div>
      <ConfigSlider
        name='crossfadeDuration'
        label='Crossfade Duration'
        displayValue={`${crossfadeMs}ms`}
        value={crossfadeMs}
        min={PARTICLE_CROSSFADE_DURATION_MIN_MS}
        max={PARTICLE_CROSSFADE_DURATION_MAX_MS}
        step={CROSSFADE_DURATION_STEP_MS}
        onChange={onCrossfadeChange}
        onCommit={onCrossfadeCommit}
      />
      <div className='user-settings-page__row'>
        <label className='user-settings-page__label' htmlFor='quality-setting'>Quality</label>
        <select id='quality-setting' className='user-settings-page__select' value={quality} onChange={onQualityChange}>
          {QUALITY_SETTINGS.map((setting) => (
            <option key={setting} value={setting}>{QUALITY_LABELS[setting]}</option>
          ))}
        </select>
        <span className='user-settings-page__logo-hint'>{QUALITY_HINTS[quality]}</span>
      </div>
      <label className='user-settings-page__checkbox'>
        <input type='checkbox' checked={warnBeforeRedZone} onChange={onRedZoneWarningChange} />
        Warn me before going into the red zone
      </label>
      <div className='user-settings-page__row'>
        <span className='user-settings-page__label'>Logo</span>
        <div className='user-settings-page__logo'>
          {logoPreviewUrl ? (
            <img className='user-settings-page__logo-preview' src={logoPreviewUrl} alt='' />
          ) : null}
        </div>
        <span className='user-settings-page__logo-hint'>Change it from your account photo on the Profile tab</span>
      </div>
    </div>
  )
}

export const UserSettingsPage = connectConfigActions(UserSettingsPageInner)
