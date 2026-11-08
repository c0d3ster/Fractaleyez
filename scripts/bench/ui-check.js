// Usage: node ui-check.js capture <dir> [url]      node ui-check.js compare <dirA> <dirB>
// A safety net for changes to how the config UI renders. `capture` runs one scripted session against the app (real slider drags, a double-click
// reset, checkbox clicks, layer hotkeys, a preset load, the sidebar) and after each step saves the state of every control in the config window
// and the sidebar (slider values and their readouts, checkboxes, text) together with the config itself. Capture before a change and after it, then
// `compare`: a refactor that only changes how often things render must leave every snapshot identical.
// Excludes what is live by nature (the Performance, Beat, Section and Frequency panels, canvases). Software GL is fine.
const path = require('path')
const fs = require('fs')
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const EXTRA_ARGS = (process.env.BENCH_CHROME_ARGS || '--use-angle=swiftshader --enable-unsafe-swiftshader').split(' ').filter(Boolean)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const [mode, dirA, dirB] = process.argv.slice(2)
const url = process.argv[4] && !process.argv[4].startsWith('--') ? process.argv[4] : (process.env.BENCH_URL || 'http://localhost:3000')

// Runs in a page: what the controls show.
const SNAPSHOT = `(() => {
  const skip = '.perf-hud-wrapper, .beat-hud-wrapper, .section-hud-wrapper, .frequency-hud-wrapper, canvas, .kaleidoscope-dial, .info-strip'
  const root = document.querySelector('.config-window-grid') || document.querySelector('.sidebar-container')
  if (!root) return null
  const controls = [...root.querySelectorAll('input, select, .effect-chips button')].filter((el) => !el.closest(skip)).map((el, i) => [el.name || el.id || el.textContent.trim() || String(i), el.type, el.type === 'checkbox' || el.type === 'radio' ? el.checked : (el.value !== undefined && el.value !== '' ? el.value : el.getAttribute('aria-pressed') + '|' + el.className)])
  const text = [...root.querySelectorAll('h2, h3, h4, label, button, .slider-value, .slider-zone-tag, .layer-header')].filter((el) => !el.closest(skip)).map((el) => el.textContent.replace(/\\s+/g, ' ').trim()).filter(Boolean)
  const fills = [...root.querySelectorAll('[class*="layer-header"] [style*="scaleX"]')].map((el) => el.style.transform)
  const classes = [...root.querySelectorAll('.category-container')].map((el) => el.className.replace(/\\s+/g, ' '))
  return { controls, text, fills, classes }
})()`
const CONFIG = `(() => {
  const strip = (section) => Object.fromEntries(Object.entries(section).map(([k, v]) => [k, v && typeof v === 'object' && 'value' in v ? v.value : v]))
  const c = window.config
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, k === 'layers' ? { order: v.order, meta: Object.fromEntries(Object.entries(v.meta).map(([lk, lv]) => [lk, { enabled: lv.enabled.value, opacity: lv.opacity.value }])) } : strip(v)]))
})()`

const drag = async (pop, name, from, to) => {
  const slider = pop.locator(`input[type=range][name="${name}"]`).first()
  await slider.scrollIntoViewIfNeeded()
  const box = await slider.boundingBox()
  const y = box.y + box.height / 2
  const x = (f) => box.x + 8 + (box.width - 16) * f
  await pop.mouse.move(x(from), y); await pop.mouse.down()
  for (let i = 0; i <= 20; i++) { await pop.mouse.move(x(from + (to - from) * (i / 20)), y); await sleep(15) }
  await pop.mouse.up()
}

