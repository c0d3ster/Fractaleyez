import type { AppConfig, LayerKey } from '../config/configDefaults'
import type { BeatTimeline } from '../audioanalysis/beat'
import type { SectionSlot, SectionState } from '../audioanalysis/sections'
import type { TempoReading } from '../audioanalysis/tempo-tracker'
import type { RhythmLabel, RhythmPattern } from '../audioanalysis/rhythm-pattern'
import type { LagEstimate } from '../audioanalysis/lag-estimate'
import type { LagMeasurement } from '../audioanalysis/lag-probe'
import type { QualityStatus } from '../visualization/quality-controller'
import type { StutterSummary } from '../visualization/stutter-monitor'

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
    /** The rhythm the drums make right now (rhythm-pattern.ts, from each band's own onsets at the tracker's tempo), or null when no name is confident enough. Unheld. */
    getRhythmPattern?: () => RhythmPattern | null
    /** The Beat HUD's line: the held rhythm name (`text`, e.g. "four on the floor") and its tempo range (`tempoRange`, not shown), blank when no name is confident. */
    getRhythmLabel?: () => RhythmLabel
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
    setQuality?: (setting: string) => void
    getScreenDetails?: () => Promise<ScreenDetails>
  }

  interface Screen {
    readonly isExtended?: boolean
  }
}

export {}
