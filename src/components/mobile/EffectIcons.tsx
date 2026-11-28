import React from 'react'

import type { EffectKey } from '../config/useGalaxyMotion'

// The effect icons of the mobile bar (docs/mobile-design/EffectIcons.html): 24px stroke SVGs drawn in currentColor.

export type EffectIconKey = EffectKey | 'kaleidoscope'

const PATHS: Readonly<Record<EffectIconKey, React.ReactElement>> = {
  // A spiral.
  cyclone: <path d='M12 12m-2 0a2 2 0 1 0 4 0a4 4 0 1 0-8 0a6 6 0 1 0 12 0a8 8 0 1 0-16 0' />,
  // A dot with nested arcs either side.
  wobWob: (
    <>
      <circle cx='12' cy='12' r='2' />
      <path d='M7 7a7 7 0 0 0 0 10M17 7a7 7 0 0 1 0 10M4 4a11 11 0 0 0 0 16M20 4a11 11 0 0 1 0 16' />
    </>
  ),
  // Two opposing arrows.
  switcheroo: <path d='M4 8h14l-3-3M20 16H6l3 3' />,
  // Three overlapping circles.
  colorShift: (
    <>
      <circle cx='9' cy='10' r='5' />
      <circle cx='15' cy='10' r='5' />
      <circle cx='12' cy='15' r='5' />
    </>
  ),
  // A sun with rays.
  glow: (
    <>
      <circle cx='12' cy='12' r='4' />
      <path d='M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1' />
    </>
  ),
  // A solid ring with a wider dashed ring around it.
  shockwave: (
    <>
      <circle cx='12' cy='12' r='5.5' />
      <circle cx='12' cy='12' r='10.5' strokeDasharray='3 3' />
    </>
  ),
  // A hexagon with three diagonals.
  kaleidoscope: (
    <>
      <path d='M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z' />
      <path d='M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9' />
    </>
  ),
}

export const EffectIcon = ({ effect, size = 22 }: { effect: EffectIconKey; size?: number }): React.ReactElement => (
  <svg width={size} height={size} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
    {PATHS[effect]}
  </svg>
)

/** Three lines: the bar's menu button. */
export const MenuIcon = (): React.ReactElement => (
  <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' aria-hidden='true'>
    <path d='M4 7h16M4 12h16M4 17h16' />
  </svg>
)

/** A person outline: the account badge when signed out (docs/mobile-design/AccountGuest.html). */
export const PersonIcon = (): React.ReactElement => (
  <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' aria-hidden='true'>
    <circle cx='12' cy='8' r='4' />
    <path d='M4 21a8 8 0 0 1 16 0' />
  </svg>
)
