/** Moves `current` toward `target` by at most `maxStep` (never past it). */
export const stepToward = (current: number, target: number, maxStep: number): number => {
  const gap = target - current
  return Math.abs(gap) <= maxStep ? target : current + Math.sign(gap) * maxStep
}
