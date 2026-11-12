import { describe, expect, it } from 'vitest'

import { CAPTURE_HZ, FrameEmitter, FrontEnd, packFrame, toAudioFrame, unpackFrame } from '../../src'
import type { CaptureFrame } from '../../src'

const RATE = 48000

const tone = (samples: number): Float32Array =>
  Float32Array.from({ length: samples }, (_, n) => 0.4 * Math.sin((2 * Math.PI * 110 * n) / RATE) + 0.1 * Math.sin((2 * Math.PI * 5000 * n) / RATE))

/** The block sizes a source can deliver: the worklet's 128, odd sizes that straddle frame ends, and one big block. */
const feedInBlocks = (pcm: Float32Array, size: number): CaptureFrame[] => {
  const emitter = new FrameEmitter(RATE)
  const frames: CaptureFrame[] = []
  for (let at = 0; at < pcm.length; at += size) frames.push(...emitter.push(pcm.subarray(at, at + size)))
  return frames
}

describe('FrameEmitter', () => {
  it('emits a frame every 1/60 s of samples, indexed from 1', () => {
    const frames = feedInBlocks(tone(RATE), 128)
    expect(frames).toHaveLength(CAPTURE_HZ)
    expect(frames.map(({ index }) => index)).toEqual(Array.from({ length: CAPTURE_HZ }, (_, i) => i + 1))
    expect(toAudioFrame(frames[59]!).t).toBeCloseTo(1000, 6)
  })

  it('gives identical frames whatever the block size', () => {
    const pcm = tone(RATE * 2)
    const reference = feedInBlocks(pcm, 128)
    for (const size of [1, 100, 127, 441, 4096, pcm.length]) expect(feedInBlocks(pcm, size)).toEqual(reference)
  })

  it('matches the front end read at the same sample counts', () => {
    const pcm = tone(RATE)
    const frontEnd = new FrontEnd(RATE)
    let fed = 0
    feedInBlocks(pcm, 128).forEach(({ index, levels, energy, spectrum }) => {
      const end = Math.floor((index * RATE) / CAPTURE_HZ)
      frontEnd.push(pcm.subarray(fed, end))
      fed = end
      const reading = frontEnd.read()
      expect(levels).toEqual(reading.levels)
      expect(energy).toBe(reading.energy)
      expect(Array.from(spectrum ?? [])).toEqual(Array.from(reading.spectrum ?? []))
    })
  })

  it('leaves the spectrum off while it is not wanted', () => {
    const emitter = new FrameEmitter(RATE)
    emitter.setSpectrum(false)
    const [frame] = emitter.push(tone(RATE / 30))
    expect(frame?.spectrum).toBeUndefined()
  })
})

describe('frame messages', () => {
  it('round-trips a frame through a transferable buffer', () => {
    const [frame] = feedInBlocks(tone(1000), 128)
    const { spectrum, ...bare } = frame!
    expect(unpackFrame(packFrame(frame!))).toEqual(frame)
    expect(unpackFrame(packFrame(bare))).toEqual(bare)
    expect(spectrum).toHaveLength(40)
  })
})
