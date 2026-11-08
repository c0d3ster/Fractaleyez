// Usage: node hitch.js <label> [--scenarios=a,b,c|all] [--popup] [--hide=<css selectors>] [--attribution] [--quality=quality] [--size=1280x800] [--headless]
//
// Event hitches: what the worst frame does when something happens, which a steady-state run (bench.js) averages away. Each scenario
// runs on a fresh page load (first-use costs such as a shader compile only happen once per load), waits for the page to settle,
// resets the page's perf probe (src/visualization/perf), does one thing, and records the display frame gaps, the probe's CPU and GPU
// times per section, and the long animation frames of the page and of the config pop-out window.
//
// --popup opens the expanded config window (the E key) before the scenario. Most of the app's main-thread cost is there, so it is the normal
//   condition to measure, not an extra. --hide=<selectors> hides parts of it (display: none) to see what each costs, e.g. --hide=".perf-hud-wrapper".
//   --attribution runs the popup-idle and popup-drag scenarios once per widget hidden and prints one table.
// The tier is fixed (default quality) so Auto does not step during a run; --quality=auto leaves it on.
// Paths and browser come from the environment as in bench.js: BENCH_DIR, CHROME_PATH (default: the Chromium Playwright ships),
// BENCH_URL, BENCH_CHROME_ARGS (e.g. software GL: "--use-angle=swiftshader --enable-unsafe-swiftshader"), PLAYWRIGHT_CORE.
const path = require('path')
const fs = require('fs')
const OUT = process.env.BENCH_DIR || path.join(__dirname, 'out')
fs.mkdirSync(OUT, { recursive: true })
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const BASE_URL = process.env.BENCH_URL || 'http://localhost:3000'
const EXTRA_ARGS = (process.env.BENCH_CHROME_ARGS || '').split(' ').filter(Boolean)

const args = process.argv.slice(2)
const label = args[0]
const flag = (name, fallback) => (args.find((a) => a.startsWith(`--${name}=`)) || `--${name}=${fallback}`).split('=').slice(1).join('=')
const popup = args.includes('--popup')
const headless = args.includes('--headless')
const attribution = args.includes('--attribution')
const size = flag('size', '1280x800')
const quality = flag('quality', 'quality')
// The selectors hidden in the pop-out; --attribution changes it one widget at a time.
let hide = flag('hide', '')
const wanted = flag('scenarios', 'all')
const WARM_MS = Number(flag('warm', 5000))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const pct = (values, p) => { const s = [...values].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0 }
const r1 = (value) => Math.round(value * 10) / 10

// A display-frame recorder in the page: every requestAnimationFrame, whatever the app's frame cap, so a skipped draw is not mistaken for a hitch.
const RECORDER = `(() => {
  const h = { gaps: [], last: 0, on: false }
  window.__hitch = h
  const loop = (t) => { if (h.on) { if (h.last && t - h.last < 2000) h.gaps.push(t - h.last); h.last = t } else h.last = 0; requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
})()`

// Page-side actions, as source so they can be passed to page.evaluate with their arguments.
// Playwright sends a function's source, not its closure, so each action is a function plus the argument it is called with.
const action = (fn, arg) => ({ fn, arg })
const toggleItem = ({ section, item }) => window.updateConfigItem(section, item, !window.config[section][item].value)
const toggle = (section, item) => action(toggleItem, { section, item })
const dragOrbit = async () => {
  const base = window.config.orbit.a.value
  for (let i = 0; i < 60; i++) {
    window.updateConfigItem('orbit', 'a', base + i * 0.05)
    await new Promise((resolve) => setTimeout(resolve, 33))
  }
}
const scaleParticleItem = ({ item, factor }) => {
  const { value, max, min } = window.config.particle[item]
  window.updateConfigItem('particle', item, Math.max(min, Math.min(max, Math.round(value * factor))))
}
const scaleItem = (item, factor) => action(scaleParticleItem, { item, factor })
const bundle = () => {
  const { particle, orbit } = window.config
  window.updateConfigItem('particle', 'particlesPerLayer', Math.min(particle.particlesPerLayer.max, Math.round(particle.particlesPerLayer.value * 1.3)))
  window.updateConfigItem('particle', 'layers', Math.min(particle.layers.max, particle.layers.value + 1))
  window.updateConfigItem('particle', 'particleSize', Math.min(particle.particleSize.max, particle.particleSize.value + 2))
  ;['a', 'b', 'c', 'd', 'e'].forEach((key) => window.updateConfigItem('orbit', key, orbit[key].value * 1.1 + 0.1))
  window.updateConfigItem('color', 'saturation', 0.7)
  window.updateConfigItem('user', 'speed', window.config.user.speed.value + 1)
}
const toggleLayer = (key) => window.setLayerEnabled(key, !window.config.layers.meta[key].enabled.value)
const layer = (key) => action(toggleLayer, key)

