import { describe, expect, it } from 'vitest'

import { shouldDrawForVideoFrame, shouldDrawUnderCap } from './frame-cap'

// Count the frames drawn over `seconds` of a display at `hz` under a cap.
const drawnPerSecond = (hz: number, capFps: number, seconds = 10): number => {
  const frameMs = 1000 / hz
  let last = 0
  let drawn = 0
  for (let i = 1; i <= hz * seconds; i++) {
    const now = i * frameMs
    if (!shouldDrawUnderCap(now - last, capFps, frameMs)) continue
    last = now
    drawn++
  }
  return drawn / seconds
}

describe('shouldDrawUnderCap', () => {
  it('halves a 240Hz display under a 120 cap', () => {
    expect(drawnPerSecond(240, 120)).toBeCloseTo(120, 0)
  })

  it('does not halve a 144Hz display under a 120 cap', () => {
    expect(drawnPerSecond(144, 120)).toBeCloseTo(144, 0)
  })

  it('leaves a display slower than the cap alone', () => {
    expect(drawnPerSecond(60, 120)).toBeCloseTo(60, 0)
  })

  it('keeps a 30 cap at 30 on a 60Hz display', () => {
    expect(drawnPerSecond(60, 30)).toBeCloseTo(30, 0)
  })

  it('draws a late frame after a stall', () => {
    expect(shouldDrawUnderCap(200, 120, 4)).toBe(true)
  })
})

// Run a display at `hz` under `capFps` with a clip delivering `clipFps` frames: each display frame draws when the cap allows, or
// early when a video frame is waiting. Returns the longest wait from a frame's arrival to its draw and the draws per second.
const playClip = (hz: number, capFps: number, clipFps: number, seconds = 10): { maxWaitMs: number; drawsPerSecond: number; framesShown: number; framesDelivered: number } => {
  const frameMs = 1000 / hz
  const clipMs = 1000 / clipFps
  let last = 0
  let draws = 0
  let nextArrival = clipMs * 0.37
  let waitingSince: number | null = null
  let maxWaitMs = 0
  let shown = 0
  let delivered = 0
  for (let i = 1; i <= hz * seconds; i++) {
    const now = i * frameMs
    while (nextArrival <= now) {
      if (waitingSince !== null) shown-- // the previous frame was overwritten before any draw showed it
      waitingSince = nextArrival
      delivered++
      shown++
      nextArrival += clipMs
    }
    const sinceLast = now - last
    const draw = shouldDrawUnderCap(sinceLast, capFps, frameMs) || (waitingSince !== null && shouldDrawForVideoFrame(sinceLast, capFps, frameMs))
    if (!draw) continue
    if (waitingSince !== null) maxWaitMs = Math.max(maxWaitMs, now - waitingSince)
    waitingSince = null
    last = now
    draws++
  }
  return { maxWaitMs, drawsPerSecond: draws / seconds, framesShown: shown, framesDelivered: delivered }
}

describe('shouldDrawForVideoFrame', () => {
  it('draws a waiting frame when the cap is still far from drawing', () => {
    expect(shouldDrawForVideoFrame(10, 30, 4.17)).toBe(true)
  })

  it('leaves it to the cap when the cap draws within a few ms', () => {
    expect(shouldDrawForVideoFrame(28, 30, 4.17)).toBe(false)
    expect(shouldDrawForVideoFrame(3, 120, 4.17)).toBe(false)
  })

  it('never draws again within two display frames of the last draw', () => {
    expect(shouldDrawForVideoFrame(4, 30, 4.17)).toBe(false)
  })

  it('shows every frame of a 24fps clip within a few ms of its arrival under a 30 cap', () => {
    const { maxWaitMs, framesShown, framesDelivered } = playClip(240, 30, 24)
    expect(maxWaitMs).toBeLessThanOrEqual(11)
    expect(framesShown).toBe(framesDelivered)
  })

  it('shows every frame of a 29.97fps clip under a 30 cap, which dropped one in five before', () => {
    const { maxWaitMs, framesShown, framesDelivered } = playClip(240, 30, 29.97)
    expect(maxWaitMs).toBeLessThanOrEqual(11)
    expect(framesShown).toBe(framesDelivered)
  })

  it('shows every frame of a 24fps clip within a few ms under a 60 cap', () => {
    const { maxWaitMs, framesShown, framesDelivered } = playClip(240, 60, 24)
    expect(maxWaitMs).toBeLessThanOrEqual(11)
    expect(framesShown).toBe(framesDelivered)
  })

  it('adds no more draws than the clip has frames, and few under a cap that already suits it', () => {
    expect(playClip(240, 30, 24).drawsPerSecond).toBeLessThanOrEqual(30 + 24)
    expect(playClip(240, 120, 24).drawsPerSecond).toBeLessThanOrEqual(120 + 24)
    expect(playClip(240, 120, 24).drawsPerSecond).toBeLessThan(130)
  })
})
