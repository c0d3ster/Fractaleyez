import React, { createContext, useContext, useMemo } from 'react'

import type { BeatTimeline, DrumKind, GridState, RhythmLabel, RollLevel, SectionSlot, SectionState, TempoReading } from 'beatsense'
import { animationFrameTicker, type Ticker } from './ticker'

/**
 * What the HUDs read from the analysis, on every tick. Each getter is optional: a HUD leaves out what it has no getter for, and a getter
 * with nothing to report yet returns null (or an empty list). Most map straight onto a beatsense analyser's method.
 */
export type AnalysisSource = {
  /** The clock the analysis stamps its times with, ms. Defaults to this window's `performance.now()`. */
  now?: () => number
  /** The beat monitor's recent samples (`BeatMonitor.getTimeline`): the Beat HUD's waveform and the Frequency HUD's bars. */
  getBeatTimeline?: () => BeatTimeline | null
  /** When the recent beats landed (`BeatMonitor.getBeatTimes`), for the Beat HUD's consistency figure. */
  getBeatTimes?: () => readonly number[]
  /** The steady tempo (`TempoTracker.getReading`), for the Beat HUD's BPM. */
  getTempo?: () => TempoReading | null
  /** Where the beats, bars and phrases fall (`BeatGrid.getState`), for the Beat HUD's ruler. */
  getBeatGrid?: () => GridState | null
  /** The held rhythm name (`RhythmLabeler.read`), under the Beat HUD. */
  getRhythmLabel?: () => RhythmLabel | null
  /** The snare roll's note value, held, under the Beat HUD. */
  getSnareRoll?: () => RollLevel | null
  /** When each drum last hit (`DrumHits.getLastHits`, on the `now` clock): the Frequency HUD's lights. */
  getDrumHits?: () => Readonly<Record<DrumKind, number | null>> | null
  /** The riser score, 0 to 1 (`RiserDetector.getScore`): the Frequency HUD's riser meter shows the higher of this and the sweep. */
  getRiser?: () => number
  /** The sweep score, 0 to 1 (`SweepDetector.getScore`). */
  getSweep?: () => number
  /** The song section now (`SectionTracker.getState`), for the Section HUD's labels. */
  getSongSection?: () => SectionState | null
  /** The section history (`SectionTracker.getHistory`), the Section HUD's strip. */
  getSectionHistory?: () => readonly SectionSlot[]
  /** Which onset bands can set off a beat; the Beat HUD dims the rest. Defaults to beatsense's `DEFAULT_ENABLED_BANDS`. */
  getEnabledBands?: () => readonly boolean[]
  /** How long the detector ignores after a hit, ms; the Beat HUD shades it. Defaults to 0. */
  getIgnoreMs?: () => number
}

/** What an element needs to describe itself, spread onto it: a `title` by default, or pointer and focus handlers for a hint strip. */
export type HintProps = Pick<React.HTMLAttributes<HTMLElement>, 'title' | 'onPointerEnter' | 'onPointerMove' | 'onPointerLeave' | 'onFocus' | 'onBlur'>

/** Turns a HUD's description of one of its parts into the props for that element. */
export type Hint = (text: string) => HintProps

/** The default hint: the browser's own tooltip. */
export const titleHint: Hint = (text) => ({ title: text })

export type HudContextValue = {
  source: AnalysisSource
  ticker: Ticker
  hint: Hint
}

const EMPTY_SOURCE: AnalysisSource = {}

const HudContext = createContext<HudContextValue>({ source: EMPTY_SOURCE, ticker: animationFrameTicker, hint: titleHint })

type HudProviderProps = Partial<HudContextValue> & { children: React.ReactNode }

/**
 * Gives every HUD under it the analysis to read, the ticker that makes it draw and the hint for its descriptions. Keep the three stable
 * (module constants, or memoized): a HUD subscribes again, and starts its history over, when its source or ticker changes.
 */
export const HudProvider = ({ source = EMPTY_SOURCE, ticker = animationFrameTicker, hint = titleHint, children }: HudProviderProps): React.ReactElement => {
  const value = useMemo<HudContextValue>(() => ({ source, ticker, hint }), [source, ticker, hint])
  return <HudContext.Provider value={value}>{children}</HudContext.Provider>
}

/** The nearest HudProvider's source, ticker and hint, or an empty source, a requestAnimationFrame ticker and `title` hints without one. */
export const useHud = (): HudContextValue => useContext(HudContext)

/** The source's clock now. */
export const sourceNow = (source: AnalysisSource): number => (source.now ? source.now() : performance.now())