// setup runs before the probe is reset (and the page then settles); act is the measured event; node(page, pop) is for things only the browser driver can do.
const SCENARIOS = {
  idle: { measureMs: 6000 },
  'glow-first': { act: toggle('effects', 'glow') },
  'glow-second': { setup: toggle('effects', 'glow'), act: toggle('effects', 'glow') },
  'kaleidoscope-on': { act: action(() => { window.updateConfigItem('effects', 'kaleidoscopeCount', 6); window.updateConfigItem('effects', 'kaleidoscope', true) }) },
  'shockwave-toggle': { act: toggle('effects', 'shockwave') },
  'layer-video': { act: layer('video') },
  'layer-logo': { act: layer('logo') },
  'layer-orbit': { act: layer('orbit') },
  'layer-fractal': { act: layer('fractal') },
  'orbit-drag': { act: action(dragOrbit), measureMs: 5000 },
  'particle-count': { act: scaleItem('particlesPerLayer', 1.5), measureMs: 5000 },
  'particle-levels': { act: scaleItem('levels', 2), measureMs: 5000 },
  bundle: { act: action(bundle), measureMs: 5000 },
  'tier-balanced': { act: action(() => window.setQuality('balanced')) },
  'tier-saver': { act: action(() => window.setQuality('saver')) },
  'tier-ultra': { act: action(() => window.setQuality('ultra')) },
  'tier-saver-to-quality': { setup: action(() => window.setQuality('saver')), act: action(() => window.setQuality('quality')) },
  resize: { node: async (page) => { await page.setViewportSize({ width: 1100, height: 700 }); await sleep(800); await page.setViewportSize({ width: 1400, height: 850 }) } },
  'popup-open': { popupAfter: true, node: async (page) => { await page.keyboard.press('e'); await sleep(1500) }, measureMs: 3000 },
  'popup-idle': { needsPopup: true, measureMs: 8000 },
  'popup-drag-speed': { needsPopup: true, node: (page, pop) => dragPopupSlider(pop, 'speed'), measureMs: 4000 },
  'popup-drag-a': { needsPopup: true, node: (page, pop) => dragPopupSlider(pop, 'a'), measureMs: 4000 },
  'popup-drag-particles': { needsPopup: true, node: (page, pop) => dragPopupSlider(pop, 'particlesPerLayer'), measureMs: 4000 },
}
const DEFAULT_SET = Object.keys(SCENARIOS).filter((name) => !SCENARIOS[name].needsPopup && !SCENARIOS[name].popupAfter)
const POPUP_SET = ['popup-idle', 'popup-drag-speed', 'popup-drag-a', 'popup-drag-particles']

// A real pointer drag on a slider in the pop-out: down at one end, 50 moves across it over about a second, up. It goes through React's onChange, the config
// state and both windows' trees, which setting the value from the page's console does not.
const dragPopupSlider = async (pop, name) => {
  const slider = pop.locator(`input[type=range][name="${name}"]`).first()
  await slider.scrollIntoViewIfNeeded()
  const box = await slider.boundingBox()
  if (!box) throw new Error(`no slider named ${name} in the pop-out`)
  const y = box.y + box.height / 2
  await pop.mouse.move(box.x + 8, y)
  await pop.mouse.down()
  for (let i = 0; i <= 50; i++) {
    await pop.mouse.move(box.x + 8 + (box.width - 16) * (i / 50), y)
    await sleep(20)
  }
  await pop.mouse.up()
}

