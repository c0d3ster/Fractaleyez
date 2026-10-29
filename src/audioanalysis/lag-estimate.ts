// The Lag figure in the Performance panel: the delay from a sound reaching the audio engine to the screen, short of the
// microphone before the engine and the monitor's own response. Three parts follow the page live (waiting for the frame that reads
// the audio, drawing it, one monitor refresh); the fourth, the beat detector's own delay, cannot be seen on real music, so the
// calibration (see lag-probe.ts) measures it once per quality mode and it is kept for next time.

import type { QualityTier } from '../config/quality.config'

/**
 * A typical detector delay for each quality mode until that mode has been calibrated: the average of three runs of the lag test
 * per mode on one 48 kHz machine with the config window open (24.9, 9.6, 15.2 and 14.5 ms). It differs by mode because the
 * detector smooths in steps of the frame time, so it reacts differently at each frame rate. Single runs vary by about ±8 ms.
 */
export const DEFAULT_DETECTOR_MS: Readonly<Record<QualityTier, number>> = { saver: 14.5, balanced: 15, quality: 10, ultra: 25 }

/**
 * How many drawn frames a sound waits for before the frame that shows it has been drawn. The audio is read once per drawn frame,
 * so half a frame on average, and a little more because a hit is only seen on the read after its window has filled. Fitted
 * so the detector delay comes out the same at 238, 120, 60 and 30 fps, where half a frame left it growing from 8 to 12.5 ms.
 */
const WAIT_FRAMES = 0.65

const STORAGE_KEY = 'lagDetectorCalibration'

export type LagEstimate = {
  totalMs: number
  /** From a sound reaching the audio engine to the beat decision, before any frame time. */
  detectorMs: number
  /** False while `detectorMs` is the typical figure and not one measured here. */
  calibrated: boolean
  /** Waiting for the frame that reads the audio: a bit over half of a drawn frame, which is longer when a quality tier caps the frame rate. */
  waitMs: number
  /** The time spent on the frame before it is handed to the GPU. */
  workMs: number
  /** One monitor refresh: a finished frame appears at the next one, whatever the frame cap. */
  displayMs: number
}

export const tenth = (value: number): number => Math.round(value * 10) / 10

export const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0)
}

export type DetectorDelay = { ms: number, calibrated: boolean }

export const estimateLag = ({ ms, calibrated }: DetectorDelay, frameMs: number, workMs: number, refreshMs: number): LagEstimate => {
  const wait = Math.max(0, frameMs) * WAIT_FRAMES
  const work = Math.max(0, workMs)
  const display = Math.max(0, refreshMs)
  return {
    totalMs: tenth(ms + wait + work + display),
    detectorMs: tenth(ms),
    calibrated,
    waitMs: tenth(wait),
    workMs: tenth(work),
    displayMs: tenth(display),
  }
}

/** What is left of a measured click-to-GPU time once the frame parts are taken out: the detector's delay. */
export const detectorDelayOf = (submitMs: number, frameMs: number, workMs: number): number => Math.max(0, submitMs - frameMs * WAIT_FRAMES - workMs)

// The saved delays, by the setup each was measured with.
type StoredCalibrations = Record<string, number>

type CalibrationStorage = Pick<Storage, 'getItem' | 'setItem'>

const isStoredCalibrations = (value: unknown): value is StoredCalibrations =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
  && Object.values(value).every((delay) => typeof delay === 'number' && Number.isFinite(delay))

/**
 * The detector delays the calibration found, kept in storage so they carry over to the next visit. They are read from storage once
 * (the panel asks several times a second), and each only applies to the setup it was measured with: the sample rate (the windows are
 * a number of samples), which bands can set off a beat, the Threshold slider and the quality mode. Any other setup reads as the
 * typical figure given for it.
 */
export class DetectorCalibration {
  private stored: StoredCalibrations = {}
  private loaded = false

  constructor(private readonly storage: () => CalibrationStorage | null) {}

  read = (setup: string, typicalMs: number): DetectorDelay => {
    this.load()
    const saved = this.stored[setup]
    return saved === undefined ? { ms: typicalMs, calibrated: false } : { ms: saved, calibrated: true }
  }

  save = (setup: string, detectorMs: number): void => {
    this.load()
    this.stored = { ...this.stored, [setup]: detectorMs }
    try {
      this.storage()?.setItem(STORAGE_KEY, JSON.stringify(this.stored))
    } catch {
      // Storage can be blocked; the figure still holds for this visit.
    }
  }

  private load = (): void => {
    if (this.loaded) return
    this.loaded = true
    try {
      const parsed: unknown = JSON.parse(this.storage()?.getItem(STORAGE_KEY) ?? 'null')
      this.stored = isStoredCalibrations(parsed) ? parsed : {}
    } catch {
      this.stored = {}
    }
  }
}

export const detectorCalibration = new DetectorCalibration(() => {
  try {
    return window.localStorage
  } catch {
    return null
  }
})
