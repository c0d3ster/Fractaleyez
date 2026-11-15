import { describe, expect, it } from 'vitest'

import { DEFAULT_BAR_HEIGHT, frequencyLayout } from '../src/FrequencyHud'

describe('frequencyLayout', () => {
  it('keeps the labels, lights and riser meter below the bars, whatever their height', () => {
    const tall = frequencyLayout()
    const short = frequencyLayout(64)
    expect(tall.barAreaH).toBe(DEFAULT_BAR_HEIGHT)
    expect(tall.height).toBe(142)
    // Everything below the bars moves up by what the bars lose, and the HUD is that much shorter.
    expect(tall.height - short.height).toBe(DEFAULT_BAR_HEIGHT - 64)
    expect(tall.instrumentTop - short.instrumentTop).toBe(DEFAULT_BAR_HEIGHT - 64)
    expect(short.bandsH).toBeGreaterThan(short.barAreaH)
    expect(short.instrumentLabelY).toBeLessThan(short.height)
  })
})
