import { describe, expect, it } from 'vitest'

import { pickNearestScreen } from './popoutScreen'

// Three monitors in a row: a 1920x1080 on the left, the laptop panel in the middle, a 2560x1440 on the right.
const leftMonitor = { name: 'left', left: -1920, top: 286, width: 1920, height: 1080 }
const laptop = { name: 'laptop', left: 0, top: 0, width: 1707, height: 1067 }
const rightMonitor = { name: 'right', left: 1707, top: 59, width: 2560, height: 1440 }

describe('pickNearestScreen', () => {
  it('picks the laptop screen from the right monitor, though the left monitor is listed first', () => {
    expect(pickNearestScreen(rightMonitor, [leftMonitor, laptop, rightMonitor])).toBe(laptop)
  })

  it('picks the laptop screen from the left monitor', () => {
    expect(pickNearestScreen(leftMonitor, [laptop, rightMonitor, leftMonitor])).toBe(laptop)
  })

  it('picks a neighbor of the middle screen when the visualizer is on it', () => {
    expect(pickNearestScreen(laptop, [leftMonitor, laptop, rightMonitor])).toBe(leftMonitor)
  })

  it('has nothing to pick with one screen', () => {
    expect(pickNearestScreen(laptop, [laptop])).toBeUndefined()
  })

  it('goes to the screen listed first on a tie', () => {
    const a = { left: -1000, top: 0, width: 1000, height: 1000 }
    const b = { left: 1000, top: 0, width: 1000, height: 1000 }
    const middle = { left: 0, top: 0, width: 1000, height: 1000 }
    expect(pickNearestScreen(middle, [a, b, middle])).toBe(a)
  })
})
