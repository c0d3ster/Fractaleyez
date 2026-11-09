// Recorded ticks packed as bytes, for saving a listening session (one song with some padding is about 5,000 ticks, 470 KB) and reading it
// back in the training scripts. JSON was about three times the size.
//
// Each tick is TICK_BYTES, little-endian:
//   0   t        float64  ms, the clock the app's ticks use (performance.now)
//   8   power    5 x float32  mean band power (bass, lo, mid, hi, air)
//   28  peak     5 x float32  peak band power
//   48  bpm      float32  shown BPM, NaN for none
//   52  beats    uint8
//   53  onsets   uint8    a bit per band whose own onset fired
//   54  flags    uint8    1: the tick has peak and onsets, 2: it also has a spectrum
//   55  (unused)
//   56  spectrum SPECTRUM_BANDS x uint8
import type { SectionTick } from './sections'
import { SPECTRUM_BANDS } from './tick-extras'

export const TICK_ENCODING_VERSION = 1
const BANDS = 5
const SPECTRUM_AT = 56
export const TICK_BYTES = SPECTRUM_AT + SPECTRUM_BANDS

export const encodeTicks = (ticks: readonly SectionTick[]): Uint8Array => {
  const bytes = new Uint8Array(ticks.length * TICK_BYTES)
  const view = new DataView(bytes.buffer)
  ticks.forEach((tick, i) => {
    const at = i * TICK_BYTES
    view.setFloat64(at, tick.t, true)
    for (let b = 0; b < BANDS; b++) {
      view.setFloat32(at + 8 + b * 4, tick.power[b] ?? 0, true)
      view.setFloat32(at + 28 + b * 4, tick.peak?.[b] ?? 0, true)
    }
    view.setFloat32(at + 48, tick.bpm ?? NaN, true)
    view.setUint8(at + 52, Math.min(255, tick.beats))
    view.setUint8(at + 53, tick.onsets ?? 0)
    view.setUint8(at + 54, tick.peak ? (tick.spectrum ? 2 : 1) : 0)
    if (tick.spectrum) bytes.set(tick.spectrum.slice(0, SPECTRUM_BANDS), at + SPECTRUM_AT)
  })
  return bytes
}

export const decodeTicks = (bytes: Uint8Array): SectionTick[] => {
  if (bytes.length % TICK_BYTES !== 0) throw new Error(`tick data is ${bytes.length} bytes, not a multiple of ${TICK_BYTES}`)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Array.from({ length: bytes.length / TICK_BYTES }, (_, i) => {
    const at = i * TICK_BYTES
    const bpm = view.getFloat32(at + 48, true)
    const flags = view.getUint8(at + 54)
    const tick: SectionTick = {
      t: view.getFloat64(at, true),
      power: Array.from({ length: BANDS }, (__, b) => view.getFloat32(at + 8 + b * 4, true)),
      beats: view.getUint8(at + 52),
      bpm: Number.isNaN(bpm) ? null : bpm,
    }
    if (flags > 0) {
      tick.peak = Array.from({ length: BANDS }, (__, b) => view.getFloat32(at + 28 + b * 4, true))
      tick.onsets = view.getUint8(at + 53)
    }
    if (flags === 2) tick.spectrum = Array.from(bytes.subarray(at + SPECTRUM_AT, at + TICK_BYTES))
    return tick
  })
}

const CHUNK = 0x8000

/** Base64 without Buffer, so the browser and node share it. */
export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(binary)
}

export const base64ToBytes = (text: string): Uint8Array => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
