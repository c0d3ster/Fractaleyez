// Usage: node mobile-check.js [--scenarios=steer,speed|all] [--out=<dir>] [url]
// Runs named touch scenarios against the app in iPhone emulation (Playwright's iPhone profile: isMobile and hasTouch, so the
// mobile shell's `(pointer: coarse)` matches), through CDP touch events (Input.dispatchTouchEvent, two touch points for the
// two-finger gestures). After each step it saves a screenshot and the settings the gestures drive, and checks that the step
// moved only what it should. Every mobile issue adds its own scenarios here. Software GL is fine.
const path = require('path')
const fs = require('fs')
const { chromium, devices } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const EXTRA_ARGS = (process.env.BENCH_CHROME_ARGS || '').split(' ').filter(Boolean)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const url = args.find((a) => !a.startsWith('--')) || process.env.BENCH_URL || 'http://localhost:3000'
const outDir = flag('out') || path.join(process.env.BENCH_DIR || path.join(__dirname, 'out'), 'mobile')
const DEVICE = devices['iPhone 13']

// Runs in the page: what the gestures drive.
const READ = `(() => ({
  speed: window.config.user.speed.value,
  scaleFactor: window.config.user.scaleFactor.value,
  rotationSpeed: window.config.user.rotationSpeed.value,
  camera: window.getVirtualCameraPosition ? window.getVirtualCameraPosition() : null,
  gesture: window.getGesture ? window.getGesture() : null,
  shell: document.documentElement.classList.contains('mobile-shell'),
  menuOpens: window.__menuOpens ?? 0,
  controlsMode: window.getControlsMode ? window.getControlsMode() : null,
}))()`

// Counts the long-press's menu requests (there is no menu sheet yet to show them).
const countMenuOpens = (page) => page.evaluate(() => {
  window.__menuOpens = 0
  window.subscribeOpenMenu?.(() => { window.__menuOpens += 1 })
})

// Each touch event carries its own timestamp on a clock the scenario advances, so the page sees the intended timing (a 60ms tap,
// 120ms between double-tap taps) even when software GL keeps its main thread busy and the events arrive late. The clock starts
// in the past (see main) so it never runs ahead of real time.
let clockMs = 0
const touch = (cdp, type, points, afterMs = 0) => {
  clockMs += afterMs
  return cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })),
    timestamp: clockMs / 1000,
  })
}

const tap = async (cdp, x, y, holdMs = 60) => {
  await touch(cdp, 'touchStart', [[x, y]])
  await sleep(holdMs)
  await touch(cdp, 'touchEnd', [], holdMs)
}

// Moves 1 or 2 fingers from `from` to `to` (arrays of [x, y]) in `steps` moves.
const drag = async (cdp, from, to, steps = 16, stepMs = 16) => {
  await touch(cdp, 'touchStart', from)
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    await touch(cdp, 'touchMove', from.map(([x, y], k) => [x + (to[k][0] - x) * t, y + (to[k][1] - y) * t]), stepMs)
    await sleep(stepMs)
  }
  await touch(cdp, 'touchEnd', [], stepMs)
}

const twist = async (cdp, center, radius, fromRad, toRad, steps = 16) => {
  const at = (rad) => [[center[0] - radius * Math.cos(rad), center[1] - radius * Math.sin(rad)], [center[0] + radius * Math.cos(rad), center[1] + radius * Math.sin(rad)]]
  await touch(cdp, 'touchStart', at(fromRad))
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, 'touchMove', at(fromRad + (toRad - fromRad) * (i / steps)), 16)
    await sleep(16)
  }
  await touch(cdp, 'touchEnd', [], 16)
}

const W = DEVICE.viewport.width
const H = DEVICE.viewport.height
const C = [W / 2, H / 2]

