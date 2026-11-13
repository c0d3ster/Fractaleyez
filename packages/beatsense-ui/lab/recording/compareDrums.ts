import type { Label } from './labels'

// Labels against the drum model's hits, for the live comparison (and later the phase I scorer). A label is pressed after the hit is heard,
// so the model's hit usually comes first: a hit pairs with a label from MATCH_BEFORE_MS before it to MATCH_AFTER_MS after. Pairs are one to
// one, nearest first, so a burst of hits does not all land on one label.

/** How long before a label its hit may be: the labeller's reaction time, with room to spare. */
export const MATCH_BEFORE_MS = 350

/** How long after a label its hit may be: a hit the model calls late, or a label pressed early. */
export const MATCH_AFTER_MS = 100

export type DrumMatch = {
  labelId: number
  labelT: number
  hitT: number
  /** label.t - hit.t: positive when the label came after the model's hit. */
  offsetMs: number
}

export type DrumComparison = {
  matches: DrumMatch[]
  /** Labels with no model hit near them: hits the model missed (or a stray press). */
  missedLabelIds: number[]
  /** Model hits with no label near them, sorted: extra hits (or ones not labelled). */
  extraHitTimes: number[]
}

/** The index of the first time at or after `t` in a sorted list. */
const firstAtOrAfter = (sorted: readonly number[], t: number): number => {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (sorted[mid]! < t) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Pairs one drum's labels with the model's hits of that drum (times on the same clock, in any order). Each label looks only at the hits in
 * its window (a binary search), so a whole session is cheap.
 */
export const compareDrum = (labels: readonly Label[], hits: readonly number[]): DrumComparison => {
  const hitTimes = [...hits].sort((a, b) => a - b)
  const candidates: Array<{ label: Label; hit: number; distance: number }> = []
  labels.forEach((label) => {
    for (let h = firstAtOrAfter(hitTimes, label.t - MATCH_BEFORE_MS); h < hitTimes.length && hitTimes[h]! <= label.t + MATCH_AFTER_MS; h++) {
      candidates.push({ label, hit: h, distance: Math.abs(label.t - hitTimes[h]!) })
    }
  })
  candidates.sort((a, b) => a.distance - b.distance || a.label.t - b.label.t)
  const pairedLabels = new Set<number>()
  const pairedHits = new Set<number>()
  const matches: DrumMatch[] = []
  candidates.forEach(({ label, hit }) => {
    if (pairedLabels.has(label.id) || pairedHits.has(hit)) return
    pairedLabels.add(label.id)
    pairedHits.add(hit)
    const hitT = hitTimes[hit]!
    matches.push({ labelId: label.id, labelT: label.t, hitT, offsetMs: label.t - hitT })
  })
  matches.sort((a, b) => a.labelT - b.labelT)
  return {
    matches,
    missedLabelIds: labels.filter(({ id }) => !pairedLabels.has(id)).map(({ id }) => id),
    extraHitTimes: hitTimes.filter((_, h) => !pairedHits.has(h)),
  }
}

/** The middle value (the mean of the two middle ones for an even count), or null for none. */
export const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}
