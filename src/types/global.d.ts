import type { AppConfig } from '../config/configDefaults'

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
    getAudioData?: () => {
      multibandEnergy?: number[]
      multibandEnergyAverage?: number[]
      multibandPeak?: Array<{ value: number }>
    } | null
    enabledFreqBands?: boolean[]
    getPerfData?: () => {
      fps: number
      frameMs: number
      pingMs: number | null
      estimatedLagMs: number
    }
    getScreenDetails?: () => Promise<ScreenDetails>
  }

  interface Screen {
    readonly isExtended?: boolean
  }
}

export {}
