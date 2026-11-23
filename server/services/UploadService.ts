import crypto from 'crypto'
import { storageService } from './StorageService.js'
import { entitlementService } from './EntitlementService.js'
import { presetService } from './PresetService.js'
import { uploadRepository, UploadMeta } from '../repositories/UploadRepository.js'
import { userRepository } from '../repositories/UserRepository.js'
import { presetRepository } from '../repositories/PresetRepository.js'
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

type UploadUses = {
  /** Names of the user's own saved presets that draw the image. */
  presets: string[]
  /** It is the user's saved logo (settings.logoParticle). */
  logo: boolean
  /** A built-in (global) preset, or one kept after its owner deleted their account, shows it. */
  shared: boolean
}

/** A delete refused because something saved still draws the image. Handlers answer 409 with `toJSON()`. */
export class UploadInUseError extends Error {
  readonly status = 409
  readonly presets: string[]
  readonly logo: boolean
  readonly shared: boolean

  constructor({ presets, logo, shared }: UploadUses) {
    const uses = [...(logo ? ['your logo'] : []), ...presets, ...(shared ? ['a built-in preset'] : [])]
    super(`Used in ${uses.join(', ')}`)
    this.name = 'UploadInUseError'
    this.presets = presets
    this.logo = logo
    this.shared = shared
  }

  toJSON(): { error: string; code: 'upload_in_use' } & UploadUses {
    return { error: this.message, code: 'upload_in_use', presets: this.presets, logo: this.logo, shared: this.shared }
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
   * so ids can't be probed. Refused while a saved preset of theirs, their logo setting, or a built-in or kept preset still uses
   * the URL (an admin's upload can be in a built-in preset), so nothing saved ends up pointing at a missing image. The object
   * goes first: if the record delete then fails, a retry deletes again.
   */
  async deleteUpload(userId: string, id: string): Promise<void> {
    const upload = await uploadRepository.findById(id)
    if (!upload || upload.userId !== userId) throw serviceError('Upload not found', 404)

    const [presets, user, shared] = await Promise.all([
      presetService.presetNamesUsingSprite(userId, upload.url),
      userRepository.findByClerkId(userId),
      presetRepository.keptPresetUsesSprite(upload.url),
    ])
    const logo = user?.settings?.logoParticle === upload.url
    if (presets.length > 0 || logo || shared) throw new UploadInUseError({ presets, logo, shared })

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