const capture = async (dir) => {
  fs.mkdirSync(dir, { recursive: true })
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: [...EXTRA_ARGS, '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] })
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } })
  await ctx.addInitScript(() => { Object.defineProperty(Screen.prototype, 'isExtended', { get: () => false }) })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)))
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => typeof window.getPerfData === 'function', null, { timeout: 60000 })
  await sleep(3000)
  // The visualizer is not what is under test: keep it cheap and still.
  await page.evaluate(() => { window.setQuality('saver') })

  const steps = []
  let pop = null
  const snap = async (name) => {
    await sleep(1200)
    const ui = await (pop || page).evaluate(SNAPSHOT)
    const config = await page.evaluate(CONFIG)
    const sidebar = pop ? await page.evaluate(SNAPSHOT) : null
    steps.push(name)
    fs.writeFileSync(path.join(dir, `${String(steps.length).padStart(2, '0')}-${name}.json`), JSON.stringify({ ui, sidebar, config }, null, 1))
    console.log('captured', name, ui ? `${ui.controls.length} controls` : 'no ui')
  }

  ;[pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 20000 }), page.keyboard.press('e')])
  await pop.waitForLoadState('load'); await sleep(3500)
  await snap('popup-open')
  await drag(pop, 'speed', 0.1, 0.7); await snap('drag-speed')
  await drag(pop, 'a', 0.2, 0.6); await snap('drag-orbit-a')
  await drag(pop, 'saturation', 0.9, 0.3); await snap('drag-saturation')
  await pop.locator('.effect-chips button', { hasText: /cyclone/i }).first().click(); await snap('click-cyclone')
  await pop.locator('.effect-chips button', { hasText: /glow/i }).first().click(); await snap('click-glow')
  await pop.locator('input[type=range][name="speed"]').first().dblclick(); await snap('dblclick-reset-speed')
  await page.bringToFront(); await page.keyboard.press('o'); await snap('hotkey-orbit-off')
  await page.keyboard.press('o'); await snap('hotkey-orbit-on')
  await page.evaluate(() => window.setLayerEnabled('logo', false)); await snap('logo-off')
  await page.evaluate(() => window.updateConfigItem('effects', 'shockwave', false)); await snap('shockwave-off')
  await page.keyboard.press('s'); await snap('hotkey-shockwave-on')
  await drag(pop, 'particlesPerLayer', 0.1, 0.4); await snap('drag-particles')
  // Whole-section restores, which replace sections of the config the way a preset load does (there is no API here to list presets).
  await pop.locator('[aria-label="Reset user config"]').first().click(); await snap('reset-user-section')
  await pop.locator('[aria-label="Reset orbit config"]').first().click(); await snap('reset-orbit-section')
  await drag(pop, 'rotationSpeed', 0.5, 0.9); await snap('drag-rotation')

  // The sidebar: close the config window, open the sidebar and look at it the same way.
  await pop.close({ runBeforeUnload: true }); await sleep(800)
  await page.bringToFront(); await page.keyboard.press('m'); await sleep(1000)
  pop = null
  await snap('sidebar-open')
  await page.evaluate(() => window.updateConfigItem('user', 'speed', 4)); await snap('sidebar-after-change')
  await browser.close()
}

const compare = (a, b) => {
  const names = fs.readdirSync(a).filter((f) => f.endsWith('.json')).sort()
  let same = true
  for (const name of names) {
    const fileB = path.join(b, name)
    if (!fs.existsSync(fileB)) { console.log('MISSING', name); same = false; continue }
    const left = JSON.parse(fs.readFileSync(path.join(a, name), 'utf8'))
    const right = JSON.parse(fs.readFileSync(fileB, 'utf8'))
    const diffs = []
    const walk = (x, y, where) => {
      // Which clip the background video is on depends on real time, not on the UI.
      if (where === '.config.video.index') return
      if (JSON.stringify(x) === JSON.stringify(y)) return
      if (x && y && typeof x === 'object' && typeof y === 'object') { new Set([...Object.keys(x), ...Object.keys(y)]).forEach((k) => walk(x[k], y[k], `${where}.${k}`)); return }
      diffs.push(`${where}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`)
    }
    walk(left, right, '')
    console.log(diffs.length ? `DIFF ${name} (${diffs.length})` : `same ${name}`)
    diffs.slice(0, 6).forEach((d) => console.log('     ', d.slice(0, 200)))
    if (diffs.length) same = false
  }
  process.exit(same ? 0 : 2)
}

;(async () => {
  if (mode === 'capture' && dirA) await capture(dirA)
  else if (mode === 'compare' && dirA && dirB) compare(dirA, dirB)
  else console.log('usage: node ui-check.js capture <dir> [url] | compare <dirA> <dirB>')
})().catch((error) => { console.error('FAILED', error.message); process.exit(1) })
