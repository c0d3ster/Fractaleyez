import { LABEL_KINDS, type LabelKind } from './labels'
import type { SongLabel } from './songFile'

// Where passes agree: labels of one kind from different passes close enough in song time are the same moment. A group holds at most one
// label per pass. Agreement only counts the passes that labelled that kind at all, so a pass that only did hats does not count as
// disagreeing about kicks.

/** Two passes' labels this close are the same hit: about the spread of a careful finger-drummer. */
export const AGREE_MS = 60

export type LabelGroup = {
  kind: LabelKind
  /** The middle of the group's times. */
  t: number
  members: SongLabel[]
}

/** Groups each kind's labels across passes: a label joins the group before it if within `toleranceMs` of its first and from a new pass. */
export const groupLabels = (labels: readonly SongLabel[], toleranceMs: number = AGREE_MS): LabelGroup[] => {
  const groups: LabelGroup[] = []
  LABEL_KINDS.forEach((kind) => {
    let open: LabelGroup | null = null
    labels.filter((label) => label.kind === kind).sort((a, b) => a.t - b.t).forEach((label) => {
      const first = open?.members[0]
      if (open && first && label.t - first.t <= toleranceMs && !open.members.some(({ passIndex }) => passIndex === label.passIndex)) {
        open.members.push(label)
        return
      }
      open = { kind, t: label.t, members: [label] }
      groups.push(open)
    })
  })
  groups.forEach((group) => {
    const times = group.members.map(({ t }) => t).sort((a, b) => a - b)
    group.t = (times[Math.floor((times.length - 1) / 2)]! + times[Math.ceil((times.length - 1) / 2)]!) / 2
  })
  return groups.sort((a, b) => a.t - b.t)
}

export type KindAgreement = {
  /** Passes with at least one label of this kind. */
  passes: number
  groups: number
  /** Groups every one of those passes is in. */
  agreed: number
}

/** Per kind, how many groups all the passes that labelled it agree on (with one such pass, every group). */
export const agreementByKind = (groups: readonly LabelGroup[], labels: readonly SongLabel[]): Record<LabelKind, KindAgreement> =>
  Object.fromEntries(LABEL_KINDS.map((kind) => {
    const passes = new Set(labels.filter((label) => label.kind === kind).map(({ passIndex }) => passIndex)).size
    const kindGroups = groups.filter((group) => group.kind === kind)
    return [kind, { passes, groups: kindGroups.length, agreed: kindGroups.filter(({ members }) => members.length >= passes).length }]
  })) as Record<LabelKind, KindAgreement>
