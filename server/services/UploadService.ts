import crypto from 'crypto'
import { storageService } from './StorageService.js'
import { entitlementService } from './EntitlementService.js'
import { presetService } from './PresetService.js'
import { uploadRepository, UploadMeta } from '../repositories/UploadRepository.js'
import { userRepository } from '../repositories/UserRepository.js'
import { UploadKind } from '../models/Upload.js'

type UploadParams = {
  userId: string
  body: Buffer
  /** image-size's type, already checked by the handler (png, jpg, webp, gif). */
  format: string
  contentType: string
  kind: UploadKind
}

type ServiceError = Error & { status?: number }

const serviceError = (message: string, status: number): ServiceError => {
  const err = new Error(message) as ServiceError
  err.status = status
  return err
}

/** GET /api/uploads: one of the user's uploads, as the library shows it. */
export type PublicUpload = {
  id: string
  url: string
  kind: UploadKind
  createdAt: string
}

const toPublicUpload = ({ _id, url, kind, createdAt }: UploadMeta): PublicUpload => ({
  id: String(_id),
  url,
  kind,
  createdAt: createdAt.toISOString(),
})

/** A delete refused because something the user saved still draws the image. Handlers answer 409 with `toJSON()`. */
export class UploadInUseError extends Error {
  readonly status = 409
  readonly presets: string[]
  readonly logo: boolean

  constructor(presets: string[], logo: boolean) {
    const uses = [...(logo ? ['your logo'] : []), ...presets]
    super(`Used in ${uses.join(', ')}`)
    this.name = 'UploadInUseError'
    this.presets = presets
    this.logo = logo
  }

  toJSON(): { error: string; code: 'upload_in_use'; presets: string[]; logo: boolean } {
    return { error: this.message, code: 'upload_in_use', presets: this.presets, logo: this.logo }
  }
}

export const isUploadInUseError = (err: unknown): err is UploadInUseError => err instanceof UploadInUseError

export class UploadService {
  async listUploads(userId: string): Promise<PublicUpload[]> {
    const rows = await uploadRepository.findByUserId(userId)
    return rows.map(toPublicUpload)
  }

  /**
   * Deletes one of the user's uploads, object and record, which frees its quota slot. Someone else's upload reads as not found,
   * so ids can't be probed. Refused while a saved preset of theirs or their logo setting still uses the URL, so nothing they
   * saved ends up pointing at a missing image. The object goes first: if the record delete then fails, a retry deletes again.
   */
  async deleteUpload(userId: string, id: string): Promise<void> {
    const upload = await uploadRepository.findById(id)
    if (!upload || upload.userId !== userId) throw serviceError('Upload not found', 404)

    const [presets, user] = await Promise.all([
      presetService.presetNamesUsingSprite(userId, upload.url),
      userRepository.findByClerkId(userId),
    ])
    const logo = user?.settings?.logoParticle === upload.url
    if (presets.length > 0 || logo) throw new UploadInUseError(presets, logo)

    await storageService.deleteObject(upload.key)
    await uploadRepository.deleteById(String(upload._id))
  }


  /**
   * Puts a validated image in R2 and records it against the user's upload quota. The one avatar copy of the Clerk photo is
   * free; a second "avatar" counts as a sprite, so the kind can't be used to dodge the quota.
   */
  async uploadParticle({ userId, body, format, contentType, kind }: UploadParams): Promise<string> {
    const freeAvatar = kind === 'avatar' && (await uploadRepository.countByUserId(userId, 'avatar')) === 0
    const recordedKind: UploadKind = freeAvatar ? 'avatar' : 'sprite'
    if (recordedKind === 'sprite') await entitlementService.assertRoomFor(userId, 'particleUploads')

    const key = `particles/${userId}/${crypto.randomUUID()}.${format}`
    // UUID collision is practically unreachable, but the endpoint must never silently overwrite a key.
    if (await storageService.objectExists(key)) throw serviceError('Object already exists', 409)
    const url = await storageService.putObject(key, body, contentType)
    await uploadRepository.create({ userId, key, url, kind: recordedKind })
    return url
  }
}

export const uploadService = new UploadService()
