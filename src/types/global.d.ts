import type { AppConfig } from '../config/configDefaults'

declare global {
  interface Window {
    config: AppConfig
    webkitAudioContext: typeof AudioContext
  }
}

export {}
