import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BeatHud, FrequencyHud, HudProvider, SectionHud, type Hint } from '../src'

// Server rendering runs no effects, so this checks the markup and the hints, not the canvases (the draw code is tested on its own).
const ignoreChange = (): void => undefined

describe('the HUDs', () => {
  it('describe their parts with a title when there is no provider', () => {
    const markup = renderToStaticMarkup(
      <>
        <FrequencyHud enabledBands={[true, false, false, true, false]} onEnabledBandsChange={ignoreChange} />
        <BeatHud />
        <SectionHud />
      </>
    )
    expect(markup).toContain('class="frequency-hud-wrapper" title="Click a band')
    expect(markup).toContain('class="beat-hud-bpm" title="Tempo read')
    expect(markup).toContain('class="section-hud-name" title="The part of the song')
    expect(markup).toContain('<canvas width="360" height="120" class="beat-hud-canvas">')
  })

  it('use the provider\'s hint for every description', () => {
    const described: string[] = []
    const hint: Hint = (text) => {
      described.push(text)
      return {}
    }
    const markup = renderToStaticMarkup(
      <HudProvider hint={hint}>
        <FrequencyHud enabledBands={[true, false, false, true, false]} onEnabledBandsChange={ignoreChange} />
        <BeatHud />
        <SectionHud />
      </HudProvider>
    )
    expect(markup).not.toContain('title=')
    // One on the Frequency HUD, five on the Beat HUD, four on the Section HUD.
    expect(described).toHaveLength(10)
  })

  it('show nothing measured before the source has anything', () => {
    const markup = renderToStaticMarkup(<HudProvider source={{}}><BeatHud /></HudProvider>)
    expect(markup).toContain('— BPM')
  })
})
