// What a person marks while a session records, for scoring the detectors and for the phase J retrain: drum hits, the section moments and
// the start and end of a riser. A label is a moment on the audio clock (the same clock as the frames), with an id that stays with it
// through moves and deletes on the review page.

export const LABEL_KINDS = [
  'kick', 'snare', 'clap', 'hat', 'intro', 'buildup', 'drop', 'breakdown', 'outro', 'riserStart', 'riserEnd',
] as const

export type LabelKind = (typeof LABEL_KINDS)[number]

/** The drum labels, shown under the Frequency HUD's drum lights. Each matches the drum model's kind of the same name. */
export const DRUM_LABEL_KINDS = ['kick', 'snare', 'clap', 'hat'] as const satisfies readonly LabelKind[]

export type DrumLabelKind = (typeof DRUM_LABEL_KINDS)[number]

/**
 * The song labels, shown under the Section HUD in song order. Intro and outro are the tracker's own calls too, so labelling them shows
 * where it calls an outro mid-song.
 */
export const SONG_LABEL_KINDS = ['intro', 'buildup', 'drop', 'breakdown', 'outro'] as const satisfies readonly LabelKind[]

export type SongLabelKind = (typeof SONG_LABEL_KINDS)[number]

/** What a button or hotkey does: add that label, or for `riser`, start a riser or end the one open (riserStart or riserEnd). */
export type LabelAction = DrumLabelKind | SongLabelKind | 'riser'

/**
 * The hotkeys, all under the left hand: the drums as a block on Q W / A S, the riser on R, and the song labels on 1 to 5 in song order.
 * Lower case; shown on the buttons.
 */
export const ACTION_KEYS: Record<LabelAction, string> = {
  kick: 'q',
  snare: 'w',
  clap: 'a',
  hat: 's',
  riser: 'r',
  intro: '1',
  buildup: '2',
  drop: '3',
  breakdown: '4',
  outro: '5',
}

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
  /** Its tag on the timelines. */
  short: string
  /** Its color on the buttons and timelines. */
  color: string
}

export const LABEL_INFO: Record<LabelKind, LabelInfo> = {
  kick: { short: 'K', name: 'Kick', color: '#ff6b6b' },
  snare: { short: 'S', name: 'Snare', color: '#ffd166' },
  clap: { short: 'C', name: 'Clap', color: '#f78fb3' },
  hat: { short: 'H', name: 'Hat', color: '#4ecdc4' },
  intro: { short: 'Intro', name: 'Intro', color: '#50bed2' },
  buildup: { short: 'Build', name: 'Buildup', color: '#f4a261' },
  drop: { short: 'Drop', name: 'Drop', color: '#ef476f' },
  breakdown: { short: 'Break', name: 'Breakdown', color: '#6c8ef5' },
  outro: { short: 'Outro', name: 'Outro', color: '#a06ed2' },
  riserStart: { short: 'Riser', name: 'Riser start', color: '#b388ff' },
  riserEnd: { short: '/Riser', name: 'Riser end', color: '#7e57c2' },
}

/** Whether a riser is open: the newest riser label is a start. */
export const isRiserOpen = (labels: readonly Label[]): boolean => {
  for (let i = labels.length - 1; i >= 0; i--) {
    const { kind } = labels[i]!
    if (kind === 'riserStart') return true
    if (kind === 'riserEnd') return false
  }
  return false
}

/** The label an action adds after `labels` (oldest first): the riser toggles between a start and an end. */
export const labelKindFor = (action: LabelAction, labels: readonly Label[]): LabelKind => {
  if (action !== 'riser') return action
  return isRiserOpen(labels) ? 'riserEnd' : 'riserStart'
}

export const isLabelKind = (value: unknown): value is LabelKind => typeof value === 'string' && (LABEL_KINDS as readonly string[]).includes(value)

/** The labels sorted by time (ties by id, so the order is stable), as a new list. */
export const sortLabels = <T extends Label>(labels: readonly T[]): T[] => [...labels].sort((a, b) => a.t - b.t || a.id - b.id)

/** How many labels of each kind. */
export const countLabels = (labels: readonly Label[]): Record<LabelKind, number> => {
  const counts = Object.fromEntries(LABEL_KINDS.map((kind) => [kind, 0])) as Record<LabelKind, number>
  labels.forEach(({ kind }) => {
    counts[kind]++
  })
  return counts
}
