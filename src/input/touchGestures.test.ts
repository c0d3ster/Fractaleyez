import { describe, expect, it } from 'vitest'

import {
  angleDelta, applyDelta, classifyTwoFinger, DOUBLE_TAP_MS, DOUBLE_TAP_SLOP_PX, isDoubleTap, isTap, measureTwoFinger, PointerTrack, readGesture,
  ROTATION_PER_PX, ROTATION_PER_RAD, SCALE_PER_PX, SPEED_PER_PX, TAP_MAX_MS, TAP_SLOP_PX, TWO_FINGER_DEAD_ZONE_PX,
} from './touchGestures'

const track = (sx: number, sy: number, cx: number, cy: number): PointerTrack => ({ start: { x: sx, y: sy }, current: { x: cx, y: cy } })

// Two fingers 200px apart on a horizontal line around (200, 400), moved by `move`.
const pair = (move: (p: { x: number; y: number }, i: 0 | 1) => { x: number; y: number }): [PointerTrack, PointerTrack] => {
  const starts = [{ x: 100, y: 400 }, { x: 300, y: 400 }] as const
  return [0, 1].map((i) => {
    const s = starts[i as 0 | 1]
    const c = move(s, i as 0 | 1)
    return track(s.x, s.y, c.x, c.y)
  }) as [PointerTrack, PointerTrack]
}

const rotateAround = (p: { x: number; y: number }, center: { x: number; y: number }, rad: number): { x: number; y: number } => {
  const dx = p.x - center.x
  const dy = p.y - center.y
  return { x: center.x + dx * Math.cos(rad) - dy * Math.sin(rad), y: center.y + dx * Math.sin(rad) + dy * Math.cos(rad) }
}

describe('readGesture', () => {
  it('steers with one finger', () => {
    expect(readGesture([track(10, 10, 13, 14)])).toEqual({ kind: 'steer', delta: 5 })
  })

  it('reads nothing with no fingers or three', () => {
    expect(readGesture([]).kind).toBe('none')
    expect(readGesture([track(0, 0, 0, 0), track(0, 0, 0, 0), track(0, 0, 0, 0)]).kind).toBe('none')
  })

  it('reads both fingers moving up as speed, up is faster', () => {
    const up = readGesture(pair((p) => ({ x: p.x, y: p.y - 100 })))
    expect(up.kind).toBe('speed')
    expect(up.delta).toBeCloseTo(100 * SPEED_PER_PX)
    const down = readGesture(pair((p) => ({ x: p.x, y: p.y + 60 })))
    expect(down.kind).toBe('speed')
    expect(down.delta).toBeCloseTo(-60 * SPEED_PER_PX)
  })

  it('reads a pinch as scale, spreading zooms in', () => {
    const spread = readGesture(pair((p, i) => ({ x: p.x + (i ? 40 : -40), y: p.y })))
    expect(spread.kind).toBe('scale')
    expect(spread.delta).toBeCloseTo(80 * SCALE_PER_PX)
    const squeeze = readGesture(pair((p, i) => ({ x: p.x + (i ? -30 : 30), y: p.y })))
    expect(squeeze.kind).toBe('scale')
    expect(squeeze.delta).toBeCloseTo(-60 * SCALE_PER_PX)
  })

  it('reads a twist as rotation', () => {
    const twist = readGesture(pair((p) => rotateAround(p, { x: 200, y: 400 }, 0.4)))
    expect(twist.kind).toBe('rotation')
    expect(twist.delta).toBeCloseTo(0.4 * ROTATION_PER_RAD)
    const back = readGesture(pair((p) => rotateAround(p, { x: 200, y: 400 }, -0.3)))
    expect(back.delta).toBeCloseTo(-0.3 * ROTATION_PER_RAD)
  })

  it('keeps a locked kind even when another measure grows larger', () => {
    // Mostly a pinch now, but the gesture started as speed.
    const pinchy = pair((p, i) => ({ x: p.x + (i ? 80 : -80), y: p.y - 20 }))
    expect(readGesture(pinchy).kind).toBe('scale')
    const locked = readGesture(pinchy, 'speed')
    expect(locked.kind).toBe('speed')
    expect(locked.delta).toBeCloseTo(20 * SPEED_PER_PX)
  })

  it('ignores a steer lock for two fingers', () => {
    expect(readGesture(pair((p) => ({ x: p.x, y: p.y - 100 })), 'steer').kind).toBe('speed')
  })
})

