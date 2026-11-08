export type SampleStats = {
  n: number
  mean: number
  p50: number
  p95: number
  p99: number
  max: number
}

const DEFAULT_CAPACITY = 1200

const round = (value: number): number => Math.round(value * 1000) / 1000

const percentile = (sorted: readonly number[], fraction: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0

/**
 * The last `capacity` values of one measurement. `push` runs on every frame, so it writes into a fixed buffer and allocates
 * nothing; the sort happens only when stats are asked for.
 */
export class Samples {
  private readonly values: Float64Array
  private count = 0
  private next = 0

  constructor(private readonly capacity = DEFAULT_CAPACITY) {
    this.values = new Float64Array(capacity)
  }

  push = (value: number): void => {
    this.values[this.next] = value
    this.next = (this.next + 1) % this.capacity
    if (this.count < this.capacity) this.count++
  }

  size = (): number => this.count

  clear = (): void => {
    this.count = 0
    this.next = 0
  }

  /** Null when nothing has been recorded. Values are rounded to a microsecond so the output stays readable. */
  stats = (): SampleStats | null => {
    if (this.count === 0) return null
    const sorted = Array.from(this.values.subarray(0, this.count)).sort((a, b) => a - b)
    const total = sorted.reduce((sum, value) => sum + value, 0)
    return {
      n: sorted.length,
      mean: round(total / sorted.length),
      p50: round(percentile(sorted, 0.5)),
      p95: round(percentile(sorted, 0.95)),
      p99: round(percentile(sorted, 0.99)),
      max: round(sorted[sorted.length - 1] ?? 0),
    }
  }
}
