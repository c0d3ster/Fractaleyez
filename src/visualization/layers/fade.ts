/** Moves `current` toward `target` at a full 0..1 sweep per `durationMs`. A duration of 0 (or less) snaps. */
export const stepOpacity = (
  current: number,
  target: number,
  deltaMs: number,
  durationMs: number,
): number => {
  if (durationMs <= 0) return target
  const step = Math.max(0, deltaMs) / durationMs
  if (current < target) return Math.min(target, current + step)
  return Math.max(target, current - step)
}

/** True once a clip has `crossfadeMs` or less left, so the next one can start fading in underneath it. */
export const isNearEnd = (durationSec: number, currentTimeSec: number, crossfadeMs: number): boolean =>
  Number.isFinite(durationSec) && durationSec > 0 && (durationSec - currentTimeSec) * 1000 <= crossfadeMs
