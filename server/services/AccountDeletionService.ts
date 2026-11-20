import { Types } from 'mongoose'
import { isStripeConfigured } from '../stripe.js'
import { userRepository } from '../repositories/UserRepository.js'
import { presetRepository, PresetMeta } from '../repositories/PresetRepository.js'
import { packRepository, PackMeta } from '../repositories/PackRepository.js'
import { uploadRepository } from '../repositories/UploadRepository.js'
import { billingService } from './BillingService.js'
import { storageService } from './StorageService.js'
import { isPublic } from './visibility.js'

export type AccountDeletionResult = {
  /** Whether a User document existed (false on a redelivered user.deleted). */
  hadUser: boolean
  canceledSubscriptions: string[]
  /** False when Stripe failed: the data was deleted anyway. */
  stripeOk: boolean
  deletedPresets: number
  keptPresets: number
  deletedPacks: number
  keptPacks: number
  deletedUploads: number
  keptUploads: number
}

/** Built-in packs (origin builtIn, or none: packs stored before origin existed were all the owner's) are never deleted. */
const isBuiltIn = (pack: PackMeta): boolean => (pack.origin ?? 'builtIn') === 'builtIn'

const isKeptPack = (pack: PackMeta): boolean => isBuiltIn(pack) || isPublic(pack)

const idsOf = (rows: { _id: Types.ObjectId }[]): Types.ObjectId[] => rows.map((row) => row._id)

/**
 * Removes a user's data when their Clerk account is deleted (the user.deleted webhook). Every step only touches what is still
 * there, so a redelivered event, or one for a user who never had a document, changes nothing. The User document goes last:
 * if a step fails the webhook answers 500, Clerk redelivers, and the next run finds the Stripe customer again.
 */
export class AccountDeletionService {
  async deleteAccount(clerkId: string): Promise<AccountDeletionResult> {
    const user = await userRepository.findByClerkId(clerkId)
    const { canceledSubscriptions, stripeOk } = await this.cancelBilling(user?.billing?.customerId)
    const content = await this.removeContent(clerkId)
    const uploads = await this.removeUploads(clerkId)
    const hadUser = await userRepository.deleteByClerkId(clerkId)
    return { hadUser, canceledSubscriptions, stripeOk, ...content, ...uploads }
  }

  /** Stripe down must not leave the data behind: a failure is logged and deletion goes on. */
  private async cancelBilling(customerId: string | undefined): Promise<{ canceledSubscriptions: string[]; stripeOk: boolean }> {
    if (!customerId || !isStripeConfigured()) return { canceledSubscriptions: [], stripeOk: true }
    try {
      return { canceledSubscriptions: await billingService.cancelSubscriptionsNow(customerId), stripeOk: true }
    } catch (err) {
      console.error(`Account deletion: failed to cancel the Stripe subscriptions of customer ${customerId}; deleting the data anyway`, err)
      return { canceledSubscriptions: [], stripeOk: false }
    }
  }

  /**
   * Private presets and packs are deleted. Public ones and built-in packs are kept with their owner removed, and so is any of
   * the user's presets a kept pack lists, so built-in content survives even the admin's deletion. Global presets have no
   * owner and are never touched.
   */
  private async removeContent(clerkId: string): Promise<Pick<AccountDeletionResult, 'deletedPresets' | 'keptPresets' | 'deletedPacks' | 'keptPacks'>> {
    const packs = await packRepository.findByUserId(clerkId)
    const keptPacks = packs.filter(isKeptPack)
    const deletedPacks = packs.filter((pack) => !isKeptPack(pack))
    await packRepository.unlinkOwner(idsOf(keptPacks))
    await packRepository.deleteByIds(idsOf(deletedPacks))

    const presets = await presetRepository.findByUserId(clerkId)
    const listedByKeptPack = new Set(
      (await packRepository.findContainingPresets(idsOf(presets)))
        .filter(isKeptPack)
        .flatMap((pack) => (pack.presetIds ?? []).map(String)),
    )
    const isKeptPreset = (preset: PresetMeta): boolean => isPublic(preset) || listedByKeptPack.has(String(preset._id))
    const keptPresets = presets.filter(isKeptPreset)
    const deletedPresets = presets.filter((preset) => !isKeptPreset(preset))
    for (const preset of keptPresets) await presetRepository.unlinkOwner(preset)
    await packRepository.removePresetsFromAll(idsOf(deletedPresets))
    await presetRepository.deleteByIds(idsOf(deletedPresets))

    return {
      deletedPresets: deletedPresets.length,
      keptPresets: keptPresets.length,
      deletedPacks: deletedPacks.length,
      keptPacks: keptPacks.length,
    }
  }

  /**
   * Runs after removeContent, so kept presets are ownerless by now: an image an ownerless preset (global, or kept from this
   * account) still shows is kept, record and object, without its owner. The object goes before its record, so a failed R2
   * delete leaves the record for the redelivery to find.
   */
  private async removeUploads(clerkId: string): Promise<Pick<AccountDeletionResult, 'deletedUploads' | 'keptUploads'>> {
    let deletedUploads = 0
    let keptUploads = 0
    for (const upload of await uploadRepository.findByUserId(clerkId)) {
      if (await presetRepository.ownerlessUsesSprite(upload.url)) {
        await uploadRepository.unlinkOwner(upload._id)
        keptUploads++
        continue
      }
      await storageService.deleteObject(upload.key)
      await uploadRepository.deleteById(upload._id)
      deletedUploads++
    }
    return { deletedUploads, keptUploads }
  }
}

export const accountDeletionService = new AccountDeletionService()