describe('dead zone', () => {
  it('reads none just inside the dead zone and the kind at its edge', () => {
    const inside = pair((p) => ({ x: p.x, y: p.y - (TWO_FINGER_DEAD_ZONE_PX - 0.5) }))
    expect(readGesture(inside)).toEqual({ kind: 'none', delta: 0 })
    const edge = pair((p) => ({ x: p.x, y: p.y - TWO_FINGER_DEAD_ZONE_PX }))
    expect(readGesture(edge).kind).toBe('speed')
  })

  it('applies to the pinch and twist measures too', () => {
    const half = TWO_FINGER_DEAD_ZONE_PX / 2
    expect(readGesture(pair((p, i) => ({ x: p.x + (i ? half - 1 : -(half - 1)), y: p.y }))).kind).toBe('none')
    expect(readGesture(pair((p, i) => ({ x: p.x + (i ? half : -half), y: p.y }))).kind).toBe('scale')
    // Arc = twist * radius (100px): just under the dead zone, then at it.
    const center = { x: 200, y: 400 }
    expect(readGesture(pair((p) => rotateAround(p, center, (TWO_FINGER_DEAD_ZONE_PX - 1) / 100))).kind).toBe('none')
    expect(readGesture(pair((p) => rotateAround(p, center, (TWO_FINGER_DEAD_ZONE_PX + 0.5) / 100))).kind).toBe('rotation')
  })
})

describe('rotation as a sideways drag (ROTATION_BY_TWIST false)', () => {
  it('reads two fingers moving sideways as rotation', () => {
    const right = readGesture(pair((p) => ({ x: p.x + 50, y: p.y })), 'none', false)
    expect(right.kind).toBe('rotation')
    expect(right.delta).toBeCloseTo(50 * ROTATION_PER_PX)
    expect(readGesture(pair((p) => ({ x: p.x - 50, y: p.y })), 'none', false).delta).toBeCloseTo(-50 * ROTATION_PER_PX)
  })

  it('no longer reads a twist as rotation', () => {
    // A pure twist of two fingers moves their midpoint nowhere: no sideways motion, and the gap is unchanged.
    expect(readGesture(pair((p) => rotateAround(p, { x: 200, y: 400 }, 0.6)), 'none', false).kind).not.toBe('rotation')
  })

  it('leaves sideways motion alone with the flag on', () => {
    expect(readGesture(pair((p) => ({ x: p.x + 50, y: p.y })), 'none', true).kind).toBe('none')
  })
})

describe('angleDelta', () => {
  it('wraps across the ±π line', () => {
    expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2)
    expect(angleDelta(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(-0.2)
    expect(angleDelta(0, Math.PI)).toBeCloseTo(Math.PI)
    expect(angleDelta(0.5, 0.2)).toBeCloseTo(-0.3)
  })

  it('reads a twist across the line as small in measureTwoFinger', () => {
    // Fingers stacked so their angle starts near π (b left of a) and twisting by 0.3 crosses to -π.
    const a = track(300, 400, 300, 400)
    const target = rotateAround({ x: 100, y: 401 }, { x: 300, y: 400 }, 0.3)
    const b = track(100, 401, target.x, target.y)
    const motion = measureTwoFinger(a, b)
    expect(motion.twist).toBeCloseTo(0.3, 5)
    expect(classifyTwoFinger(motion)).toBe('rotation')
  })
})

describe('taps', () => {
  it('is a tap only when short and still', () => {
    expect(isTap(TAP_MAX_MS, TAP_SLOP_PX - 1)).toBe(true)
    expect(isTap(TAP_MAX_MS + 1, 0)).toBe(false)
    expect(isTap(50, TAP_SLOP_PX)).toBe(false)
  })

  it('is a double-tap within the window and near the first tap', () => {
    const first = { time: 1000, point: { x: 100, y: 100 } }
    expect(isDoubleTap(null, first)).toBe(false)
    expect(isDoubleTap(first, { time: 1000 + DOUBLE_TAP_MS, point: { x: 110, y: 100 } })).toBe(true)
    expect(isDoubleTap(first, { time: 1000 + DOUBLE_TAP_MS + 1, point: { x: 100, y: 100 } })).toBe(false)
    expect(isDoubleTap(first, { time: 1100, point: { x: 100 + DOUBLE_TAP_SLOP_PX + 1, y: 100 } })).toBe(false)
    expect(isDoubleTap(first, { time: 900, point: { x: 100, y: 100 } })).toBe(false)
  })
})

describe('applyDelta', () => {
  const speed = { min: 0, max: 20, step: 0.5 }
  it('rounds to the step and clamps', () => {
    expect(applyDelta(2, 1.3, speed)).toBe(3.5)
    expect(applyDelta(2, -5, speed)).toBe(0)
    expect(applyDelta(19, 4, speed)).toBe(20)
    expect(applyDelta(0.1, 0.2, { min: 0, max: 1, step: 0.1 })).toBe(0.3)
    expect(applyDelta(1500, 237, { min: 100, max: 2000, step: 10 })).toBe(1740)
  })
})
