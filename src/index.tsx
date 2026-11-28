// The entry: the visuals start as this bundle loads (main.ts). The UI is a chunk of its own, fetched and mounted once the look is complete
// (the layers join one by one, the video last), so neither its download nor mounting it, which holds the main thread for a moment,
// competes with the visuals for the network or the main thread. It does not wait longer than UI_WAIT_MS (a slow clip, no WebGL).
import './main'
import { startupTimeline } from './visualization/perf/startup'

const UI_WAIT_MS = 4000

const lookComplete = Promise.race([
  startupTimeline.reached('meaningful'),
  new Promise<void>((resolve) => window.setTimeout(resolve, UI_WAIT_MS)),
])

void lookComplete
  .then(() => import(/* webpackChunkName: "ui" */ './ui'))
  .then(({ mountUi }) => mountUi())
