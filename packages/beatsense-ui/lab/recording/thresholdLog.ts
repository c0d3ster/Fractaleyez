import { DRUM_KINDS, type DrumKind } from 'beatsense'

/** The drum thresholds (0 to 1) in effect from `t` (audio clock, ms) until the next change. */
export type ThresholdChange = { t: number; thresholds: Record<DrumKind, number> }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const isThreshold = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1

/** Whether a value holds a threshold for every drum, each 0 to 1 (for a session file or the lab's saved sliders). */
export const isDrumThresholds = (value: unknown): value is Record<DrumKind, number> =>
  isRecord(value) && DRUM_KINDS.every((kind) => isThreshold(value[kind]))

export const isThresholdChange = (value: unknown): value is ThresholdChange =>
  isRecord(value) && typeof value.t === 'number' && Number.isFinite(value.t) && isDrumThresholds(value.thresholds)

/** Every change of the drum thresholds, oldest first, so a recording can say which were in effect through it. */
export class ThresholdLog {
  private readonly changes: ThresholdChange[] = []

  /** Notes the thresholds in effect from `t`; a change at the same time as the last replaces it (a slider drag within a frame). */
  push = (t: number, thresholds: Readonly<Record<DrumKind, number>>): void => {
    const change = { t, thresholds: { ...thresholds } }
    const last = this.changes[this.changes.length - 1]
    if (last && last.t >= t) this.changes[this.changes.length - 1] = { ...change, t: Math.max(t, last.t) }
    else this.changes.push(change)
  }

  /** The changes that held from `startMs` to `endMs`: the one in effect at the start, stamped `startMs`, then each one after it up to the end. */
  between = (startMs: number, endMs: number): ThresholdChange[] => {
    const before = this.changes.filter(({ t }) => t <= startMs)
    const atStart = before[before.length - 1]
    const during = this.changes.filter(({ t }) => t > startMs && t <= endMs)
    return [...(atStart ? [{ ...atStart, t: startMs }] : []), ...during]
  }
}
