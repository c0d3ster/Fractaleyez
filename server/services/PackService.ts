import { packRepository } from '../repositories/PackRepository'
import { IPack } from '../models/Pack'

type CreatePackParams = {
  name: string
  userId: string
  description?: string
  isPremium?: boolean
  price?: number
}

type ServiceError = Error & { status?: number }

const serviceError = (message: string, status: number): ServiceError => {
  const err = new Error(message) as ServiceError
  err.status = status
  return err
}

const isDuplicateKeyError = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && 'code' in e && (e as { code: number }).code === 11000

const toSlug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export type PublicPackMeta = {
  id: string
  name: string
  slug: string
  userId: string
  description?: string
  isPremium: boolean
  price?: number
  isOwn: boolean
}

export class PackService {
  async listPacks(viewerId: string | null): Promise<PublicPackMeta[]> {
    const rows = await packRepository.findAll()
    return rows.map((p) => ({
      id: String(p._id),
      name: p.name,
      slug: p.slug,
      userId: p.userId,
      description: p.description,
      isPremium: p.isPremium,
      price: p.price,
      isOwn: !!viewerId && p.userId === viewerId,
    }))
  }

  async listMyPacks(userId: string): Promise<PublicPackMeta[]> {
    const rows = await packRepository.findByUserId(userId)
    return rows.map((p) => ({
      id: String(p._id),
      name: p.name,
      slug: p.slug,
      userId: p.userId,
      description: p.description,
      isPremium: p.isPremium,
      price: p.price,
      isOwn: true,
    }))
  }

  async createPack({ name, userId, description, isPremium, price }: CreatePackParams): Promise<IPack> {
    const slug = toSlug(name)
    if (!slug) throw serviceError('Invalid pack name', 400)

    try {
      return await packRepository.create({ name, slug, userId, description, isPremium, price })
    } catch (e: unknown) {
      if (isDuplicateKeyError(e)) throw serviceError('A pack with that name already exists', 409)
      throw e
    }
  }
}

export const packService = new PackService()
