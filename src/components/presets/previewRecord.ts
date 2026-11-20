/**
 * The one-shot premium preview: each locked preset can be previewed once per local day. The record is a soft nudge kept in
 * localStorage, not security: the server refuses saves from a preview (`premium_preview`), so clearing it only buys another look.
 */
export const PREVIEW_RECORD_KEY = 'premiumPreviews'

/** The local day the record belongs to (YYYY-MM-DD) and the presets previewed on it, by id (or name for one without an id). */
export type PreviewRecord = { day: string; presets: string[] }

type PreviewStorage = Pick<Storage, 'getItem' | 'setItem'>

const pad = (value: number): string => String(value).padStart(2, '0')

/** The calendar day in the viewer's own time zone, so the record resets at their midnight, not UTC's. */
export const localDay = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const emptyRecord = (day: string): PreviewRecord => ({ day, presets: [] })

/** A stored record for `today`, or an empty one when it is from another day, missing or not readable. */
export const parsePreviewRecord = (raw: string | null, today: string): PreviewRecord => {
  if (!raw) return emptyRecord(today)
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return emptyRecord(today)
    const { day, presets } = parsed as Partial<PreviewRecord>
    if (day !== today || !Array.isArray(presets)) return emptyRecord(today)
    return { day, presets: presets.filter((key): key is string => typeof key === 'string') }
  } catch {
    return emptyRecord(today)
  }
}

export const hasPreviewed = ({ presets }: PreviewRecord, presetKey: string): boolean => presets.includes(presetKey)

export const withPreviewed = (record: PreviewRecord, presetKey: string): PreviewRecord =>
  hasPreviewed(record, presetKey) ? record : { ...record, presets: [...record.presets, presetKey] }

// localStorage can be missing or throw (private mode, blocked site data); the preview then just isn't remembered.
const defaultStorage = (): PreviewStorage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export const readPreviewRecord = (now: Date = new Date(), storage: PreviewStorage | null = defaultStorage()): PreviewRecord => {
  const today = localDay(now)
  try {
    return parsePreviewRecord(storage?.getItem(PREVIEW_RECORD_KEY) ?? null, today)
  } catch {
    return emptyRecord(today)
  }
}

export const isPreviewedToday = (presetKey: string, now: Date = new Date(), storage: PreviewStorage | null = defaultStorage()): boolean =>
  hasPreviewed(readPreviewRecord(now, storage), presetKey)

/** Notes the preset as previewed today. A record from an earlier day is replaced, so the list never outgrows one day. */
export const recordPreview = (presetKey: string, now: Date = new Date(), storage: PreviewStorage | null = defaultStorage()): void => {
  const next = withPreviewed(readPreviewRecord(now, storage), presetKey)
  try {
    storage?.setItem(PREVIEW_RECORD_KEY, JSON.stringify(next))
  } catch {
    // Quota or blocked storage: the preview still runs, it just is not remembered.
  }
}