// Each scenario: what it does, and which of the read values it may change (the rest must stay put). `init(ctx)` runs before the
// page loads (an init script), `prepare(page)` after, and `run(cdp, page)` does the touches.
const SCENARIOS = {
  steer: {
    changes: ['camera'],
    run: async (cdp) => { await tap(cdp, W * 0.2, H * 0.25) },
  },
  'steer-drag': {
    changes: ['camera'],
    run: async (cdp) => { await drag(cdp, [[W * 0.5, H * 0.5]], [[W * 0.85, H * 0.8]]) },
  },
  'long-press': {
    // A press held past a tap's length never steers, and opens the menu once.
    changes: [],
    prepare: countMenuOpens,
    run: async (cdp) => { await tap(cdp, W * 0.8, H * 0.2, 700) },
    expect: (before, after) => after.menuOpens === 1,
  },
  'long-press-ring': {
    // Screenshot mid-hold shows the ring partly filled around the finger (compare docs/mobile-design/NoneSwipe.html).
    changes: [],
    prepare: countMenuOpens,
    run: async (cdp, page) => {
      await touch(cdp, 'touchStart', [C])
      // Under software GL a capture takes longer than the hold, so the ring's animations are frozen half-filled and the frame is
      // captured straight through CDP, before the menu opens and the ring goes.
      await page.evaluate(() => document.getAnimations().forEach((a) => { if (a.animationName?.startsWith('long-press-ring')) { a.pause(); a.currentTime = 350 } }))
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(path.join(outDir, 'long-press-ring-mid.png'), Buffer.from(data, 'base64'))
      await sleep(600)
      await touch(cdp, 'touchEnd', [], 750)
    },
    expect: (before, after) => after.menuOpens === 1,
  },
  'long-press-moved': {
    // A hold that drags past the slop steers instead and never opens the menu.
    changes: ['camera'],
    prepare: countMenuOpens,
    // The first move is sent right behind the press (not awaited in between): software GL takes ~0.5s per event here, so an
    // awaited first move would land after the hold time even though the scenario's own clock says 20ms.
    run: async (cdp) => {
      const from = [W * 0.3, H * 0.3]
      const to = [W * 0.7, H * 0.6]
      await Promise.all([touch(cdp, 'touchStart', [from]), touch(cdp, 'touchMove', [[from[0] + 30, from[1] + 30]], 20)])
      for (let i = 1; i <= 8; i++) await touch(cdp, 'touchMove', [[from[0] + (to[0] - from[0]) * i / 8, from[1] + (to[1] - from[1]) * i / 8]], 20)
      await touch(cdp, 'touchEnd', [], 20)
    },
    expect: (before, after) => after.menuOpens === 0,
  },
  'long-press-two-finger': {
    // A second finger cancels the long-press: a slow two-finger hold opens nothing and changes nothing.
    changes: [],
    prepare: countMenuOpens,
    run: async (cdp) => {
      await touch(cdp, 'touchStart', [[C[0] - 60, C[1]]])
      await touch(cdp, 'touchStart', [[C[0] - 60, C[1]], [C[0] + 60, C[1]]], 40)
      await sleep(700)
      await touch(cdp, 'touchEnd', [], 700)
    },
    expect: (before, after) => after.menuOpens === 0,
  },
  'tap-no-menu': {
    changes: ['camera'],
    prepare: countMenuOpens,
    run: async (cdp) => { await tap(cdp, W * 0.2, H * 0.25) },
    expect: (before, after) => after.menuOpens === 0,
  },
  ...Object.fromEntries(['limited', 'none'].map((mode) => [`long-press-${mode}`, {
    // The mode comes from this browser's stored mode before sign-in resolves; the long-press works the same in it.
    changes: [],
    init: (ctx) => ctx.addInitScript((m) => localStorage.setItem('onScreenControls', m), mode),
    prepare: countMenuOpens,
    run: async (cdp) => { await tap(cdp, W * 0.5, H * 0.4, 700) },
    expect: (before, after) => before.controlsMode === mode && after.menuOpens === 1,
  }])),
  speed: {
    changes: ['speed'],
    run: async (cdp) => { await drag(cdp, [[C[0] - 60, H * 0.7], [C[0] + 60, H * 0.7]], [[C[0] - 60, H * 0.35], [C[0] + 60, H * 0.35]]) },
  },
  scale: {
    changes: ['scaleFactor'],
    run: async (cdp) => { await drag(cdp, [[C[0] - 40, C[1]], [C[0] + 40, C[1]]], [[C[0] - 140, C[1]], [C[0] + 140, C[1]]]) },
  },
  rotation: {
    changes: ['rotationSpeed'],
    run: async (cdp) => { await twist(cdp, C, 90, 0, 0.9) },
  },
  'double-tap': {
    // Speed and rotation go back to the preset (set off it first); scale and steering stay.
    changes: ['speed', 'rotationSpeed'],
    prepare: async (page) => { await page.evaluate(() => { window.updateConfigItem('user', 'speed', 9); window.updateConfigItem('user', 'rotationSpeed', -6) }) },
    run: async (cdp) => { await tap(cdp, C[0], C[1]); clockMs += 120; await tap(cdp, C[0], C[1]) },
    expect: (before, after) => after.speed !== 9 && after.rotationSpeed !== -6,
  },
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const close = (a, b) => a && b && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1

const main = async () => {
  const wanted = flag('scenarios')
  const names = !wanted || wanted === 'all' ? Object.keys(SCENARIOS) : wanted.split(',')
  fs.mkdirSync(outDir, { recursive: true })
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: [...EXTRA_ARGS, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  })
  const results = []
  for (const name of names) {
    const scenario = SCENARIOS[name]
    if (!scenario) { console.log('unknown scenario', name); continue }
    // A fresh page per scenario, so one scenario's leftovers (a pending double-tap, a moved camera) never leak into the next.
    const ctx = await browser.newContext({ ...DEVICE, permissions: ['microphone'] })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)))
    // The dev server's error overlay (a Clerk key that cannot load, say) would cover the canvas and take the touches.
    if (scenario.init) await scenario.init(ctx)
    await ctx.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style')
        style.textContent = '#webpack-dev-server-client-overlay { display: none !important }'
        document.head.appendChild(style)
      })
    })
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForFunction(() => typeof window.getPerfData === 'function' && typeof window.updateConfigItem === 'function', null, { timeout: 60000 })
    await page.evaluate(() => { window.setQuality?.('saver') })
    await sleep(2500)
    const cdp = await ctx.newCDPSession(page)
    if (scenario.prepare) { await scenario.prepare(page); await sleep(300) }
    const before = await page.evaluate(READ)
    await page.screenshot({ path: path.join(outDir, `${name}-0-before.png`) })
    clockMs = Date.now() - 2000
    await scenario.run(cdp, page)
    // The camera eases toward its target; give it time to travel before the screenshot.
    await sleep(1500)
    const after = await page.evaluate(READ)
    await page.screenshot({ path: path.join(outDir, `${name}-1-after.png`) })

    const changed = ['speed', 'scaleFactor', 'rotationSpeed', 'camera'].filter((key) => (key === 'camera' ? !close(before.camera, after.camera) : !same(before[key], after[key])))
    const unexpected = changed.filter((key) => !scenario.changes.includes(key))
    const missing = scenario.changes.filter((key) => !changed.includes(key))
    const ok = before.shell && unexpected.length === 0 && missing.length === 0 && (!scenario.expect || scenario.expect(before, after))
    results.push({ name, ok, changed, unexpected, missing, before, after })
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: changed [${changed.join(', ')}]${before.shell ? '' : ' (mobile shell not active)'}`)
    await ctx.close()
  }
  await browser.close()
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 1))
  console.log('screenshots and results.json in', outDir)
  if (results.some((r) => !r.ok)) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exit(1) })
