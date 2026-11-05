import { packRepository } from '../repositories/PackRepository'
import { IPack } from '../models/Pack'
import { userService } from './UserService'

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
  description?: string
  isPremium: boolean
  price?: number
  /** Who made the pack. Says nothing about access; that is `isEntitled`. */
  isOwn: boolean
  /** Whether the viewer may use the pack's presets. The only access rule: premium packs are marked, never hidden. */
  isEntitled: boolean
}

export class PackService {
  async listPacks(viewerId: string | null): Promise<PublicPackMeta[]> {
    const rows = await packRepository.findAll()
    const isAdmin = viewerId ? await userService.isAdmin(viewerId) : false
    return rows.map((p) => {
      const isOwn = !!viewerId && p.userId === viewerId
      return {
        id: String(p._id),
        name: p.name,
        slug: p.slug,
        description: p.description,
        isPremium: p.isPremium,
        price: p.price,
        isOwn,
        // Admins can use everything. When subscriptions land, an active one joins this expression and nothing else changes.
        isEntitled: isOwn || isAdmin,
      }
    })
  }

  async listMyPacks(userId: string): Promise<PublicPackMeta[]> {
    const rows = await packRepository.findByUserId(userId)
    return rows.map((p) => ({
      id: String(p._id),
      name: p.name,
      slug: p.slug,
      description: p.description,
      isPremium: p.isPremium,
      price: p.price,
      isOwn: true,
      isEntitled: true,
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
