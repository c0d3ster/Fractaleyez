import { DEFAULT_ENABLED_BANDS } from 'beatsense'
import type { AnalysisSource } from 'beatsense-ui'

// The visualizer lives in the main window; a popped-out config window reads it through window.opener.
const mainWindow = (): Window => window.opener ?? window

/**
 * What the beatsense-ui HUDs read: the getters main.ts hangs on the main window once the audio starts, looked up on every read so a HUD
 * mounted before then picks them up when they appear.
 */
export const appAnalysisSource: AnalysisSource = {
  now: () => mainWindow().performance.now(),
  getBeatTimeline: () => mainWindow().getBeatTimeline?.() ?? null,
  getBeatTimes: () => mainWindow().getBeatTimes?.() ?? [],
  getTempo: () => mainWindow().getTempo?.() ?? null,
  getBeatGrid: () => mainWindow().getBeatGrid?.() ?? null,
  getRhythmLabel: () => mainWindow().getRhythmLabel?.() ?? null,
  getSnareRoll: () => mainWindow().getSnareRoll?.() ?? null,
  getDrumHits: () => mainWindow().getDrumHits?.() ?? null,
  getRiser: () => mainWindow().getRiser?.() ?? 0,
  getSweep: () => mainWindow().getSweep?.() ?? 0,
  getSongSection: () => mainWindow().getSongSection?.() ?? null,
  getSectionHistory: () => mainWindow().getSectionHistory?.() ?? [],
  // Which bands can set off a beat (the Frequency HUD toggles them), and the Audio config's Ignore Time.
  getEnabledBands: () => mainWindow().enabledFreqBands ?? DEFAULT_ENABLED_BANDS,
  getIgnoreMs: () => mainWindow().config.audio.ignoreTime.value,
}
