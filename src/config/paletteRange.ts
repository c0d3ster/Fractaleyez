/**
 * The Color config's palette range: which stretch of the palette is used, as two handles on a strip from 0 to 1.
 * The end can sit before the start, in which case the range runs off the end of the palette and back in at the start.
 */

/** The closest the two handles can get while dragging. */
export const MIN_RANGE_GAP = 0.01

/** How much of the palette the range covers (0..1]. Equal handles count as the whole palette. */
export const rangeSpan = (start: number, end: number): number => (end > start ? end - start : 1 - start + end)

export const isFullRange = (start: number, end: number): boolean => start <= 0 && end >= 1

/** Where `fraction` (0..1) of the way through the range lands on the palette. */
export const rangePosition = (start: number, end: number, fraction: number): number => {
  const position = start + fraction * rangeSpan(start, end)
  return position > 1 ? position - 1 : position
}
