/**
 * Crossfade opacity is linear in time, but additive-blended particles don't read that way:
 * overlapping points compound brightness, and human vision's gamma response means even a small
 * linear opacity already looks like most of the way to full brightness. Squaring the progress
 * compensates -- opacity climbs slowly at first and accelerates near the end, matching how the
 * fade actually looks rather than how the number moves.
 */
export const easeInQuad = (t: number): number => t * t
