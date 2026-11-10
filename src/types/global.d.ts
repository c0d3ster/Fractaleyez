import type { AppConfig, LayerKey } from '../config/configDefaults'
import type { BeatTimeline } from '../audioanalysis/beat'
import type { DrumKind } from '../audioanalysis/drum-hits'
import type { GridState } from '../audioanalysis/beat-grid'
import type { SectionSlot, SectionState } from '../audioanalysis/sections'
import type { TempoReading } from '../audioanalysis/tempo-tracker'
import type { RhythmLabel, RhythmPattern } from '../audioanalysis/rhythm-pattern'
import type { LagEstimate } from '../audioanalysis/lag-estimate'
import type { LagMeasurement } from '../audioanalysis/lag-probe'
import type { QualityStatus } from '../visualization/quality-controller'
import type { StutterSummary } from '../visualization/stutter-monitor'
import type { PerfProbeControls } from '../visualization/perf'

// Window Management API — not yet in TypeScript's lib.dom.d.ts.
// https://developer.mozilla.org/en-US/docs/Web/API/Window_Management_API
interface ScreenDetailed extends Screen {
  readonly availLeft: number
  readonly availTop: number
  readonly left: number
  readonly top: number
  readonly isPrimary: boolean
  readonly isInternal: boolean
  readonly devicePixelRatio: number
  readonly label: string
}

interface ScreenDetails extends EventTarget {
  readonly screens: ScreenDetailed[]
  readonly currentScreen: ScreenDetailed
}

declare global {
  interface Window {
    config: AppConfig
    webkitAudioContext: typeof AudioContext
    setVirtualCameraPosition?: (x: number, y: number) => void
    getVirtualCameraPosition?: () => { x: number; y: number }
    setCameraMouseTracking?: (enabled: boolean) => void
    setJuliaShape?: (re: number, im: number) => void
    getJuliaShape?: () => { re: number; im: number; manual: boolean; hue: number; saturation: number; targetRe: number; targetIm: number }
    clearJuliaShape?: () => void
    setLayerEnabled?: (key: LayerKey, enabled: boolean) => boolean
    updateConfigItem?: (category: string, item: string, value: string | boolean | number) => void
    toggleLiveVideo?: () => void
    getCameraSteer?: () => { x: number; y: number } | null
    getAudioData?: () => {
      multibandEnergy?: number[]
      multibandEnergyAverage?: number[]
      multibandPeak?: Array<{ value: number }>
    } | null
    getBeatTimeline?: () => BeatTimeline
    getLastBeatTime?: () => number | null
    getBeatTimes?: () => readonly number[]
    getSongSection?: () => SectionState
    /** The steady tempo (TempoTracker), or null when there is no rhythm to read. */
    getTempo?: () => TempoReading | null
    /** Where the beats, bars and 8-bar phrases fall (BeatGrid), as of the last beat, or null before the grid has locked. */
    getBeatGrid?: () => GridState | null
    /** The rhythm the drums make right now (rhythm-pattern.ts, from each band's own onsets at the tracker's tempo), or null when no name is confident enough. Unheld. */
    getRhythmPattern?: () => RhythmPattern | null
    /** The Beat HUD's line: the held rhythm name ("four on the floor"), blank when no name is confident. */
    getRhythmLabel?: () => RhythmLabel
    /** When each drum last hit (drum-hits.ts, main window performance.now), or null before the first. For the Frequency HUD's lights. */
    getDrumHits?: () => Record<DrumKind, number | null>
    /** How much the music sounds like it is rising right now, 0 to 1 (riser.ts). For the Frequency HUD's riser meter. */
    getRiser?: () => number
    getSectionHistory?: () => readonly SectionSlot[]
    /** Downloads everything the section tracker saw this session as a JSON file, to be replayed offline. Run it from the console. */
    exportSectionLog?: () => void
    subscribeBeat?: (listener: () => void) => () => void
    measureBeatLag?: (save?: boolean) => Promise<LagMeasurement | null>
    enabledFreqBands?: boolean[]
    getPerfData?: () => {
      fps: number
      frameMs: number
      lag: { estimate: LagEstimate; measurement: LagMeasurement | null; measuring: boolean }
      quality: QualityStatus
      stutters: { display: StutterSummary; video: StutterSummary }
    }
    getQuality?: () => QualityStatus
    /** The frame-time probe the benchmark scripts read (see `visualization/perf`). */
    perfProbe?: PerfProbeControls
    setQuality?: (setting: string) => void
    getScreenDetails?: () => Promise<ScreenDetails>
  }

  interface Screen {
    readonly isExtended?: boolean
  }
}

export {}
