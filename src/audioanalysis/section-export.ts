import { buildSectionLog, type SectionTick } from 'soundsense'

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
