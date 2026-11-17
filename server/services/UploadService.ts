import crypto from 'crypto'
import { storageService } from './StorageService.js'
import { entitlementService } from './EntitlementService.js'
import { uploadRepository } from '../repositories/UploadRepository.js'
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

export class UploadService {
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
