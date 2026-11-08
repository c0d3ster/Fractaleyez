import { PerfProbe, ProbeSummary } from './perf-probe'

const STORAGE_KEY = 'perfProbe'

/** What `window.perfProbe` offers the benchmark scripts. */
export type PerfProbeControls = {
  enable: () => void
  disable: () => void
  reset: () => void
  summary: () => ProbeSummary
}

// On with `?perf=1` in the address, or `localStorage.perfProbe = '1'`; the benchmark scripts can also call `window.perfProbe.enable()`.
const wantsProbe = (): boolean => {
  try {
    return new URLSearchParams(window.location.search).get('perf') === '1' || window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** The page's one probe. Off unless asked for; see `PerfProbe`. */
export const perfProbe = new PerfProbe()

if (typeof window !== 'undefined') {
  window.perfProbe = {
    enable: () => {
      perfProbe.enable()
      perfProbe.watchWindow('page', window)
    },
    disable: perfProbe.disable,
    reset: perfProbe.reset,
    summary: perfProbe.summary,
  }
  if (wantsProbe()) window.perfProbe.enable()
}
