import type { FeedSettings } from '../driver/audio-feed'
import type { FrameReading } from '../driver/analyze'

/** Main thread to worker. `frame` carries a packed frame (see packFrame) whose buffer is transferred, not copied. */
export type ToWorker =
  | { type: 'frame'; packed: Float64Array }
  | { type: 'settings'; settings: FeedSettings }
  | { type: 'spectrum'; on: boolean }

/** Worker to main thread: one reading per frame. */
export type FromWorker = { type: 'reading'; reading: FrameReading }

/** The two-way channel a Worker (or its global scope, seen from inside) gives. */
export type PortLike<Out, In> = {
  postMessage: (message: Out, transfer?: Transferable[]) => void
  onmessage: ((event: { data: In }) => void) | null
}
