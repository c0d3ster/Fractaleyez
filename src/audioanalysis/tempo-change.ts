// A song change heard as a change of tempo: the BPM the tempo tracker shows moving to a clearly different tempo and staying there. The
// section model's boundary cue hears gaps, fades and a change of band shape, never tempo, so a crossfade or a cut into a song of another tempo
// went by as one long song. The tempo tracker (tempo-tracker.ts) only moves its shown tempo once a new peak has clearly won for 2 s, and jumps
// about 0.4 times a minute on a steady track, which is steady enough to read a change from.
//
// Not a change: a small drift (a DJ nudging the pitch, the tracker refining its reading), or a move by an octave, 3:2, 4:3 or their inverses (the
// tracker reading the same beat at another level, which happens inside a song when the kick drops out).

export type TempoChangeOptions = {
  /** A tempo this far from the song's (as a share of it) is a different tempo. */
  minChange: number
  /** Within this share of twice, half, 3:2, 2:3, 4:3 or 3:4 the song's tempo, it is the same beat read at another level. */
  harmonicTolerance: number
  /** The different tempo has to be shown this long without a break. */
  holdMs: number
  /** How fast the song's tempo follows small drifts, per slot (0 to 1). */
  follow: number
}

// Tuned on playlists of SSME songs (folds 0 and 1) with the real tracker, checked on the other folds and on GiantSteps excerpts; see
// docs/implementation-plans/song-sections.md. Longer holds found fewer changes in time without fewer false ones: the shown tempo already
// waits for a new peak to win.
export const DEFAULT_TEMPO_CHANGE: TempoChangeOptions = {
  minChange: 0.05,
  harmonicTolerance: 0.03,
  holdMs: 4000,
  follow: 0.05,
}

// 4:3 and 3:4 too: on single songs nearly every long-held move of the shown tempo was one of those (a dotted or triplet level).
const HARMONICS = [2, 0.5, 1.5, 2 / 3, 4 / 3, 3 / 4]

export class TempoChangeCue {
  private songBpm: number | null = null
  private changedSince: number | null = null

  constructor(private readonly options: TempoChangeOptions = DEFAULT_TEMPO_CHANGE) {}

  /**
   * One reading (the BPM shown now, or null for none). Returns true while a different tempo has held for `holdMs`. While `armed` is false (the
   * song has only just started) whatever is shown becomes the song's tempo: the tracker is still settling on it, or still showing the last song's.
   */
  push = (t: number, bpm: number | null, armed: boolean): boolean => {
    if (bpm === null) {
      this.changedSince = null
      return false
    }
    if (this.songBpm === null || !armed) {
      this.songBpm = bpm
      this.changedSince = null
      return false
    }
    const ratio = bpm / this.songBpm
    if (Math.abs(ratio - 1) <= this.options.minChange) {
      this.songBpm += (bpm - this.songBpm) * this.options.follow
      this.changedSince = null
      return false
    }
    if (HARMONICS.some((h) => Math.abs(ratio / h - 1) <= this.options.harmonicTolerance)) {
      this.changedSince = null
      return false
    }
    this.changedSince ??= t
    return t - this.changedSince >= this.options.holdMs
  }

  /** The song's tempo, as the cue knows it (null before any). */
  getSongBpm = (): number | null => this.songBpm

  reset = (): void => {
    this.songBpm = null
    this.changedSince = null
  }
}
