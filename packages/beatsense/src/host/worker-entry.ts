// The Web Worker's body: frames in, readings out. Bundled as its own entry (`new Worker(new URL('beatsense/worker', import.meta.url))`).
import { unpackFrame } from '../worklet/frame-message'
import { AnalysisHost } from './analysis-host'
import type { FromWorker, PortLike, ToWorker } from './protocol'

/** Wire a host to a worker scope. Split from the global so it can be tested with a fake port. */
export const serveAnalysis = (scope: PortLike<FromWorker, ToWorker>): AnalysisHost => {
  const host = new AnalysisHost()
  scope.onmessage = ({ data }): void => {
    if (data.type === 'settings') host.setSettings(data.settings)
    else if (data.type === 'spectrum') host.setSpectrum(data.on)
    else scope.postMessage({ type: 'reading', reading: host.push(unpackFrame(data.packed)) })
  }
  return host
}
