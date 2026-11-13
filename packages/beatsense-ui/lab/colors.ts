import { ONSET_BANDS, type SongSection } from 'beatsense'

// Colors shared by the live strip and the review page.

// The Section HUD's colors, a little stronger on a flat strip.
export const SECTION_COLORS: Record<SongSection, string> = {
  intro: 'rgba(80, 190, 210, 0.45)',
  quiet: 'rgba(120, 130, 150, 0.30)',
  groove: 'rgba(90, 160, 120, 0.35)',
  buildup: 'rgba(240, 190, 60, 0.55)',
  turnaround: 'rgba(255, 255, 255, 0.55)',
  break: 'rgba(90, 140, 220, 0.50)',
  drop: 'rgba(235, 80, 110, 0.65)',
  outro: 'rgba(160, 110, 210, 0.50)',
}

// The HUDs' band colors (beatsense-ui's bandColor), so a band looks the same here.
export const bandColor = (band: number, lightness: number, alpha: number = 1): string =>
  `hsla(${Math.round((band * 360) / ONSET_BANDS.length + 200) % 360}, 80%, ${lightness}%, ${alpha})`

export const RISER_COLOR = '#b388ff'
export const SWEEP_COLOR = '#80cbc4'
