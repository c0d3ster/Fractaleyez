// Usage: node parity.js capture <dir> [--scenarios=a,b|all] [--frames=60] [--size=640x400]
//        node parity.js compare <dirA> <dirB> [--tolerance=0]
//
// Proves that a rendering change leaves the picture alone. `capture` loads the app on a virtual clock (performance.now, Date and
// requestAnimationFrame are replaced, Math.random is seeded, there is no microphone), draws an exact number of frames and writes the
// canvas's pixels to <dir>/<scenario>.rgba (and a .png to look at). Run it on the code before a change and again after, then `compare`
// the two folders: a change that must not alter the picture shows 0 differing pixels. A change that is meant to, shows where.
// Needs the app on BENCH_URL (default http://localhost:3000). Software GL is fine: only the pixels matter, and they are the same
// run to run on one machine and browser. Compare captures from the same machine. A scene with every layer drifts now and then (about one capture in
// five) when something the app fetches resolves between two stepped batches and rebuilds the orbit; capture that scenario again before suspecting the code.
// Not everything is bit-exact between two loads of the same code: scenes with several layers drift by a few hundred pixels of 1 to 3 levels
// (something still reads a real clock). Capture the unchanged code twice and compare those to learn the floor, then judge a change against it
// (--tolerance=3 ignores differences up to 3 levels). The scenarios that matter most for a given change are the exact ones: effects-idle,
// orbit-only, orbit-levels, fractal-only and fractal-orbit have been identical run to run.
const path = require('path')
const fs = require('fs')
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const BASE_URL = process.env.BENCH_URL || 'http://localhost:3000'
const EXTRA_ARGS = (process.env.BENCH_CHROME_ARGS || '').split(' ').filter(Boolean)

const [mode, dirA, dirB] = process.argv.slice(2)
const args = process.argv.slice(2)
const flag = (name, fallback) => (args.find((a) => a.startsWith(`--${name}=`)) || `--${name}=${fallback}`).split('=').slice(1).join('=')
const frames = Number(flag('frames', 60))
const [width, height] = flag('size', '640x400').split('x').map(Number)
const wanted = flag('scenarios', 'all')
const tolerance = Number(flag('tolerance', 0))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Replaces every clock the app reads, so a frame draws the same pixels each time. Frames only happen when __step asks for them.
const VIRTUAL_TIME = `(() => {
  let now = 1000
  const base = 1.7e12
  performance.now = () => now
  const RealDate = Date
  class VirtualDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(base + now); else super(...a) }
    static now() { return base + now }
  }
  window.Date = VirtualDate
  // Two seeded streams. three.js draws from Math.random for every object's UUID, so a change that creates more or fewer objects would shift
  // the scene's own random numbers (particle hues) and look like a rendering change; UUIDs get a stream of their own.
  const stream = (start) => { let seed = start; return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
  const scene = stream(123456789)
  const uuids = stream(987654321)
  Math.random = () => (new Error().stack.indexOf('generateUUID') !== -1 ? uuids() : scene())
  let queue = []
  let id = 0
  window.requestAnimationFrame = (cb) => { queue.push([++id, cb]); return id }
  window.cancelAnimationFrame = (handle) => { queue = queue.filter(([queued]) => queued !== handle) }
  window.__step = (count, dt = 1000 / 60) => {
    for (let i = 0; i < count; i++) {
      now += dt
      const due = queue
      queue = []
      due.forEach(([, cb]) => cb(now))
    }
  }
  window.__pixels = () => {
    const gl = [...document.querySelectorAll('canvas')].find((c) => c.style.position === 'fixed')
    const copy = document.createElement('canvas')
    copy.width = gl.width
    copy.height = gl.height
    const ctx = copy.getContext('2d')
    ctx.drawImage(gl, 0, 0)
    return { w: gl.width, h: gl.height, rgba: Array.from(ctx.getImageData(0, 0, gl.width, gl.height).data), png: copy.toDataURL('image/png') }
  }
})()`

const set = (section, item, value) => `window.updateConfigItem(${JSON.stringify(section)}, ${JSON.stringify(item)}, ${JSON.stringify(value)})`
const only = (keep) => ['video', 'fractal', 'orbit', 'logo'].map((key) => `window.setLayerEnabled('${key}', ${key === keep})`).join(';')

