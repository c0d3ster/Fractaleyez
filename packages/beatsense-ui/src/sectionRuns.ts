import type { SectionSlot, SongSection } from 'beatsense'

// The Section HUD colors the strip by section. Drawn slot by slot, the translucent colors overlapped wherever neighbouring slots met and
// stacked into stripes; drawn as one rectangle per run of the same section, they cannot overlap.

/** How long a section slot covers, ms: the tracker closes one every 250 ms. */
export const SLOT_MS = 250

export type SlotRun = {
  section: SongSection
  /** The run covers (startMs, endMs]: from the start of its first slot to the end of its last. */
  startMs: number
  endMs: number
}

/**
 * The runs of slots[from..] (in time order): consecutive slots of one section, split where the section changes or where a slot is missing
 * (a gap of more than half a slot, e.g. while the tab was hidden), so a gap stays empty.
 */
export const slotRuns = (slots: readonly SectionSlot[], from: number = 0): SlotRun[] => {
  const runs: SlotRun[] = []
  for (let i = Math.max(0, from); i < slots.length; i++) {
    const { t, section } = slots[i]!
    const last = runs[runs.length - 1]
    if (last && last.section === section && t - last.endMs <= SLOT_MS * 1.5) {
      last.endMs = t
      continue
    }
    runs.push({ section, startMs: t - SLOT_MS, endMs: t })
  }
  return runs
}
