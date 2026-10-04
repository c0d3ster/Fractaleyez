import React, { useCallback, useState } from 'react'
import axios from 'axios'
import { prepareSprite } from 'sprite-strip'
import { useUser } from '@clerk/clerk-react'
import './UserSettingsPage.css'

import { connectConfig } from '../config/context/ConfigProvider'
import { ConfigSlider } from '../config/ConfigSlider'
import { UserSettings } from '../../config/userSettings.config'
import {
  PARTICLE_CROSSFADE_DURATION_DEFAULT_MS,
  PARTICLE_CROSSFADE_DURATION_MIN_MS,
  PARTICLE_CROSSFADE_DURATION_MAX_MS,
} from '../../config/visualizer.config'

// Mirrors ParticleSpriteHud's client-side MAX_DATA_URL_BYTES/SPRITE_MAX_SIDE_PX — the server's
// uploadParticleHandler enforces its own limits independently; these just save a round trip.
const MAX_DATA_URL_BYTES = 2 * 1024 * 1024
const LOGO_MAX_SIDE_PX = 512
const UPLOAD_ERROR_DISPLAY_MS = 4000
const CROSSFADE_DURATION_STEP_MS = 50

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const res = await fetch(dataUrl)
  return res.blob()
}

type UserSettingsPageProps = {
  userSettings: UserSettings | null
  updateUserSettings: (patch: Partial<UserSettings>) => void
  getToken: () => Promise<string | null>
}

// Rendered as a custom tab inside Clerk's UserButton "Manage account" modal (see TopBar) --
// Clerk only mounts this when a signed-in user has that modal open, so there's no isSignedIn
// gate or open/close state to manage here, unlike the old floating gear-button panel.
const UserSettingsPageInner = ({ userSettings, updateUserSettings, getToken }: UserSettingsPageProps): React.ReactElement => {
  const { user } = useUser()
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  // Tracks the slider's position while dragging without pushing every tick through
  // updateUserSettings (which re-renders the whole ConfigProvider tree and schedules a
  // server PATCH) -- only the final value on release/keyup is committed.
  const [draggingCrossfadeMs, setDraggingCrossfadeMs] = useState<number | null>(null)

  const crossfadeMs = draggingCrossfadeMs ?? userSettings?.crossfadeDurationMs ?? PARTICLE_CROSSFADE_DURATION_DEFAULT_MS

  // hasImage is false for Clerk's generated placeholder avatar -- only a real uploaded/social
  // photo (e.g. a Spotify or Google profile picture from a connected account) counts as a logo.
  const clerkAvatarUrl = user?.hasImage ? user.imageUrl : null
  const hasCustomLogo = Boolean(userSettings?.logoParticle)
  const logoPreviewUrl = userSettings?.logoParticle ?? clerkAvatarUrl

  const showUploadError = useCallback((message: string) => {
    setUploadError(message)
    setTimeout(() => setUploadError(null), UPLOAD_ERROR_DISPLAY_MS)
  }, [])

  const onCrossfadeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDraggingCrossfadeMs(Number(e.target.value))
  }, [])

  const onCrossfadeCommit = useCallback((value: number) => {
    setDraggingCrossfadeMs(null)
    updateUserSettings({ crossfadeDurationMs: value })
  }, [updateUserSettings])

  const warnBeforeRedZone = userSettings?.skipRedZoneWarning !== true

  const onRedZoneWarningChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateUserSettings({ skipRedZoneWarning: !e.target.checked })
  }, [updateUserSettings])

  const onLogoFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    const file = files?.[0]
    if (!file || !file.type.startsWith('image/')) {
      e.target.value = ''
      return
    }
    if (file.size > MAX_DATA_URL_BYTES) {
      showUploadError(`Image is too large (max ${MAX_DATA_URL_BYTES / (1024 * 1024)} MB).`)
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const raw = typeof reader.result === 'string' ? reader.result : ''
      if (!raw) return
      void (async () => {
        setUploading(true)
        try {
          const processed = await prepareSprite(raw, LOGO_MAX_SIDE_PX)
          const blob = await dataUrlToBlob(processed)
          if (blob.size > MAX_DATA_URL_BYTES) {
            showUploadError(`After scaling, the image is still over ${MAX_DATA_URL_BYTES / (1024 * 1024)} MB. Try a smaller image.`)
            return
          }
          const token = await getToken()
          if (!token) {
            showUploadError('Sign in to upload a logo.')
            return
          }
          const { data } = await axios.post<{ url: string }>('/api/uploadParticle', blob, {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': blob.type || 'image/png' },
          })
          updateUserSettings({ logoParticle: data.url })
        } catch {
          showUploadError('Could not upload this image.')
        } finally {
          setUploading(false)
        }
      })()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }, [getToken, updateUserSettings, showUploadError])

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
          <label className='user-settings-page__upload-label'>
            {uploading ? 'Uploading…' : logoPreviewUrl ? 'Replace' : '+ Add logo'}
            <input type='file' accept='image/*' disabled={uploading} onChange={onLogoFile} />
          </label>
        </div>
        {!hasCustomLogo && clerkAvatarUrl ? (
          <span className='user-settings-page__logo-hint'>Using your account photo — upload one to override</span>
        ) : null}
      </div>
      {uploadError ? <div className='user-settings-page__upload-error' role='alert'>{uploadError}</div> : null}
    </div>
  )
}

export const UserSettingsPage = connectConfig(UserSettingsPageInner)
