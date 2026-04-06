import { presetRepository, PresetMeta } from '../repositories/PresetRepository'
import { IPreset } from '../models/Preset'

type SavePresetParams = {
  name: string
  pack: string
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

export type PublicPresetMeta = {
  name: string
  pack: string
  sprite: string
  isOwn: boolean
}

export class PresetService {
  async listPresetsForViewer(viewerId: string | null): Promise<PublicPresetMeta[]> {
    const rows = await presetRepository.findAll()
    return rows.map((p) => ({
      name: p.name,
      pack: p.pack,
      sprite: p.sprite,
      isOwn: !!viewerId && !!p.userId && p.userId === viewerId,
    }))
  }

  async getPreset(name: string): Promise<IPreset> {
    const preset = await presetRepository.findByName(name)
    if (!preset) throw serviceError(`Preset "${name}" not found`, 404)
    return preset
  }

  async savePreset({ name, pack, config, userId, force }: SavePresetParams): Promise<IPreset> {
    if (!force) {
      const existing = await presetRepository.findOwned(name, userId)
      if (existing) throw serviceError('Preset already exists', 409, name)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sprite = (config as any)?.particle?.sprites?.value?.[0] ?? 'fractaleye.png'
    return presetRepository.upsert({ name, pack, sprite, config, userId })
  }
}

export const presetService = new PresetService()
