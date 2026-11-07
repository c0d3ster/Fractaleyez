import { SectionTick } from './sections'

/**
 * The file a listening session is saved to: every 50 ms tick the tracker saw (the mean power of each band and the beats in it), so it can
 * be replayed through the tracker offline exactly as it ran (scripts/section-eval/replay-log.mts). Version 1 held 250 ms slots, which is
 * too coarse for the features the tracker now uses.
 */
export type SectionLog = {
  version: 2
  tickMs: number
  savedAt: string
  ticks: readonly SectionTick[]
}

const TICK_MS = 50

export const buildSectionLog = (ticks: readonly SectionTick[], savedAt: Date = new Date()): SectionLog => ({
  version: 2,
  tickMs: TICK_MS,
  savedAt: savedAt.toISOString(),
  ticks,
})

/** Downloads the log as a JSON file. Called from the console as `exportSectionLog()` after a listening session. */
export const exportSectionLog = (ticks: readonly SectionTick[]): void => {
  const log = buildSectionLog(ticks)
  const blob = new Blob([JSON.stringify(log)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `section-log-${log.savedAt.replace(/[:.]/g, '-')}.json`
  link.click()
  URL.revokeObjectURL(url)
}
