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
  readout: (() => {
    const el = document.querySelector('[data-gesture-readout]')
    return el ? { style: el.dataset.gestureReadout, kind: el.dataset.kind, visible: el.dataset.visible === 'on', text: el.textContent } : null
  })(),
  info: (() => {
    const el = document.querySelector('[data-gesture-info="on"]')
    return el ? el.textContent : null
  })(),
  menuPage: window.__menuPage ?? null,
  accountOpens: window.__accountOpens ?? 0,
  ui: (() => {
    const bar = document.querySelector('[data-mobile-bar]')
    const badge = document.querySelector('[data-mobile-badge]')
    const pressed = (selector, attr) => Object.fromEntries([...document.querySelectorAll(selector)].map((el) => [el.dataset[attr], el.getAttribute('aria-pressed') === 'true']))
    return {
      sidebar: !!document.querySelector('.sidebar-container'),
      topbar: !!document.querySelector('.topbar-container'),
      bar: bar ? bar.dataset.mobileBar : null,
      badge: badge ? badge.dataset.mobileBadge : null,
      signedIn: badge ? badge.dataset.signedIn : null,
      layerButtons: pressed('[data-layer]', 'layer'),
      effectButtons: pressed('[data-effect]', 'effect'),
      layers: Object.fromEntries(Object.entries(window.config.layers.meta).map(([key, meta]) => [key, meta.enabled.value])),
      effects: Object.fromEntries(['cyclone', 'wobWob', 'switcheroo', 'colorShift', 'glow', 'shockwave', 'kaleidoscope'].map((key) => [key, window.config.effects[key].value])),
      shaking: [...document.querySelectorAll('.mobile-bar__button--shake')].map((el) => el.dataset.layer),
    }
  })(),
  sheet: (() => {
    const el = document.querySelector('[data-bottom-sheet]')
    if (!el) return null
    const row = el.querySelector('.sheet-pills')
    const pill = el.querySelector('.sheet-pill[aria-selected="true"]')
    const box = (node) => node.getBoundingClientRect()
    return {
      state: el.dataset.bottomSheet,
      page: el.querySelector('[data-menu-page]')?.dataset.menuPage ?? null,
      tab: pill ? pill.dataset.menuTab : null,
      pillInView: row && pill ? box(pill).left >= box(row).left - 1 && box(pill).right <= window.innerWidth + 1 : null,
      height: Math.round(box(el).height),
      bottom: Math.round(box(el).bottom),
      rows: [...el.querySelectorAll('[data-menu-layer]')].map((node) => node.dataset.menuLayer),
      back: !!el.querySelector('.sheet-back'),
    }
  })(),
}))()`

// Counts the menu requests (the long-press, the bar's buttons) and the account requests.
const countMenuOpens = (page) => page.evaluate(() => {
  window.__menuOpens = 0
  window.subscribeOpenMenu?.((menuPage) => { window.__menuOpens += 1; window.__menuPage = menuPage ?? null })
  window.__accountOpens = 0
  window.subscribeOpenAccount?.(() => { window.__accountOpens += 1 })
})

// A pointerdown on the document (not the canvas, so nothing steers) brings the bar and badge back from their idle fade.
const wake = (page) => page.evaluate(() => document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))

// The center of the first element matching `selector`, for a touch on it.
const centerOf = (page, selector) => page.evaluate((sel) => {
  // The before screenshot can take longer than the idle fade under software GL, and a faded button takes no touches.
  document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  const box = document.querySelector(sel).getBoundingClientRect()
  return [box.left + box.width / 2, box.top + box.height / 2]
}, selector)

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

// Puts 1 or 2 fingers down and moves them from `from` to `to`, then leaves them on the glass (lift with `lift`).
const press = async (cdp, from, to, steps = 12, stepMs = 16) => {
  await touch(cdp, 'touchStart', from)
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    await touch(cdp, 'touchMove', from.map(([x, y], k) => [x + (to[k][0] - x) * t, y + (to[k][1] - y) * t]), stepMs)
    await sleep(stepMs)
  }
}
const lift = (cdp) => touch(cdp, 'touchEnd', [], 16)

// Reads the page and saves a screenshot while the gesture is still on (straight through CDP: a Playwright capture waits for a
// quiet frame, which software GL may not give before the readout fades).
const snap = async (cdp, page, name) => {
  await sleep(250)
  const mid = await page.evaluate(READ)
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(path.join(outDir, `${name}-mid.png`), Buffer.from(data, 'base64'))
  return mid
}

const storedMode = (mode) => (ctx) => ctx.addInitScript((m) => localStorage.setItem('onScreenControls', m), mode)

const W = DEVICE.viewport.width
const H = DEVICE.viewport.height
const C = [W / 2, H / 2]

// Each scenario: what it does, and which of the read values it may change (the rest must stay put). `init(ctx)` runs before the
// page loads (an init script), `prepare(page)` after, and `run(cdp, page)` does the touches; whatever it returns is passed to
// `expect(before, after, mid)` as `mid` (the readout scenarios read the page while the fingers are still down).
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
  // Gesture readouts (`#362`): `run` returns the reading taken mid-gesture, and `expect` gets it as `mid`. Compare the `-mid.png`
  // screenshots with docs/mobile-design (Speed, Pinch, Spin, Steer, Reset for Full; LimitedSpeed, LimitedSpin for Limited).
  ...readoutScenarios(),
  // The shell's bar and badge (`#363`). Compare the screenshots with docs/mobile-design/TopC.html (at rest), EffectIcons.html (the
  // icons on and off) and TopCGesture.html (bar away, badge dimmed, mid-gesture).
  ...shellScenarios(),
  // The menu sheet (`#364`). Compare the screenshots with docs/mobile-design/MenuHalf.html (Layers tab) and MenuLimited.html
  // (opened in Limited, badge back). The Presets and Audio tabs have no design.
  ...sheetScenarios(),
}

