import { Types } from 'mongoose'
import { presetRepository, PresetMeta } from '../repositories/PresetRepository'
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** First particle sprite of a preset config, in either stored shape: a bare array, or the older `{ value: [...] }` item. */
const firstSprite = (config: Record<string, unknown>): string => {
  const { particle } = config
  const sprites = isRecord(particle) ? particle.sprites : undefined
  const list = isRecord(sprites) ? sprites.value : sprites
  const first = Array.isArray(list) ? list[0] : undefined
  return typeof first === 'string' ? first : 'fractaleye.png'
}

const isGlobalDefault = ({ name, userId }: PresetMeta): boolean => name === 'default' && !userId

// The repository returns rows in MongoDB natural order, which differs per database, so the global default is pinned first.
export const defaultFirst = (rows: PresetMeta[]): PresetMeta[] => [
  ...rows.filter(isGlobalDefault),
  ...rows.filter((p) => !isGlobalDefault(p)),
]

export class PresetService {
  async listPresetsForViewer(viewerId: string | null): Promise<PublicPresetMeta[]> {
    const rows = defaultFirst(await presetRepository.findAll())
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
    const payload = { name, pack, packId, sprite: firstSprite(config), config, userId }

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
