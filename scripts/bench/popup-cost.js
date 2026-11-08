// Usage: node popup-cost.js [url=http://localhost:3000] [hide css selectors] [label]
// What the expanded config window costs the main thread on its own: every visualizer layer and effect is switched off, so what is left is React, style, layout and the
// HUD ticks. Opens the window, measures 8 s idle, then five slider drags of 50 pointer moves, with Chrome's Performance metrics (task, script, layout and style time and
// counts). Point it at a production build (ab.sh builds one) for numbers that match what users run; the dev build is slower per render but ranks things the same.
// Reads: dragPer250Moves.taskMs / 255 is the main-thread cost of one slider move, scriptMs is the React part; layouts is how often the page laid out (it should
// not, for a hidden sidebar). nodes.sidebar is how many DOM nodes the sidebar holds while the pop-out is open.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const url = process.argv[2] || process.env.BENCH_URL || 'http://localhost:3000'
const hide = process.argv[3] || ''
const label = process.argv[4] || 'run'
const METRICS = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount']
const snap = async (client) => { const { metrics } = await client.send('Performance.getMetrics'); const m = {}; metrics.forEach(({ name, value }) => { m[name] = value }); return m }
const diff = (a, b) => Object.fromEntries(METRICS.map((k) => [k, b[k] - a[k]]))
const r = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d

;(async () => {
  const browser = await chromium.launch({ args: [...(process.env.BENCH_CHROME_ARGS || '--use-angle=swiftshader --enable-unsafe-swiftshader').split(' ').filter(Boolean), '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required'] })
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  await ctx.addInitScript(() => { Object.defineProperty(Screen.prototype, 'isExtended', { get: () => false }) })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 120)))
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => typeof window.getPerfData === 'function', null, { timeout: 60000 })
  await sleep(3000)
  await page.evaluate(() => {
    ;['video', 'fractal', 'orbit', 'logo'].forEach((k) => window.setLayerEnabled(k, false))
    ;['glow', 'kaleidoscope', 'shockwave'].forEach((k) => window.updateConfigItem('effects', k, false))
    window.setQuality('saver')
  })
  const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 15000 }), page.keyboard.press('e')])
  await pop.waitForLoadState('load')
  await sleep(3000)
  if (hide) await pop.addStyleTag({ content: `${hide} { display: none !important }` })
  const main = await ctx.newCDPSession(page); await main.send('Performance.enable')
  const nodes = await page.evaluate(() => ({ page: document.querySelectorAll('*').length, sidebar: document.querySelectorAll('.sidebar-container *').length }))
  const popNodes = await pop.evaluate(() => document.querySelectorAll('*').length)

  // Idle for 8 s.
  const i0 = await snap(main); await sleep(8000); const i1 = await snap(main)
  const idle = diff(i0, i1)

  // Five drags of the Speed slider in the pop-out, 50 pointer moves each (about a second).
  const drag = async (name) => {
    const slider = pop.locator(`input[type=range][name="${name}"]`).first()
    await slider.scrollIntoViewIfNeeded()
    const box = await slider.boundingBox()
    const y = box.y + box.height / 2
    await pop.mouse.move(box.x + 8, y); await pop.mouse.down()
    for (let i = 0; i <= 50; i++) { await pop.mouse.move(box.x + 8 + (box.width - 16) * (i / 50), y); await sleep(20) }
    await pop.mouse.up()
  }
  await pop.evaluate(() => { window.__mut = 0; new MutationObserver((l) => { window.__mut += l.length }).observe(document.body, { subtree: true, attributes: true, childList: true, characterData: true }) })
  const d0 = await snap(main)
  for (let i = 0; i < 5; i++) await drag('speed')
  const d1 = await snap(main)
  const mutations = await pop.evaluate(() => window.__mut)
  const dragged = diff(d0, d1)
  console.log(JSON.stringify({
    label, hide: hide || null, nodes: { pageTotal: nodes.page, sidebar: nodes.sidebar, popup: popNodes },
    idlePerSec: { taskMs: r(idle.TaskDuration * 1000 / 8), scriptMs: r(idle.ScriptDuration * 1000 / 8), layoutMs: r(idle.LayoutDuration * 1000 / 8, 1), styleMs: r(idle.RecalcStyleDuration * 1000 / 8, 1), layouts: r(idle.LayoutCount / 8, 1), styles: r(idle.RecalcStyleCount / 8, 1) },
    dragPer250Moves: { taskMs: r(dragged.TaskDuration * 1000), scriptMs: r(dragged.ScriptDuration * 1000), layoutMs: r(dragged.LayoutDuration * 1000, 1), styleMs: r(dragged.RecalcStyleDuration * 1000, 1), layouts: dragged.LayoutCount, styles: dragged.RecalcStyleCount, popupDomMutations: mutations },
  }))
  await browser.close()
})().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
