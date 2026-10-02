/**
 * What counts as a beat, defined once. A beat is the analyser detecting a new peak: full-band energy rose above
 * (rolling average x Threshold) and the Ignore Time since the previous beat has passed. `fresh` is true only on the
 * frame it is detected, `active` stays true while the peak is still decaying. Every effect that keys off a beat
 * (Hopalong, Julia) reads this instead of re-deriving it from `peak.value`.
 */
export type BeatState = {
  fresh: boolean
  active: boolean
}

export const NO_BEAT: BeatState = { fresh: false, active: false }

/** peak.value above this counts as "still in the beat" (the peak decays linearly from 1 to 0 over its persistency). */
export const BEAT_ACTIVE_LEVEL = 0.8

export type BeatEffect = 'shockwave' | 'switcheroo'

export type BeatSample = {
  t: number
  energy: number
  /** The level energy had to exceed to be a beat: rolling average x Threshold. */
  trigger: number
  beat: boolean
}

export type EffectHit = {
  t: number
  effect: BeatEffect
}

export type BeatTimeline = {
  samples: BeatSample[]
  hits: EffectHit[]
}

const HISTORY_MS = 5000

/** Rolling record of what the analyser saw and which effects it set off, for the audio HUD. */
export class BeatMonitor {
  private samples: BeatSample[] = []
  private hits: EffectHit[] = []

  record = (sample: BeatSample): void => {
    this.samples.push(sample)
    this.trim(this.samples, sample.t)
  }

  markEffect = (effect: BeatEffect): void => {
    const t = performance.now()
    this.hits.push({ t, effect })
    this.trim(this.hits, t)
  }

  getTimeline = (): BeatTimeline => ({ samples: this.samples.slice(), hits: this.hits.slice() })

  // Trim in batches so a per-frame push is not a per-frame array shift.
  private trim = (items: Array<{ t: number }>, now: number): void => {
    const oldest = items[0]
    if (!oldest || now - oldest.t < HISTORY_MS * 1.25) return
    const keepFrom = items.findIndex(({ t }) => now - t <= HISTORY_MS)
    if (keepFrom > 0) items.splice(0, keepFrom)
  }
}

export const beatMonitor = new BeatMonitor()