const launch = async () => {
  const wav = path.join(OUT, 'drums.wav')
  const ctx = await chromium.launchPersistentContext(path.join(OUT, `profile-hitch-${label}-${Date.now()}`), {
    executablePath: process.env.CHROME_PATH || undefined,
    headless,
    viewport: headless ? { width: Number(size.split('x')[0]), height: Number(size.split('x')[1]) } : null,
    args: [
      '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
      ...(fs.existsSync(wav) ? [`--use-file-for-fake-audio-capture=${wav}`] : []),
      `--window-size=${size.replace('x', ',')}`,
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion', '--autoplay-policy=no-user-gesture-required', ...EXTRA_ARGS,
    ],
  })
  await ctx.addInitScript(() => { Object.defineProperty(Screen.prototype, 'isExtended', { get: () => false }) })
  return ctx
}

const openPopup = async (ctx, page) => {
  const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 15000 }), page.keyboard.press('e')])
  await pop.waitForLoadState('load')
  await sleep(2500)
  if (hide) await pop.addStyleTag({ content: `${hide} { display: none !important }` })
  return pop
}

const runScenario = async (ctx, name, def) => {
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)))
  await page.goto(`${BASE_URL}/?perf=1`, { waitUntil: 'load' })
  await sleep(2500)
  await page.mouse.click(300, 300)
  if (quality) await page.evaluate((q) => window.setQuality(q), quality)
  let pop = null
  if (popup || def.needsPopup) pop = await openPopup(ctx, page)
  await page.evaluate(RECORDER)
  if (def.setup) { await page.evaluate(def.setup.fn, def.setup.arg); await sleep(1500) }
  await sleep(WARM_MS)
  await page.evaluate(() => { window.__hitch.gaps.length = 0; window.__hitch.on = true; window.perfProbe.reset() })
  const startedAt = Date.now()
  if (def.act) await page.evaluate(def.act.fn, def.act.arg)
  if (def.node) await def.node(page, pop)
  await sleep(Math.max(0, (def.measureMs || 4000) - (Date.now() - startedAt)))
  const result = await page.evaluate(() => { window.__hitch.on = false; return { gaps: window.__hitch.gaps, probe: window.perfProbe.summary(), tier: window.getQuality().tier } })
  await page.close()
  for (const other of ctx.pages()) if (other !== page && !other.isClosed()) await other.close().catch(() => undefined)
  return summarize(name, result)
}

const section = (probe, key) => {
  const cpu = probe.sections[key] && probe.sections[key].cpu
  const gpu = probe.sections[key] && probe.sections[key].gpu
  return { cpuP95: cpu ? r1(cpu.p95) : null, cpuMax: cpu ? r1(cpu.max) : null, gpuP95: gpu ? r1(gpu.p95) : null, gpuMax: gpu ? r1(gpu.max) : null }
}

const summarize = (name, { gaps, probe, tier }) => ({
  scenario: name,
  popup: popup || Boolean(SCENARIOS[name].needsPopup),
  hide: hide || null,
  tier,
  displayFrames: gaps.length,
  gapP50: r1(pct(gaps, 0.5)),
  gapP99: r1(pct(gaps, 0.99)),
  gapMax: r1(Math.max(0, ...gaps)),
  over25: gaps.filter((g) => g > 25).length,
  over50: gaps.filter((g) => g > 50).length,
  drawnFrames: probe.frames,
  cpuP95: probe.cpu ? r1(probe.cpu.p95) : null,
  cpuMax: probe.cpu ? r1(probe.cpu.max) : null,
  gpuFrameP95: probe.gpuFrame ? r1(probe.gpuFrame.p95) : null,
  gpuTimer: probe.gpuTimer,
  gpuFaults: probe.gpuFaults,
  sections: Object.fromEntries(Object.keys(probe.sections).map((key) => [key, section(probe, key)])),
  loaf: Object.fromEntries(Object.entries(probe.longFrames).map(([window, s]) => [window, { count: s.count, blockingMs: s.blockingTotalMs, worstMs: s.worst[0] ? s.worst[0].durationMs : 0, top: s.topInvokers.slice(0, 3) }])),
  gauges: probe.gauges,
  popupCommits: probe.counters['popup.commit'] || 0,
  changeToPopupMs: probe.latencies['config.change to popup commit'] || null,
})

