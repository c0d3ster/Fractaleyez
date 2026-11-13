// What a person marks while a session records, for scoring the detectors and for the phase J retrain: drum hits, the section moments and
// the start and end of a riser. A label is a moment on the audio clock (the same clock as the frames), with an id that stays with it
// through moves and deletes on the review page.

export const LABEL_KINDS = ['kick', 'snare', 'clap', 'hat', 'drop', 'buildup', 'breakdown', 'riserStart', 'riserEnd'] as const

export type LabelKind = (typeof LABEL_KINDS)[number]

/** The drum labels, shown under the Frequency HUD's drum lights. Each matches the drum model's kind of the same name. */
export const DRUM_LABEL_KINDS = ['kick', 'snare', 'clap', 'hat'] as const satisfies readonly LabelKind[]

export type DrumLabelKind = (typeof DRUM_LABEL_KINDS)[number]

/** The song labels, shown under the Section HUD. */
export const SECTION_LABEL_KINDS = ['drop', 'buildup', 'breakdown', 'riserStart', 'riserEnd'] as const satisfies readonly LabelKind[]

export type Label = {
  /** Unique within its session, never reused after a delete. */
  id: number
  kind: LabelKind
  /** Audio clock, ms, as the frames' `t`. */
  t: number
}

type LabelInfo = {
  /** The button's text. */
  name: string
  /** Its tag on the review page's timeline. */
  short: string
  /** The key that adds it while recording (lower case; shown on the button). */
  key: string
  /** Its color on the review page. */
  color: string
}

export const LABEL_INFO: Record<LabelKind, LabelInfo> = {
  kick: { short: 'K', name: 'Kick', key: 'k', color: '#ff6b6b' },
  snare: { short: 'S', name: 'Snare', key: 's', color: '#ffd166' },
  clap: { short: 'C', name: 'Clap', key: 'c', color: '#f78fb3' },
  hat: { short: 'H', name: 'Hat', key: 'h', color: '#4ecdc4' },
  drop: { short: 'Drop', name: 'Drop', key: 'd', color: '#ef476f' },
  buildup: { short: 'Build', name: 'Buildup', key: 'b', color: '#f4a261' },
  breakdown: { short: 'Break', name: 'Breakdown', key: 'n', color: '#6c8ef5' },
  riserStart: { short: 'Riser', name: 'Riser start', key: 'r', color: '#b388ff' },
  riserEnd: { short: '/Riser', name: 'Riser end', key: 'e', color: '#7e57c2' },
}

export const isLabelKind = (value: unknown): value is LabelKind => typeof value === 'string' && (LABEL_KINDS as readonly string[]).includes(value)

/** The labels sorted by time (ties by id, so the order is stable), as a new list. */
export const sortLabels = (labels: readonly Label[]): Label[] => [...labels].sort((a, b) => a.t - b.t || a.id - b.id)

/** How many labels of each kind. */
export const countLabels = (labels: readonly Label[]): Record<LabelKind, number> => {
  const counts = Object.fromEntries(LABEL_KINDS.map((kind) => [kind, 0])) as Record<LabelKind, number>
  labels.forEach(({ kind }) => {
    counts[kind]++
  })
  return counts
}
