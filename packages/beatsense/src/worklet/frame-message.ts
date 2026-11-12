import { SPECTRUM_BANDS } from '../risers'
import { ONSET_BANDS } from '../onset'
import type { AudioFrame } from '../driver'

/** The capture hop: frames a second. It matches what the models were trained at, so the analysis needs no retrain. */
export const CAPTURE_HZ = 60

/** The name the processor is registered under, which AudioSource looks it up by. */
export const PROCESSOR_NAME = 'beatsense-capture'

/** What the main thread can tell the processor. */
export type CaptureCommand = { type: 'spectrum'; on: boolean }

/** One measured frame as the worklet makes it. Its time is the frame's index over the hop rate, i.e. the sample count, never a wall clock. */
export type CaptureFrame = {
  /** 1-based: frame n ends at sample floor(n * sampleRate / CAPTURE_HZ). */
  index: number
  levels: number[]
  energy: number
  spectrum?: Uint8Array
}

const HEADER = 3
const BANDS = ONSET_BANDS.length

/** A frame as one Float64Array (index, energy, whether a spectrum follows, the levels, the spectrum), so it can move between threads as a transferable buffer. */
export const packFrame = ({ index, levels, energy, spectrum }: CaptureFrame): Float64Array => {
  const out = new Float64Array(HEADER + BANDS + (spectrum ? SPECTRUM_BANDS : 0))
  out[0] = index
  out[1] = energy
  out[2] = spectrum ? 1 : 0
  for (let b = 0; b < BANDS; b++) out[HEADER + b] = levels[b] ?? 0
  if (spectrum) for (let i = 0; i < SPECTRUM_BANDS; i++) out[HEADER + BANDS + i] = spectrum[i] ?? 0
  return out
}

export const unpackFrame = (packed: Float64Array): CaptureFrame => {
  const frame: CaptureFrame = { index: packed[0] ?? 0, energy: packed[1] ?? 0, levels: Array.from(packed.subarray(HEADER, HEADER + BANDS)) }
  if (packed[2] === 1) frame.spectrum = Uint8Array.from(packed.subarray(HEADER + BANDS, HEADER + BANDS + SPECTRUM_BANDS))
  return frame
}

/** The driver's input for a capture frame, on the audio clock (ms from the first sample). */
export const toAudioFrame = ({ index, levels, energy, spectrum }: CaptureFrame, hz: number = CAPTURE_HZ): AudioFrame => {
  const frame: AudioFrame = { t: (index * 1000) / hz, deltaMs: 1000 / hz, levels, energy }
  if (spectrum) frame.spectrum = spectrum
  return frame
}
