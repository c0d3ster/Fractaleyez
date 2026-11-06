import { SectionSlot } from './sections'

/** The file a listening session is saved to: every 250 ms slot the tracker saw, so it can be replayed through the tracker offline. */
export type SectionLog = {
  version: 1
  slotMs: number
  savedAt: string
  slots: readonly SectionSlot[]
}

const SLOT_MS = 250

export const buildSectionLog = (slots: readonly SectionSlot[], savedAt: Date = new Date()): SectionLog => ({
  version: 1,
  slotMs: SLOT_MS,
  savedAt: savedAt.toISOString(),
  slots,
})

/** Downloads the log as a JSON file. Called from the console as `exportSectionLog()` after a listening session. */
export const exportSectionLog = (slots: readonly SectionSlot[]): void => {
  const log = buildSectionLog(slots)
  const blob = new Blob([JSON.stringify(log)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `section-log-${log.savedAt.replace(/[:.]/g, '-')}.json`
  link.click()
  URL.revokeObjectURL(url)
}