// Opens the sheet with the bar's menu button and waits for it to slide in.
const openSheet = async (cdp, page) => {
  const [x, y] = await centerOf(page, '[aria-label="Open menu"]')
  await tap(cdp, x, y)
  await sleep(500)
}

// A tap on the visible part of an element (a pill can run off either edge of its row).
const tapVisible = async (cdp, page, selector) => {
  const [x, y] = await page.evaluate((sel) => {
    const box = document.querySelector(sel).getBoundingClientRect()
    const left = Math.max(box.left, 2)
    const right = Math.min(box.right, window.innerWidth - 2)
    return [(left + right) / 2, box.top + box.height / 2]
  }, selector)
  await tap(cdp, x, y)
  await sleep(500)
}

function sheetScenarios() {
  const scenarios = {}
  const sheetHeight = () => Math.round(Math.min(374, H * 0.6))
  const isLayersTab = (sheet) => sheet?.state === 'open' && sheet.page === 'layers' && sheet.tab === 'layers' && sheet.rows.join() === 'fractal,orbit,logo,video'
  // The menu button opens the sheet on Layers, at the fixed height, on the screen's bottom edge; the gestures pause meanwhile.
  scenarios['sheet-open-button'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => { await openSheet(cdp, page); return snap(cdp, page, 'sheet-open-button') },
    expect: (before, after, mid) => before.sheet === null && isLayersTab(mid.sheet) && mid.sheet.height === sheetHeight()
      && mid.sheet.bottom === H && mid.sheet.pillInView && after.sheet?.state === 'open',
  }
  // The long-press on the visual opens it on Layers too.
  scenarios['sheet-open-long-press'] = {
    changes: [],
    run: async (cdp, page) => { await tap(cdp, W * 0.5, H * 0.2, 700); await sleep(500); return snap(cdp, page, 'sheet-open-long-press') },
    expect: (before, after, mid) => isLayersTab(mid.sheet),
  }
  // A layer button's long-press lands on that layer's page; the back button returns to the Layers tab.
  scenarios['sheet-open-layer-page'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      const [x, y] = await centerOf(page, '[data-layer="orbit"]')
      await tap(cdp, x, y, 700)
      await sleep(500)
      const onPage = await snap(cdp, page, 'sheet-open-layer-page')
      await tapVisible(cdp, page, '.sheet-back')
      return { onPage, back: await page.evaluate(READ) }
    },
    expect: (before, after, mid) => mid.onPage.sheet?.page === 'orbit' && mid.onPage.sheet.back && mid.onPage.sheet.tab === null
      && mid.onPage.ui.layers.orbit === before.ui.layers.orbit && isLayersTab(mid.back.sheet),
  }
  // Each pill switches the tab and ends fully in view, the last one too (it starts cut off by the screen's edge).
  scenarios['sheet-tabs'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openSheet(cdp, page)
      const seen = []
      for (const tab of ['presets', 'color', 'effects', 'audio', 'camera', 'layers']) {
        await tapVisible(cdp, page, `[data-menu-tab="${tab}"]`)
        const read = tab === 'presets' || tab === 'audio' || tab === 'camera' ? await snap(cdp, page, `sheet-tab-${tab}`) : await page.evaluate(READ)
        seen.push({ tab, sheet: read.sheet })
      }
      return seen
    },
    expect: (before, after, mid) => mid.every(({ tab, sheet }) => sheet?.tab === tab && sheet.page === tab && sheet.pillInView && sheet.height === sheetHeight()),
  }
  // The power button in a row toggles its layer, like the bar's button.
  scenarios['sheet-layer-toggle'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openSheet(cdp, page)
      await tapVisible(cdp, page, '[data-menu-layer="logo"] .layer-header__power')
      return snap(cdp, page, 'sheet-layer-toggle')
    },
    expect: (before, after, mid) => mid.ui.layers.logo === !before.ui.layers.logo
      && Object.keys(before.ui.layers).every((key) => key === 'logo' || mid.ui.layers[key] === before.ui.layers[key]) && mid.sheet?.state === 'open',
  }
  // The row's arrow opens the layer's page.
  scenarios['sheet-layer-arrow'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openSheet(cdp, page)
      await tapVisible(cdp, page, '[data-menu-layer="fractal"] .menu-layer-row__open')
      return snap(cdp, page, 'sheet-layer-arrow')
    },
    expect: (before, after, mid) => mid.sheet?.page === 'fractal' && mid.sheet.back && mid.ui.layers.fractal === before.ui.layers.fractal,
  }
  // A drag down on the sheet's top past 80px closes it; a shorter one lets it spring back.
  for (const [name, distance, closes] of [['sheet-drag-close', 150, true], ['sheet-drag-short', 40, false]]) {
    scenarios[name] = {
      changes: [],
      prepare: wake,
      run: async (cdp, page) => {
        await openSheet(cdp, page)
        const [x, y] = await page.evaluate(() => {
          const box = document.querySelector('.bottom-sheet__handle').getBoundingClientRect()
          return [box.left + box.width / 2, box.top + box.height / 2]
        })
        await drag(cdp, [[x, y]], [[x, y + distance]])
        await sleep(500)
        return page.evaluate(READ)
      },
      // Under software GL the slide-away timer can still be running at the mid read.
      expect: (before, after, mid) => (closes ? (mid.sheet === null || mid.sheet.state === 'closing') && after.sheet === null : mid.sheet?.state === 'open' && mid.sheet.bottom === H),
    }
  }
  // A tap on the visual closes the sheet without steering (the camera stays put).
  scenarios['sheet-tap-visual'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openSheet(cdp, page)
      await tap(cdp, W * 0.2, H * 0.15)
      await sleep(500)
      return page.evaluate(READ)
    },
    expect: (before, after, mid) => (mid.sheet === null || mid.sheet.state === 'closing') && after.sheet === null,
  }
  // While the sheet is open the gestures are paused: two fingers on the visual change no speed.
  scenarios['sheet-gestures-paused'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openSheet(cdp, page)
      await drag(cdp, [[C[0] - 60, H * 0.4], [C[0] + 60, H * 0.4]], [[C[0] - 60, H * 0.1], [C[0] + 60, H * 0.1]])
    },
    expect: (before, after) => after.speed === before.speed,
  }
  // In Limited and None there is no bar, so the long-press opens the sheet; the badge comes back while it is open.
  for (const mode of ['limited', 'none']) {
    scenarios[`sheet-${mode}`] = {
      changes: [],
      init: storedMode(mode),
      run: async (cdp, page) => {
        await tap(cdp, W * 0.5, H * 0.2, 700)
        await sleep(500)
        const open = await snap(cdp, page, `sheet-${mode}`)
        await tap(cdp, W * 0.2, H * 0.15)
        await sleep(600)
        return { open, closed: await page.evaluate(READ) }
      },
      expect: (before, after, mid) => before.ui.badge === null && isLayersTab(mid.open.sheet) && mid.open.ui.badge === 'shown'
        && mid.open.ui.bar === null && mid.closed.sheet === null && mid.closed.ui.badge === null,
    }
  }
  return scenarios
}

