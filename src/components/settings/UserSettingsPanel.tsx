import React, { useCallback, useState } from 'react'
import axios from 'axios'
import './UserSettingsPanel.css'

import { connectConfig } from '../config/context/ConfigProvider'
import { ConfigSlider } from '../config/ConfigSlider'
import { UserSettings } from '../../config/userSettings.config'
import {
  PARTICLE_CROSSFADE_DURATION_DEFAULT_MS,
  PARTICLE_CROSSFADE_DURATION_MIN_MS,
  PARTICLE_CROSSFADE_DURATION_MAX_MS,
} from '../../config/visualizer.config'
import { prepareImageDataUrl, dataUrlToBlob } from '../../utils/imageUpload'

// Mirrors ParticleSpriteHud's client-side MAX_DATA_URL_BYTES/SPRITE_MAX_SIDE_PX — the server's
// uploadParticleHandler enforces its own limits independently; these just save a round trip.
const MAX_DATA_URL_BYTES = 2 * 1024 * 1024
const LOGO_MAX_SIDE_PX = 512
const UPLOAD_ERROR_DISPLAY_MS = 4000
const CROSSFADE_DURATION_STEP_MS = 50

type UserSettingsPanelProps = {
  userSettings: UserSettings | null
  updateUserSettings: (patch: Partial<UserSettings>) => void
  isSignedIn: boolean
  getToken: () => Promise<string | null>
}

const UserSettingsPanelInner = ({ userSettings, updateUserSettings, isSignedIn, getToken }: UserSettingsPanelProps): React.ReactElement | null => {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const crossfadeMs = userSettings?.crossfadeDurationMs ?? PARTICLE_CROSSFADE_DURATION_DEFAULT_MS

  const showUploadError = useCallback((message: string) => {
    setUploadError(message)
    setTimeout(() => setUploadError(null), UPLOAD_ERROR_DISPLAY_MS)
  }, [])

  const onCrossfadeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateUserSettings({ crossfadeDurationMs: Number(e.target.value) })
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
          const processed = await prepareImageDataUrl(raw, LOGO_MAX_SIDE_PX)
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

  // Settings live on the users collection (see server/models/User.ts) -- there's nothing to
  // configure without a signed-in user's document to store it on.
  if (!isSignedIn) return null

  return (
    <div className='user-settings'>
      <button
        type='button'
        className='user-settings__gear'
        aria-label='Settings'
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ⚙
      </button>
      {open ? (
        <div className='user-settings__panel'>
          <div className='user-settings__section-title'>Settings</div>
          <ConfigSlider
            name='crossfadeDuration'
            label='Crossfade Duration'
            displayValue={`${crossfadeMs}ms`}
            value={crossfadeMs}
            min={PARTICLE_CROSSFADE_DURATION_MIN_MS}
            max={PARTICLE_CROSSFADE_DURATION_MAX_MS}
            step={CROSSFADE_DURATION_STEP_MS}
            onChange={onCrossfadeChange}
          />
          <div className='user-settings__row'>
            <span className='user-settings__label'>Logo</span>
            <div className='user-settings__logo'>
              {userSettings?.logoParticle ? (
                <img className='user-settings__logo-preview' src={userSettings.logoParticle} alt='' />
              ) : null}
              <label className='user-settings__upload-label'>
                {uploading ? 'Uploading…' : userSettings?.logoParticle ? 'Replace' : '+ Add logo'}
                <input type='file' accept='image/*' disabled={uploading} onChange={onLogoFile} />
              </label>
            </div>
          </div>
          {uploadError ? <div className='user-settings__upload-error' role='alert'>{uploadError}</div> : null}
        </div>
      ) : null}
    </div>
  )
}

export const UserSettingsPanel = connectConfig(UserSettingsPanelInner)
