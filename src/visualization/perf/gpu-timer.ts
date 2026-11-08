/** The slice of a WebGL2 context the timer uses, so tests can stand in for it. */
export type TimerGl = {
  createQuery: () => WebGLQuery | null
  deleteQuery: (query: WebGLQuery) => void
  beginQuery: (target: number, query: WebGLQuery) => void
  endQuery: (target: number) => void
  getQueryParameter: (query: WebGLQuery, parameter: number) => unknown
  getParameter: (parameter: number) => unknown
  QUERY_RESULT: number
  QUERY_RESULT_AVAILABLE: number
}

export type TimerExtension = {
  TIME_ELAPSED_EXT: number
  GPU_DISJOINT_EXT: number
}

export type GpuTimerFaults = { refused: number; disjoint: number; invalid: number }

type Pending = { name: string; query: WebGLQuery; tag: number }

/** A section's finished GPU time, in milliseconds, with the tag it was started under (the probe uses the frame number). */
export type GpuResult = { name: string; ms: number; tag: number }

const NS_PER_MS = 1e6
// Results arrive a few frames late. A queue this long means they are not being collected, so the oldest are dropped.
const MAX_PENDING = 96
// One section taking longer than this on the GPU is not a measurement but a broken counter (software GL returns 2^64 - 1 ns), so it is dropped and counted.
const MAX_PLAUSIBLE_MS = 1000

/**
 * GPU time per section through `EXT_disjoint_timer_query_webgl2`. Sections must be sequential: a timer query cannot nest, so a
 * `begin` while another section is open is refused (and counted) instead of corrupting both. Results are read a frame or more
 * after the work was submitted, in `collect`, because asking early would stall the pipeline. Query objects are reused.
 */
export class GpuTimer {
  private readonly pending: Pending[] = []
  private readonly spare: WebGLQuery[] = []
  private open: Pending | null = null
  private refused = 0
  private disjoint = 0
  private invalid = 0

  constructor(
    private readonly gl: TimerGl,
    private readonly ext: TimerExtension,
  ) {}

  /** Starts timing a section. Returns false when it could not (another section is open, or no query object could be made). */
  begin = (name: string, tag = 0): boolean => {
    if (this.open) {
      this.refused++
      return false
    }
    const query = this.spare.pop() ?? this.gl.createQuery()
    if (!query) return false
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query)
    this.open = { name, query, tag }
    return true
  }

  end = (name: string): void => {
    const { open } = this
    if (!open || open.name !== name) return
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT)
    this.open = null
    this.pending.push(open)
    while (this.pending.length > MAX_PENDING) this.recycle(this.pending.shift()!)
  }

  /**
   * Hands every result that is ready to `onResult`, oldest first. Queries finish in order, so it stops at the first one that is
   * not ready. If the GPU reports a disjoint event (a clock change, a power-state switch) the waiting results are not trustworthy
   * and are dropped.
   */
  collect = (onResult: (result: GpuResult) => void): void => {
    if (this.gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
      this.disjoint++
      while (this.pending.length > 0) this.recycle(this.pending.shift()!)
      return
    }
    while (this.pending.length > 0) {
      const head = this.pending[0]!
      if (!this.gl.getQueryParameter(head.query, this.gl.QUERY_RESULT_AVAILABLE)) return
      this.pending.shift()
      const nanoseconds = Number(this.gl.getQueryParameter(head.query, this.gl.QUERY_RESULT))
      this.recycle(head)
      const ms = nanoseconds / NS_PER_MS
      if (!Number.isFinite(ms) || ms < 0 || ms > MAX_PLAUSIBLE_MS) this.invalid++
      else onResult({ name: head.name, ms, tag: head.tag })
    }
  }

  /** How often a section was refused for nesting, results were dropped as disjoint, and a reading was impossible. All should stay 0 on a real GPU. */
  getFaults = (): GpuTimerFaults => ({ refused: this.refused, disjoint: this.disjoint, invalid: this.invalid })

  dispose = (): void => {
    this.pending.forEach(({ query }) => this.gl.deleteQuery(query))
    this.spare.forEach((query) => this.gl.deleteQuery(query))
    this.pending.length = 0
    this.spare.length = 0
  }

  private recycle = ({ query }: Pending): void => {
    this.spare.push(query)
  }
}
