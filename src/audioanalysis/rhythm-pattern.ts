import { TempoPattern } from './tempo'

/** What the rhythm namer reads: each onset band's own hits over the last few bars (ms, oldest first) and the tempo tracker's beat. */
export type RhythmInput = {
  bandOnsets: ReadonlyArray<readonly number[]>
  periodMs: number | null
}

export type RhythmOptions = {
  /** A gap counts as n beats when it is within this share of n beats. */
  gapTolerance: number
  /** Fewer kicks than this in the window (or fewer than this many gaps) say nothing. */
  minKicks: number
  /** The bass band is the kick unless it has fewer than this share of the lo band's hits (a laptop mic hears almost no bass); then the lo band is. */
  bassShareOfLo: number
  /** Four on the floor: this share of the kick's gaps are one beat. */
  fourShare: number
  /** Breakbeat: this share of the kick's gaps are one and a half or two and a half beats. */
  breakShare: number
  /** Half time: this share of the kick's gaps are two or four beats. */
  halfShare: number
}

export const DEFAULT_RHYTHM_OPTIONS: RhythmOptions = {
  gapTolerance: 0.12,
  minKicks: 6,
  bassShareOfLo: 0.3,
  fourShare: 0.5,
  breakShare: 0.25,
  halfShare: 0.5,
}

const BASS = 0
const LO = 1

const gapsOf = (onsets: readonly number[]): number[] => onsets.slice(1).map((time, i) => time - (onsets[i] ?? time)).filter((gap) => gap > 0)

const shareNear = (gaps: readonly number[], beats: readonly number[], periodMs: number, tolerance: number): number =>
  gaps.length === 0 ? 0 : gaps.filter((gap) => beats.some((n) => Math.abs(gap - n * periodMs) <= n * periodMs * tolerance)).length / gaps.length

/** The rhythm the kick makes against the beat, from each band's own onsets, or null when there is no kick to read (a breakdown, silence). */
export const nameRhythm = ({ bandOnsets, periodMs }: RhythmInput, options: Partial<RhythmOptions> = {}): TempoPattern | null => {
  const o = { ...DEFAULT_RHYTHM_OPTIONS, ...options }
  if (periodMs === null || periodMs <= 0) return null
  const bass = bandOnsets[BASS] ?? []
  const lo = bandOnsets[LO] ?? []
  const kicks = bass.length >= o.bassShareOfLo * lo.length ? bass : lo
  if (kicks.length < o.minKicks) return null
  const gaps = gapsOf(kicks)
  if (shareNear(gaps, [1], periodMs, o.gapTolerance) >= o.fourShare) return 'four on the floor'
  if (shareNear(gaps, [2, 4], periodMs, o.gapTolerance) >= o.halfShare) return 'half time'
  if (shareNear(gaps, [1.5, 2.5], periodMs, o.gapTolerance) >= o.breakShare) return 'syncopated'
  return 'syncopated'
}
