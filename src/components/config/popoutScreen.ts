type ScreenBox = { left: number; top: number; width: number; height: number }

const centerDistance = (a: ScreenBox, b: ScreenBox): number =>
  Math.hypot(a.left + a.width / 2 - (b.left + b.width / 2), a.top + a.height / 2 - (b.top + b.height / 2))

/**
 * The screen other than `current` whose center is nearest to it, so the config popout lands on a neighbor of the screen the
 * visualizer is on (the middle screen from either outer monitor) instead of whichever the OS lists first. A tie goes to the
 * screen listed first.
 */
export const pickNearestScreen = <T extends ScreenBox>(current: T, screens: readonly T[]): T | undefined =>
  screens
    .filter((screen) => screen !== current)
    .reduce<T | undefined>(
      (nearest, screen) => (nearest === undefined || centerDistance(current, screen) < centerDistance(current, nearest) ? screen : nearest),
      undefined,
    )
