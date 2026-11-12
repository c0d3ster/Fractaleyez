import type { SectionModelData } from './section-model'

let loading: Promise<SectionModelData> | null = null

/**
 * The shipped section model (about 290 KB of trees), fetched on first call and cached. It is a dynamic import so bundlers keep it out of
 * the main entry as a chunk of its own; give it to `SectionTracker.setModel`, or let `createAnalysers` do that.
 */
export const loadSectionModel = (): Promise<SectionModelData> => {
  // JSON infers number[][], not the tree tuples; the file is our own trained output and `setModel` checks its features.
  loading ??= import('./section-model.json').then(({ default: data }) => data as SectionModelData)
  return loading
}