function shellScenarios() {
  const scenarios = {}
  // The bar and badge replace the sidebar and top bar; signed out the badge is the person outline.
  scenarios['shell-resting'] = {
    changes: [],
    run: async (cdp, page) => { await wake(page); return snap(cdp, page, 'shell-resting') },
    expect: (before, after, mid) => !mid.ui.sidebar && !mid.ui.topbar && mid.ui.bar === 'shown' && mid.ui.badge === 'shown'
      && Object.keys(mid.ui.layerButtons).join() === 'fractal,orbit,logo,video'
      && Object.keys(mid.ui.effectButtons).join() === 'cyclone,wobWob,switcheroo,colorShift,glow,shockwave,kaleidoscope'
      && Object.entries(mid.ui.layerButtons).every(([key, on]) => on === mid.ui.layers[key])
      && Object.entries(mid.ui.effectButtons).every(([key, on]) => on === mid.ui.effects[key]),
  }
  // A tap on a layer button toggles the layer like its hotkey, and the button follows (blue on, grey off).
  for (const layer of ['fractal', 'orbit', 'logo', 'video']) {
    scenarios[`bar-layer-${layer}`] = {
      changes: [],
      prepare: async (page) => { await countMenuOpens(page); await wake(page) },
      run: async (cdp, page) => {
        const [x, y] = await centerOf(page, `[data-layer="${layer}"]`)
        await tap(cdp, x, y)
        return snap(cdp, page, `bar-layer-${layer}`)
      },
      expect: (before, after, mid) => mid.ui.layers[layer] === !before.ui.layers[layer] && mid.ui.layerButtons[layer] === mid.ui.layers[layer]
        && Object.keys(before.ui.layers).every((key) => key === layer || mid.ui.layers[key] === before.ui.layers[key]) && after.menuOpens === 0,
    }
  }
  // A tap on an effect button toggles that effect, and the button follows (green on).
  for (const effect of ['cyclone', 'wobWob', 'switcheroo', 'colorShift', 'glow', 'shockwave', 'kaleidoscope']) {
    scenarios[`bar-effect-${effect}`] = {
      changes: [],
      prepare: wake,
      run: async (cdp, page) => {
        const [x, y] = await centerOf(page, `[data-effect="${effect}"]`)
        await tap(cdp, x, y)
        return snap(cdp, page, `bar-effect-${effect}`)
      },
      expect: (before, after, mid) => mid.ui.effects[effect] === !before.ui.effects[effect] && mid.ui.effectButtons[effect] === mid.ui.effects[effect]
        && Object.keys(before.ui.effects).every((key) => key === effect || mid.ui.effects[key] === before.ui.effects[key]),
    }
  }
  // Beat-driven effects that are on flash with the beat, the ones off do not (the fake microphone's beeps set off beats); Cyclone never does.
  scenarios['bar-beat-pulse'] = {
    changes: [],
    prepare: async (page) => {
      await page.evaluate(() => {
        ;['cyclone', 'glow', 'wobWob', 'shockwave'].forEach((key) => window.updateConfigItem('effects', key, true))
        ;['colorShift', 'switcheroo'].forEach((key) => window.updateConfigItem('effects', key, false))
        window.__pulsed = new Set()
        window.subscribeBeat?.(() => requestAnimationFrame(() => document.querySelectorAll('[data-effect]').forEach((el) => {
          // Only the flash (a background-color transition is an animation too).
          if (el.getAnimations().some((a) => a.playState === 'running' && !(a instanceof CSSTransition))) window.__pulsed.add(el.dataset.effect)
        })))
      })
      await wake(page)
    },
    run: async (cdp, page) => {
      // Counted from here, after the toggles above have rendered.
      await page.evaluate(() => window.__pulsed.clear())
      // Keep the bar awake while the beats come in.
      for (let i = 0; i < 8; i++) { await wake(page); await sleep(1000) }
      return page.evaluate(() => [...(window.__pulsed ?? [])].sort())
    },
    expect: (before, after, mid) => ['glow', 'shockwave', 'wobWob'].every((key) => mid.includes(key)) && !['cyclone', 'colorShift', 'switcheroo', 'kaleidoscope'].some((key) => mid.includes(key)),
  }
  // 3s without a touch fades the bar and badge; a tap anywhere brings them back.
  scenarios['bar-idle-fade'] = {
    changes: ['camera'],
    prepare: wake,
    run: async (cdp, page) => {
      await sleep(3600)
      const faded = await snap(cdp, page, 'bar-idle-fade')
      await tap(cdp, W * 0.2, H * 0.25)
      await sleep(400)
      return { faded, back: await page.evaluate(READ) }
    },
    expect: (before, after, mid) => before.ui.bar === 'shown' && mid.faded.ui.bar === 'faded' && mid.faded.ui.badge === 'faded'
      && mid.back.ui.bar === 'shown' && mid.back.ui.badge === 'shown',
  }
  // During a gesture the bar slides away and the badge dims; Full's info line then holds the bar's place.
  scenarios['bar-gesture-away'] = {
    changes: ['speed'],
    prepare: wake,
    run: async (cdp, page) => {
      await press(cdp, [[C[0] - 60, H * 0.6], [C[0] + 60, H * 0.6]], [[C[0] - 60, H * 0.3], [C[0] + 60, H * 0.3]])
      const mid = await snap(cdp, page, 'bar-gesture-away')
      await lift(cdp)
      return mid
    },
    expect: (before, after, mid) => before.ui.bar === 'shown' && mid.ui.bar === 'away' && mid.ui.badge === 'dim',
  }
  // A long-press on a layer button opens the menu on that layer's page and does not toggle the layer.
  scenarios['bar-layer-long-press'] = {
    changes: [],
    prepare: async (page) => { await countMenuOpens(page); await wake(page) },
    run: async (cdp, page) => {
      const [x, y] = await centerOf(page, '[data-layer="orbit"]')
      await tap(cdp, x, y, 700)
    },
    expect: (before, after) => after.menuOpens === 1 && after.menuPage === 'orbit' && after.ui.layers.orbit === before.ui.layers.orbit,
  }
  scenarios['bar-menu-button'] = {
    changes: [],
    prepare: async (page) => { await countMenuOpens(page); await wake(page) },
    run: async (cdp, page) => {
      const [x, y] = await centerOf(page, '[aria-label="Open menu"]')
      await tap(cdp, x, y)
    },
    expect: (before, after) => after.menuOpens === 1 && after.menuPage === null,
  }
  scenarios['badge-tap'] = {
    changes: [],
    prepare: async (page) => { await countMenuOpens(page); await wake(page) },
    run: async (cdp, page) => {
      const [x, y] = await centerOf(page, '[data-mobile-badge]')
      await tap(cdp, x, y)
    },
    expect: (before, after) => after.accountOpens === 1 && after.menuOpens === 0,
  }
  // Limited and None show no bar and no badge at rest.
  for (const mode of ['limited', 'none']) {
    scenarios[`shell-${mode}`] = {
      changes: [],
      init: storedMode(mode),
      prepare: wake,
      run: async (cdp, page) => snap(cdp, page, `shell-${mode}`),
      expect: (before, after, mid) => !mid.ui.sidebar && !mid.ui.topbar && mid.ui.bar === null && mid.ui.badge === null,
    }
  }
  return scenarios
}

