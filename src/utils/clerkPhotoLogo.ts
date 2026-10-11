import axios from 'axios'
import { prepareSprite } from 'sprite-strip'

// Same limits the manual logo upload uses (UserSettingsPage); the server enforces its own independently.
const LOGO_MAX_SIDE_PX = 512
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

/**
 * Runs a Clerk social-connection photo through the same prepareSprite background-strip/resize as a manual logo
 * upload and pushes the result to R2 via /api/uploadParticle. The Clerk-hosted URL is never used as a sprite directly
 * (no guaranteed CORS for WebGL, and it would render as a plain photo rectangle). Returns the R2 URL, or null on any
 * failure (best effort: the `@user` resolver just falls to its next rung).
 */
export const persistClerkPhotoAsLogo = async (imageUrl: string, token: string): Promise<string | null> => {
  try {
    const photo = await fetch(imageUrl)
    if (!photo.ok) return null
    const processed = await prepareSprite(await blobToDataUrl(await photo.blob()), LOGO_MAX_SIDE_PX)
    const blob = await (await fetch(processed)).blob()
    if (blob.size > MAX_UPLOAD_BYTES) return null
    const { data } = await axios.post<{ url: string }>('/api/uploadParticle', blob, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': blob.type || 'image/png' },
    })
    return data.url
  } catch {
    return null
  }
}