const cell = (value, width) => String(value === null || value === undefined ? '-' : value).padEnd(width)
const printTable = (rows) => {
  const cols = [['scenario', 24], ['popup', 6], ['frames', 7], ['gapP99', 7], ['gapMax', 7], ['>25', 5], ['>50', 5], ['cpuP95', 7], ['cpuMax', 7], ['gpuP95', 7]]
  console.log(cols.map(([c, w]) => c.padEnd(w)).join(''))
  for (const r of rows) {
    console.log([cell(r.scenario + (r.hide ? '*' : ''), 24), cell(r.popup ? 'yes' : 'no', 6), cell(r.displayFrames, 7), cell(r.gapP99, 7), cell(r.gapMax, 7), cell(r.over25, 5), cell(r.over50, 5), cell(r.cpuP95, 7), cell(r.cpuMax, 7), cell(r.gpuFrameP95, 7)].join(''))
    if (r.gauges && Object.keys(r.gauges).length) console.log(`    ${Object.entries(r.gauges).map(([k, v]) => `${k} ${v}`).join(' | ')}`)
    const loaf = Object.entries(r.loaf).map(([w, s]) => `${w}: ${s.count} long, worst ${s.worstMs} ms`).join(' | ')
    if (loaf) console.log(`    ${loaf}${r.popupCommits ? ` | popup commits ${r.popupCommits}` : ''}`)
  }
}

// Widgets of the pop-out, hidden one at a time by --attribution. Selectors are class names from src/components.
const WIDGETS = {
  none: '',
  'perf panel': '.perf-hud-wrapper',
  'frequency hud': '.frequency-hud-wrapper',
  'beat hud': '.beat-hud-wrapper',
  'section hud': '.section-hud-wrapper',
  'shape pad': '[class*="shape-pad"]',
  'camera pad': '[class*="camera-touchpad"]',
  'kaleidoscope dial': '[class*="kaleidoscope-dial"]',
  presets: '.presets-grid-wrap',
  'sprite hud': '.particle-sprite-hud',
  'everything but sliders': '[class*="hud"], [class*="pad"], [class*="kaleidoscope-dial"], .presets-grid-wrap, .effect-chips',
}

;(async () => {
  if (!label) { console.log('usage: node hitch.js <label> [options], see the top of this file'); process.exit(1) }
  const names = wanted === 'all' ? DEFAULT_SET : wanted.split(',')
  const rows = []
  if (attribution) {
    for (const [widget, selector] of Object.entries(WIDGETS)) {
      const ctx = await launch()
      for (const name of POPUP_SET) {
        hide = selector
        const run = await runScenario(ctx, name, SCENARIOS[name])
        run.scenario = `${name} [${widget}]`
        rows.push(run)
      }
      await ctx.close()
    }
  } else {
    const ctx = await launch()
    for (const name of names) {
      if (!SCENARIOS[name]) { console.log('unknown scenario', name); continue }
      console.log('running', name)
      rows.push(await runScenario(ctx, name, SCENARIOS[name]))
    }
    await ctx.close()
  }
  fs.writeFileSync(path.join(OUT, `hitch-${label}.json`), JSON.stringify(rows, null, 1))
  printTable(rows)
})().catch((error) => { console.error('FAILED', error); process.exit(1) })

