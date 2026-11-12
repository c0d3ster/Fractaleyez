// The detectors behind a frame-in, reading-out interface that runs in a Web Worker with the main thread as the fallback. `worker.ts` is its own bundle entry.
export { AnalysisHost } from './analysis-host'
export { createAnalysisClient, createThreadClient, createWorkerClient } from './client'
export type { AnalysisClient, ReadingListener, WorkerLike } from './client'
export { serveAnalysis } from './worker-entry'
export type { FromWorker, PortLike, ToWorker } from './protocol'
