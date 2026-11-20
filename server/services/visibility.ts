/** What a public check may read. Presets and packs have no visibility field yet, so nothing reads it so far. */
export type VisibilityFields = {
  userId?: string
  isPublic?: boolean
}

/**
 * Whether a preset or pack is public. Always false until presets and packs get a visibility setting: everything a user owns
 * is private today. Account deletion keeps public content (without its owner) and deletes private content, so this is the
 * one place to change when visibility lands.
 */
export const isPublic: (content: VisibilityFields) => boolean = () => false
