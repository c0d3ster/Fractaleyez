import type { AppConfig } from '../config/configDefaults'

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
    getPerfData?: () => { fps: number; frameMs: number; pingMs: number | null }
  }
}

export {}
