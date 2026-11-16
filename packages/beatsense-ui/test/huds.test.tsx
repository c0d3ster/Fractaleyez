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

  it('draw a threshold slider per drum only when given the thresholds and a change handler', () => {
    const bands = [true, false, false, true, false]
    expect(renderToStaticMarkup(<FrequencyHud enabledBands={bands} onEnabledBandsChange={ignoreChange} />)).not.toContain('type="range"')
    const markup = renderToStaticMarkup(
      <FrequencyHud
        enabledBands={bands}
        onEnabledBandsChange={ignoreChange}
        drumThresholds={{ kick: 0.875, hat: 0.6, snare: 0.8, clap: 0.85 }}
        onDrumThresholdsChange={ignoreChange}
      />
    )
    expect(markup.match(/type="range"/g)).toHaveLength(4)
    expect(markup).toContain('aria-label="hat threshold" value="60"')
    // The hat is off the model's 75, so its value is marked; the kick is at the model's.
    expect(markup).toContain('is-changed">60<')
    expect(markup).toContain('frequency-hud-threshold-value">87.5<')
  })

  it('show nothing measured before the source has anything', () => {
    const markup = renderToStaticMarkup(<HudProvider source={{}}><BeatHud /></HudProvider>)
    expect(markup).toContain('— BPM')
  })
})
