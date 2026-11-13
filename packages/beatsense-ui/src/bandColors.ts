import { ONSET_BANDS } from 'beatsense'

/** One color per band, spread around the color wheel so neighbors are easy to tell apart. The Frequency and Beat HUDs both use it, so a band looks the same in each. */
export const bandColor = (band: number, lightness: number, alpha: number = 1): string => {
  const hue = Math.round((band * 360) / ONSET_BANDS.length + 200) % 360
  return `hsla(${hue}, 80%, ${lightness}%, ${alpha})`
}