// Each scenario is the page code run once the app has loaded (config changes), before the measured frames.
const SCENARIOS = {
  default: '',
  'effects-idle': [set('effects', 'glow', false), set('effects', 'kaleidoscope', false), set('effects', 'shockwave', false)].join(';'),
  'effects-glow': [set('effects', 'glow', true), set('effects', 'kaleidoscope', false), set('effects', 'shockwave', false)].join(';'),
  'effects-kaleidoscope': [set('effects', 'glow', false), set('effects', 'kaleidoscope', true), set('effects', 'kaleidoscopeCount', 6), set('effects', 'shockwave', false)].join(';'),
  'effects-all': [set('effects', 'glow', true), set('effects', 'kaleidoscope', true), set('effects', 'kaleidoscopeCount', 4), set('effects', 'shockwave', true)].join(';'),
  'orbit-only': `${only('orbit')};${set('effects', 'glow', false)}`,
  'orbit-levels': `${only('orbit')};${set('particle', 'levels', 5)};${set('particle', 'layers', 4)};${set('effects', 'glow', false)}`,
  'fractal-only': `${only('fractal')};${set('effects', 'glow', false)}`,
  // Fractal and orbit together, effects off: both are exact run to run, so this one shows any change the effect pass makes with nothing to add.
  'fractal-orbit': `window.setLayerEnabled('video', false);window.setLayerEnabled('logo', false);${set('effects', 'glow', false)};${set('effects', 'kaleidoscope', false)};${set('effects', 'shockwave', false)}`,
}

const capture = async (dir) => {
  fs.mkdirSync(dir, { recursive: true })
  const names = wanted === 'all' ? Object.keys(SCENARIOS) : wanted.split(',')
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', ...EXTRA_ARGS] })
  for (const name of names) {
    const page = await (await browser.newContext({ viewport: { width, height } })).newPage()
    page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)))
    await page.addInitScript(VIRTUAL_TIME)
    await page.goto(`${BASE_URL}/`, { waitUntil: 'load' })
    // The app starts its frame loop once the (failed) microphone request settles; getPerfData exists from then on. Real time for assets to load
    // meanwhile: no frame is drawn until __step asks for one, so the frame count is the same every run.
    await page.waitForFunction(() => typeof window.getPerfData === 'function', null, { timeout: 60000 })
    // Long enough for the sprites and config the app fetches on start to settle: a late one rebuilds the orbit with different random offsets mid-run.
    await sleep(5000)
    await page.evaluate(`window.setQuality('quality'); ${SCENARIOS[name]}`)
    await page.evaluate((count) => window.__step(count), 5)
    await sleep(1500)
    const result = await page.evaluate((count) => { window.__step(count); return window.__pixels() }, frames)
    fs.writeFileSync(path.join(dir, `${name}.rgba`), Buffer.from(result.rgba))
    fs.writeFileSync(path.join(dir, `${name}.png`), Buffer.from(result.png.split(',')[1], 'base64'))
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ w: result.w, h: result.h, frames }))
    console.log('captured', name, `${result.w}x${result.h}`)
    await page.context().close()
  }
  await browser.close()
}

const compare = (a, b) => {
  const names = fs.readdirSync(a).filter((file) => file.endsWith('.rgba')).map((file) => file.replace('.rgba', ''))
  let allSame = true
  for (const name of names) {
    const fileB = path.join(b, `${name}.rgba`)
    if (!fs.existsSync(fileB)) { console.log(name.padEnd(24), 'missing in', b); allSame = false; continue }
    const left = fs.readFileSync(path.join(a, `${name}.rgba`))
    const right = fs.readFileSync(fileB)
    if (left.length !== right.length) { console.log(name.padEnd(24), 'different sizes'); allSame = false; continue }
    let pixels = 0
    let maxDiff = 0
    let nonBlack = 0
    for (let i = 0; i < left.length; i += 4) {
      const diff = Math.max(Math.abs(left[i] - right[i]), Math.abs(left[i + 1] - right[i + 1]), Math.abs(left[i + 2] - right[i + 2]))
      if (diff > tolerance) { pixels++; maxDiff = Math.max(maxDiff, diff) }
      if (left[i] + left[i + 1] + left[i + 2] > 0) nonBlack++
    }
    if (pixels > 0) allSame = false
    console.log(name.padEnd(24), pixels === 0 ? (tolerance ? `identical within ${tolerance}` : 'identical') : `${pixels} pixels differ (max channel diff ${maxDiff})`, `| ${(100 * nonBlack / (left.length / 4)).toFixed(1)}% of pixels lit`)
  }
  process.exit(allSame ? 0 : 2)
}

;(async () => {
  if (mode === 'capture' && dirA) await capture(dirA)
  else if (mode === 'compare' && dirA && dirB) compare(dirA, dirB)
  else console.log('usage: node parity.js capture <dir> | node parity.js compare <dirA> <dirB>')
})().catch((error) => { console.error('FAILED', error); process.exit(1) })
