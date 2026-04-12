import { Types } from 'mongoose'
import { presetRepository } from '../repositories/PresetRepository'
import { IPreset } from '../models/Preset'

type SavePresetParams = {
  name: string
  pack: string
  packId?: Types.ObjectId
  config: Record<string, unknown>
  userId: string
  force: boolean
}

type ServiceError = Error & { status?: number; presetName?: string }

const serviceError = (message: string, status: number, presetName?: string): ServiceError => {
  const err = new Error(message) as ServiceError
  err.status = status
  if (presetName) err.presetName = presetName
  return err
}

const isDuplicateKeyError = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && 'code' in e && (e as { code: number }).code === 11000

export type PublicPresetMeta = {
  id: string
  name: string
  pack: string  // always a string; empty when no pack assigned
  sprite: string
  isOwn: boolean
}

export class PresetService {
  async listPresetsForViewer(viewerId: string | null): Promise<PublicPresetMeta[]> {
    const rows = await presetRepository.findAll()
    return rows.map((p) => ({
      id: String(p._id),
      name: p.name,
      pack: p.pack ?? '',
      sprite: p.sprite,
      isOwn: !!viewerId && !!p.userId && p.userId === viewerId,
    }))
  }

  async getPresetById(id: string): Promise<IPreset> {
    const preset = await presetRepository.findById(id)
    if (!preset) throw serviceError('Preset not found', 404)
    return preset
  }

  async savePreset({ name, pack, packId, config, userId, force }: SavePresetParams): Promise<IPreset> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sprite = (config as any)?.particle?.sprites?.value?.[0] ?? 'fractaleye.png'
    const payload = { name, pack, packId, sprite, config, userId }

    if (!force) {
      try {
        return await presetRepository.create(payload)
      } catch (e: unknown) {
        if (isDuplicateKeyError(e)) throw serviceError('Preset already exists', 409, name)
        throw e
      }
    }

    return presetRepository.upsert(payload)
  }
}

export const presetService = new PresetService()
