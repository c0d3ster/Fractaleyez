import React, { useCallback, useState } from 'react'
import axios from 'axios'
import { prepareSprite } from 'sprite-strip'
import { useUpgrade } from '../upgrade/UpgradeProvider'
import { Entitlements, Usage, hasRoomFor, isQuotaExceeded, quotaMessage } from '../../config/plans.config'

// Mirrors the server's MAX_UPLOAD_BYTES / MAX_DECODED_DIMENSION_PX in uploadParticleHandler.ts —
// these client-side checks only save a round trip, the server enforces its own limits independently.
export const MAX_DATA_URL_BYTES = 2 * 1024 * 1024
export const SPRITE_MAX_SIDE_PX = 512
const UPLOAD_ERROR_DISPLAY_MS = 4000

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const res = await fetch(dataUrl)
  return res.blob()
}

type UseSpriteUploadOptions = {
  isSignedIn: boolean
  getToken: () => Promise<string | null>
  // True when the picker cannot accept another image (e.g. multi-select at its cap); the file is ignored silently.
  atCapacity: boolean
  // Called with the uploaded sprite URL. The caller decides whether to add it to an array or replace a value.
  onUploaded: (url: string) => void
  // The plan's upload quota and usage, from the config context. A user at the limit gets the upgrade prompt instead of an upload.
  entitlements: Entitlements | null
  usage: Usage | null
  // Re-reads usage after an upload or a refusal.
  refreshAccount: () => void
}

type UseSpriteUpload = {
  onFiles: (e: React.ChangeEvent<HTMLInputElement>) => void
  uploadError: string | null
}

export const useSpriteUpload = ({
  isSignedIn,
  getToken,
  atCapacity,
  onUploaded,
  entitlements,
  usage,
  refreshAccount,
}: UseSpriteUploadOptions): UseSpriteUpload => {
  const [uploadError, setUploadError] = useState<string | null>(null)
  const { requestUpgrade } = useUpgrade()

  const showUploadError = useCallback((message: string): void => {
    setUploadError(message)
    setTimeout(() => setUploadError(null), UPLOAD_ERROR_DISPLAY_MS)
  }, [])

  const onFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const files = e.target.files
      if (!files?.length) return
      const file = files[0]
      if (!file || !file.type.startsWith('image/')) return
      if (!isSignedIn) {
        showUploadError('Sign in to upload a custom particle.')
        requestUpgrade('Sign in to upload a custom particle.')
        e.target.value = ''
        return
      }
      if (entitlements && !hasRoomFor(entitlements, usage, 'particleUploads')) {
        const message = quotaMessage({ quota: 'particleUploads', limit: entitlements.quotas.particleUploads ?? 0, plan: entitlements.plan })
        showUploadError(message)
        requestUpgrade(message)
        e.target.value = ''
        return
      }
      if (atCapacity) {
        e.target.value = ''
        return
      }
      if (file.size > MAX_DATA_URL_BYTES) {
        showUploadError(`Image is too large (max ${MAX_DATA_URL_BYTES / (1024 * 1024)} MB per file).`)
        e.target.value = ''
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        const raw = typeof reader.result === 'string' ? reader.result : ''
        if (!raw) return
        void (async () => {
          try {
            const processed = await prepareSprite(raw, SPRITE_MAX_SIDE_PX)
            const blob = await dataUrlToBlob(processed)
            if (blob.size > MAX_DATA_URL_BYTES) {
              showUploadError(
                `After scaling, the image is still over ${MAX_DATA_URL_BYTES / (1024 * 1024)} MB. Try a smaller or simpler image.`,
              )
              return
            }
            const token = await getToken()
            if (!token) {
              showUploadError('Sign in to upload a custom particle.')
              return
            }
            const { data } = await axios.post<{ url: string }>('/api/uploadParticle', blob, {
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': blob.type || 'image/png' },
            })
            onUploaded(data.url)
            refreshAccount()
          } catch (err) {
            const body = axios.isAxiosError(err) ? err.response?.data : undefined
            if (isQuotaExceeded(body)) {
              showUploadError(quotaMessage(body))
              requestUpgrade(quotaMessage(body))
              refreshAccount()
              return
            }
            showUploadError('Could not upload this image.')
          }
        })()
      }
      reader.readAsDataURL(file)
      e.target.value = ''
    },
    [atCapacity, isSignedIn, getToken, showUploadError, onUploaded, entitlements, usage, refreshAccount, requestUpgrade],
  )

  return { onFiles, uploadError }
}
