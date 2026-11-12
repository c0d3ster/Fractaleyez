// The Worker bundle's entry: serve analysis on the worker's own scope.
import { serveAnalysis } from './worker-entry'
import type { FromWorker, PortLike, ToWorker } from './protocol'

declare const self: PortLike<FromWorker, ToWorker>

serveAnalysis(self)
