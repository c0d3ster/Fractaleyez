export type EasingFn = (t: number) => number

export const EASINGS: Record<string, EasingFn> = {
  linear: (t) => t,
  cubicIn: (t) => t*t*t,
  cubicOut: (t) => (--t)*t*t+1
}