function readoutScenarios() {
  const GESTURES = {
    speed: { changes: ['speed'], from: [[C[0] - 60, H * 0.7], [C[0] + 60, H * 0.7]], to: [[C[0] - 60, H * 0.35], [C[0] + 60, H * 0.35]], info: 'Speed: two fingers up or down. Up is faster.' },
    scale: { changes: ['scaleFactor'], from: [[C[0] - 40, C[1]], [C[0] + 40, C[1]]], to: [[C[0] - 140, C[1]], [C[0] + 140, C[1]]], info: 'Scale: pinch in or out.' },
    rotation: { changes: ['rotationSpeed'], twist: true, info: 'Rotation: twist two fingers.' },
    // Sway defaults to 0, which greys out the camera pad (as on desktop), so the steer scenarios give it room first.
    steer: { changes: ['camera'], prepare: (page) => page.evaluate(() => window.updateConfigItem('user', 'sway', 200)), from: [[W * 0.5, H * 0.5]], to: [[W * 0.85, H * 0.8]], info: 'Steer: drag one finger. Tap to point the camera there.' },
  }
  const twistAt = (rad) => [[C[0] - 90 * Math.cos(rad), C[1] - 90 * Math.sin(rad)], [C[0] + 90 * Math.cos(rad), C[1] + 90 * Math.sin(rad)]]
  const hold = async (cdp, page, name, g) => {
    if (g.twist) await press(cdp, twistAt(0), twistAt(0.9))
    else await press(cdp, g.from, g.to)
    const mid = await snap(cdp, page, name)
    await lift(cdp)
    return mid
  }
  // What each mode shows mid-gesture: Full the panel and the info line, Limited the chip (nothing for steering), None nothing.
  const expected = {
    full: (kind) => ({ style: 'full', kind, info: true }),
    limited: (kind) => (kind === 'steer' ? null : { style: 'chip', kind, info: false }),
    none: () => null,
  }
  const scenarios = {}
  for (const mode of ['full', 'limited', 'none']) {
    for (const [kind, g] of Object.entries(GESTURES)) {
      if (mode === 'none' && kind !== 'speed') continue
      const name = `readout-${kind}-${mode}`
      scenarios[name] = {
        changes: g.changes,
        init: storedMode(mode),
        prepare: g.prepare,
        run: (cdp, page) => hold(cdp, page, name, g),
        // After the fade the readout is gone (Full's info line may still be held, so only the panel and chip are checked).
        expect: (before, after, mid) => {
          const want = expected[mode](kind)
          if (!want) return !mid.readout && !mid.info && !after.readout
          return mid.readout?.style === want.style && mid.readout.kind === kind && mid.readout.visible
            && (want.info ? mid.info === g.info : !mid.info) && !after.readout?.visible
        },
      }
    }
  }
  scenarios['readout-reset-full'] = {
    changes: ['speed', 'rotationSpeed'],
    init: storedMode('full'),
    prepare: async (page) => { await page.evaluate(() => { window.updateConfigItem('user', 'speed', 9); window.updateConfigItem('user', 'rotationSpeed', -6) }) },
    run: async (cdp, page) => {
      await tap(cdp, C[0], C[1]); clockMs += 120; await tap(cdp, C[0], C[1])
      return snap(cdp, page, 'readout-reset-full')
    },
    expect: (before, after, mid) => mid.readout?.kind === 'reset' && mid.readout.visible && mid.info === 'Double-tap resets speed and rotation.',
  }
  scenarios['readout-replace'] = {
    // A new gesture while the last readout is fading replaces it at once.
    changes: ['speed', 'scaleFactor'],
    init: storedMode('limited'),
    run: async (cdp, page) => {
      await hold(cdp, page, 'readout-replace-first', GESTURES.speed)
      return hold(cdp, page, 'readout-replace', GESTURES.scale)
    },
    expect: (before, after, mid) => mid.readout?.kind === 'scale' && mid.readout.visible,
  }
  return scenarios
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
    const mid = await scenario.run(cdp, page)
    // The camera eases toward its target; give it time to travel before the screenshot.
    await sleep(1500)
    const after = await page.evaluate(READ)
    await page.screenshot({ path: path.join(outDir, `${name}-1-after.png`) })

    const changed = ['speed', 'scaleFactor', 'rotationSpeed', 'camera'].filter((key) => (key === 'camera' ? !close(before.camera, after.camera) : !same(before[key], after[key])))
    const unexpected = changed.filter((key) => !scenario.changes.includes(key))
    const missing = scenario.changes.filter((key) => !changed.includes(key))
    const ok = before.shell && unexpected.length === 0 && missing.length === 0 && (!scenario.expect || scenario.expect(before, after, mid))
    results.push({ name, ok, changed, unexpected, missing, before, after, mid })
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: changed [${changed.join(', ')}]${before.shell ? '' : ' (mobile shell not active)'}`)
    await ctx.close()
  }
  await browser.close()
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 1))
  console.log('screenshots and results.json in', outDir)
  if (results.some((r) => !r.ok)) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exit(1) })
