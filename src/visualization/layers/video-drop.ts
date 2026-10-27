export type PlaybackCounts = { dropped: number; total: number }

/**
 * The share of video frames dropped between two readings of one element's playback counters. A reading from a different
 * element (its counters restarted, so the total went down) or one with no new frames says nothing and counts as 0.
 */
export const dropShare = (previous: PlaybackCounts | null, current: PlaybackCounts): number => {
  if (!previous || current.total <= previous.total) return 0
  return Math.max(0, current.dropped - previous.dropped) / (current.total - previous.total)
}
