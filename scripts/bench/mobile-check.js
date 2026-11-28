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
      // The layer page (#365): its sub-tabs, the one-slider section and what the controls show.
      layerPage: (() => {
        const pageEl = el.querySelector('[data-layer-page]')
        if (!pageEl) return null
        const body = el.querySelector('.bottom-sheet__body')
        const slider = pageEl.querySelector('.sheet-slider')
        const grid = pageEl.querySelector('.sprite-picker__grid')
        const pad = pageEl.querySelector('.pad')
        return {
          layer: pageEl.dataset.layerPage,
          subTab: pageEl.dataset.layerSubtabPage,
          segments: [...el.querySelectorAll('[data-layer-subtab]')].map((node) => node.dataset.layerSubtab),
          segment: el.querySelector('[data-layer-subtab][aria-selected="true"]')?.dataset.layerSubtab ?? null,
          title: el.querySelector('.sheet-page-title')?.textContent ?? null,
          headerRow: !!pageEl.querySelector('[data-menu-layer-page-row] .layer-header'),
          buttons: [...pageEl.querySelectorAll('[data-one-slider-item]')].map((node) => node.dataset.oneSliderItem),
          selected: pageEl.querySelector('[data-one-slider-item][aria-selected="true"]')?.dataset.oneSliderItem ?? null,
          buttonValue: pageEl.querySelector('[data-one-slider-item][aria-selected="true"] .one-slider__value')?.textContent ?? null,
          sliderName: slider?.querySelector('.slider-name')?.textContent.trim().replace(/:$/, '') ?? null,
          sliderValue: slider?.querySelector('.slider-value')?.textContent ?? null,
          sliderZoned: !!slider?.querySelector('.slider-input')?.style.background.includes('gradient'),
          dials: pageEl.querySelectorAll('.spin-dial, [class*="spin-dial"]').length,
          types: pageEl.querySelectorAll('.fractal-type').length,
          typeColumns: (() => { const row = pageEl.querySelector('.fractal-types__row'); return row ? getComputedStyle(row).gridTemplateColumns.split(' ').length : null })(),
          chips: pageEl.querySelectorAll('.shape-pad-chip').length,
          chipColumns: (() => { const chips = pageEl.querySelector('.shape-pad-compact .shape-pad-chips'); return chips ? getComputedStyle(chips).gridTemplateColumns.split(' ').length : null })(),
          padWidth: pad ? Math.round(pad.getBoundingClientRect().width) : null,
          spriteColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : null,
          spriteTile: grid?.querySelector('.sprite-picker__cell') ? Math.round(grid.querySelector('.sprite-picker__cell').getBoundingClientRect().width) : null,
          pills: [...pageEl.querySelectorAll('.config-checkbox-row input')].map((node) => node.name),
          camera: pageEl.querySelector('.video-camera')?.dataset.camera ?? null,
          cameraInfo: pageEl.querySelector('.video-camera__info')?.textContent ?? null,
          clips: pageEl.querySelectorAll('.video-clips .config-checkbox-container').length,
          scrolls: body ? body.scrollHeight > body.clientHeight + 1 : null,
        }
      })(),
      // The Effects, Color and Camera tabs (#366).
      menuTab: (() => {
        const box = (node) => node.getBoundingClientRect()
        const pressedOf = (node) => node.getAttribute('aria-pressed') === 'true'
        const slider = (root) => root.querySelector('.sheet-slider')
        const sliderName = (root) => slider(root)?.querySelector('.slider-name')?.textContent.trim().replace(/:$/, '') ?? null
        const fx = el.querySelector('.mobile-effects')
        const color = el.querySelector('.mobile-color')
        const cam = el.querySelector('.mobile-camera')
        const effects = fx && (() => {
          const buttons = [...fx.querySelectorAll('[data-menu-effect]')]
          const grid = fx.querySelector('.mobile-effects__grid')
          const auto = fx.querySelector('.auto-switch-button')
          return {
            dial: Math.round(box(fx.querySelector('.kaleidoscope-dial')).width),
            dialChips: fx.querySelectorAll('.effect-chip').length,
            count: fx.querySelector('[data-kaleidoscope-count]')?.textContent ?? null,
            modes: [...fx.querySelectorAll('[data-kaleidoscope-mode]')].map(pressedOf),
            modeHeight: Math.round(Math.min(...[...fx.querySelectorAll('[data-kaleidoscope-mode]')].map((node) => box(node).height))),
            buttons: buttons.map((node) => node.dataset.menuEffect),
            pressed: Object.fromEntries(buttons.map((node) => [node.dataset.menuEffect, pressedOf(node)])),
            looks: Object.fromEntries(buttons.map((node) => [node.dataset.menuEffect, node.dataset.look])),
            columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
            // offsetTop, not the box: a beat's pulse scales a button for a moment.
            rows: new Set(buttons.map((node) => node.offsetTop)).size,
            minTarget: Math.round(Math.min(...buttons.map((node) => Math.min(box(node).width, box(node).height)))),
            labelSize: getComputedStyle(fx.querySelector('.mobile-effect__name')).fontSize,
            labelsOneLine: [...fx.querySelectorAll('.mobile-effect__name')].every((node) => box(node).height <= 14),
            autoOn: auto ? pressedOf(auto) : null,
            autoWide: auto ? box(auto).width >= box(fx).width - 2 : null,
            autoHeight: auto ? Math.round(box(auto).height) : null,
            autoLast: auto ? box(auto).top > box(grid).bottom : null,
          }
        })()
        const colorTab = color && (() => {
          const row = color.querySelector('.palette-row')
          return {
            tiles: [...color.querySelectorAll('[data-palette]')].map((node) => node.dataset.palette),
            tile: color.querySelector('[data-palette][aria-pressed="true"]')?.dataset.palette ?? null,
            tileHeight: Math.round(box(color.querySelector('[data-palette]')).height),
            rowScrolls: row.scrollWidth > row.clientWidth,
            range: !!color.querySelector('.palette-range__track'),
            buttons: [...color.querySelectorAll('[data-one-slider-item]')].map((node) => node.dataset.oneSliderItem),
            selected: color.querySelector('[data-one-slider-item][aria-selected="true"]')?.dataset.oneSliderItem ?? null,
            sliderName: sliderName(color),
            pills: [...color.querySelectorAll('.mobile-color__pills input')].map((node) => node.name),
            pillHeight: Math.round(Math.min(...[...color.querySelectorAll('.mobile-color__pills label')].map((node) => box(node).height))),
            order: [...color.children].map((node) => node.className.split(' ')[0]),
          }
        })()
        const camera = cam && (() => {
          const pad = cam.querySelector('.pad')
          return {
            sway: cam.dataset.sway,
            sliders: cam.querySelectorAll('.slider-input').length,
            sliderName: sliderName(cam),
            dials: cam.querySelectorAll('[class*="spin-dial"]').length,
            checkboxes: cam.querySelectorAll('input[type="checkbox"]').length,
            padWidth: pad ? Math.round(box(pad).width) : null,
            padOpacity: Number(getComputedStyle(cam.querySelector('.pad-wrapper')).opacity),
            infoOpacity: Number(getComputedStyle(cam.querySelector('.mobile-camera__info')).opacity),
          }
        })()
        return { effects, color: colorTab, camera }
      })(),
    }
  })(),
  // The account sheet (#367), read on its own: while one sheet slides away the other can already be up.
  account: (() => {
    const el = document.querySelector('.account-sheet')
    if (!el) return null
    const body = el.querySelector('[data-account-sheet]')
    const box = el.getBoundingClientRect()
    return {
      state: el.dataset.bottomSheet,
      account: body?.dataset.accountSheet ?? null,
      view: body?.dataset.accountView ?? null,
      height: Math.round(box.height),
      bottom: Math.round(box.bottom),
      rows: [...el.querySelectorAll('[data-account-row]')].map((node) => node.dataset.accountRow),
      controlsValue: el.querySelector('[data-account-row="controls"] .account-row__value')?.textContent ?? null,
      modes: Object.fromEntries([...el.querySelectorAll('[data-controls-mode]')].map((node) => [node.dataset.controlsMode, node.getAttribute('aria-checked') === 'true'])),
      signIn: !!el.querySelector('.account-signin'),
      title: el.querySelector('.sheet-page-title')?.textContent ?? null,
    }
  })(),
  menuSheet: document.querySelector('.menu-sheet')?.dataset.bottomSheet ?? null,
  storedMode: localStorage.getItem('onScreenControls'),
  config: {
    family: window.config.fractal.family.value,
    tour: window.config.fractal.tour.value,
    orbit: Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((key) => [key, window.config.orbit[key].value])),
    particle: Object.fromEntries(['particlesPerLayer', 'particleSize', 'layers', 'levels'].map((key) => [key, window.config.particle[key].value])),
    sprites: window.config.particle.sprites.value.length,
    logo: Object.fromEntries(['threeD', 'lean', 'zoom', 'size', 'spinSpeed', 'shake'].map((key) => [key, window.config.logo[key].value])),
    clips: window.config.video.clips,
    kaleidoscopeCount: window.config.effects.kaleidoscopeCount.value,
    kaleidoscopeMode: window.config.effects.kaleidoscopeMode.value,
    palette: window.config.color.palette.value[0] ?? null,
    color: Object.fromEntries(['paletteCycles', 'palettePhase', 'saturation', 'paletteReverse', 'paletteHardEdge'].map((key) => [key, window.config.color[key].value])),
    sway: window.config.user.sway.value,
  },
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

// Top frame only: an init script also runs in each same-origin iframe the page adds later, which would put the mode back.
const storedMode = (mode) => (ctx) => ctx.addInitScript((m) => { if (window === window.top) localStorage.setItem('onScreenControls', m) }, mode)

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
  // The layer pages (`#365`). Compare the screenshots with docs/mobile-design/MenuLayerDetail.html (Fractal Type), FractalShape.html,
  // OrbitShape.html, OrbitParticles.html, OrbitSprites.html and LogoLook.html. Logo Motion, Logo Pad and Video have no design.
  ...layerPageScenarios(),
  // The Effects, Color and Camera tabs (`#366`). Compare the screenshots with docs/mobile-design/MenuFull.html (Effects),
  // ColorTab.html and CameraTab.html.
  ...menuTabScenarios(),
  // The account sheet (`#367`). Compare the screenshots with docs/mobile-design/AccountGuest.html (signed out),
  // AccountSheet.html (signed in, which needs a real Clerk key) and UIMode.html (the picker).
  ...accountScenarios(),
}

// Opens the sheet with the bar's menu button and waits for it to slide in.
const openSheet = async (cdp, page) => {
  const [x, y] = await centerOf(page, '[aria-label="Open menu"]')
  await tap(cdp, x, y)
  await sleep(500)
}

// A tap on the visible part of an element (a pill can run off either edge of its row), scrolled into view first when the
// sheet's body scrolls on a short phone.
const tapVisible = async (cdp, page, selector) => {
  const [x, y] = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const box = el.getBoundingClientRect()
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

// Opens a layer's page with a long-press on its bar button, as the bar does.
// Under software GL the long-press timer can fire late and miss (the flake noted for long-press), so a miss is tried once more.
const openLayerPage = async (cdp, page, layer) => {
  const wasOn = await page.evaluate((key) => window.config.layers.meta[key].enabled.value, layer)
  for (let attempt = 0; attempt < 2; attempt++) {
    const [x, y] = await centerOf(page, `[data-layer="${layer}"]`)
    await tap(cdp, x, y, 700)
    await sleep(600)
    if (await page.evaluate((key) => !!document.querySelector(`[data-layer-page="${key}"]`), layer)) return
    // A miss may have toggled the layer instead: put it back.
    await page.evaluate(([key, on]) => { if (!document.querySelector('[data-bottom-sheet]')) window.setLayerEnabled?.(key, on) }, [layer, wasOn])
  }
}

// Drags a range input's thumb `fraction` of the track to the right (negative: to the left).
const slideBy = async (cdp, page, selector, fraction) => {
  const [x, y, width] = await page.evaluate((sel) => {
    const input = document.querySelector(sel)
    const box = input.getBoundingClientRect()
    const at = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))
    return [box.left + 20 + (box.width - 40) * at, box.top + box.height / 2, box.width - 40]
  }, selector)
  await drag(cdp, [[x, y]], [[Math.max(4, Math.min(W - 4, x + width * fraction)), y]], 12, 20)
  await sleep(400)
}

function layerPageScenarios() {
  const scenarios = {}
  const sheetHeight = () => Math.round(Math.min(374, H * 0.6))
  const read = (page) => page.evaluate(READ)
  const fits = (sheet) => sheet?.state === 'open' && sheet.height === sheetHeight() && sheet.bottom === H
  const sliderSelector = '[data-layer-page] .sheet-slider .slider-input'
  // The Fractal page opens on Type: back, Type | Shape, the header row, six types three across. A tap picks a type.
  scenarios['page-fractal-type'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openLayerPage(cdp, page, 'fractal')
      const shown = await snap(cdp, page, 'page-fractal-type')
      await tapVisible(cdp, page, '.fractal-type:not(.fractal-type--active)')
      return { shown, picked: await read(page) }
    },
    expect: (before, after, mid) => {
      const lp = mid.shown.sheet?.layerPage
      return fits(mid.shown.sheet) && lp?.layer === 'fractal' && lp.subTab === 'type' && lp.segments.join() === 'type,shape' && lp.segment === 'type'
        && lp.headerRow && lp.types === 6 && lp.typeColumns === 3 && mid.picked.config.family !== before.config.family
    },
  }
  // Shape: the Tour slider on top, the pad about 140px wide beside Tour | Manual, the named shapes two across. A named shape moves the Tour.
  scenarios['page-fractal-shape'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openLayerPage(cdp, page, 'fractal')
      await tapVisible(cdp, page, '[data-layer-subtab="shape"]')
      const shown = await snap(cdp, page, 'page-fractal-shape')
      await tapVisible(cdp, page, '.shape-pad-compact .shape-pad-chip:nth-child(3)')
      return { shown, picked: await read(page) }
    },
    expect: (before, after, mid) => {
      const lp = mid.shown.sheet?.layerPage
      return fits(mid.shown.sheet) && lp?.subTab === 'shape' && lp.segment === 'shape' && lp.sliderName === 'Tour' && Math.abs(lp.padWidth - 140) <= 2
        && lp.chips > 0 && lp.chipColumns === 2 && mid.picked.config.tour !== before.config.tour
    },
  }
  // Orbit Shape: five setting buttons, the first selected; picking Spread puts its slider below, and the slider moves Spread only.
  scenarios['page-orbit-shape'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openLayerPage(cdp, page, 'orbit')
      const first = await read(page)
      await tapVisible(cdp, page, '[data-one-slider-item="b"]')
      const shown = await snap(cdp, page, 'page-orbit-shape')
      await slideBy(cdp, page, sliderSelector, 0.25)
      return { first, shown, slid: await read(page) }
    },
    expect: (before, after, mid) => {
      const first = mid.first.sheet?.layerPage
      const lp = mid.shown.sheet?.layerPage
      const slid = mid.slid.sheet?.layerPage
      return fits(mid.shown.sheet) && first?.subTab === 'shape' && first.segments.join() === 'shape,particles,sprites' && first.selected === 'a' && first.sliderName === 'Radius'
        && lp.buttons.join() === 'a,b,c,d,e' && lp.selected === 'b' && lp.sliderName === 'Spread'
        && mid.slid.config.orbit.b !== before.config.orbit.b && ['a', 'c', 'd', 'e'].every((key) => mid.slid.config.orbit[key] === before.config.orbit[key])
        && slid.buttonValue === slid.sliderValue
    },
  }
  // Orbit Particles: Count, Size, Layers, Levels, with the load zones painted on the track.
  scenarios['page-orbit-particles'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openLayerPage(cdp, page, 'orbit')
      await tapVisible(cdp, page, '[data-layer-subtab="particles"]')
      const shown = await snap(cdp, page, 'page-orbit-particles')
      await tapVisible(cdp, page, '[data-one-slider-item="levels"]')
      return { shown, levels: await read(page) }
    },
    expect: (before, after, mid) => {
      const lp = mid.shown.sheet?.layerPage
      return fits(mid.shown.sheet) && lp?.subTab === 'particles' && lp.buttons.join() === 'particlesPerLayer,particleSize,layers,levels'
        && lp.selected === 'particlesPerLayer' && lp.sliderName === 'Count' && lp.sliderZoned
        && mid.levels.sheet.layerPage.sliderName === 'Levels' && mid.levels.sheet.layerPage.sliderZoned
    },
  }
  // Pushing Levels into the red holds the slider at the edge and asks first, as on the desktop (Count alone can't reach it).
  scenarios['page-orbit-red-zone'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openLayerPage(cdp, page, 'orbit')
      await tapVisible(cdp, page, '[data-layer-subtab="particles"]')
      await tapVisible(cdp, page, '[data-one-slider-item="levels"]')
      // Twenty layers first (set here, once the page is open: the heavier scene would slow the long-press past its timing).
      await page.evaluate(() => window.updateConfigItem('particle', 'layers', 20))
      await sleep(2000)
      await slideBy(cdp, page, sliderSelector, 1)
      const asked = await snap(cdp, page, 'page-orbit-red-zone')
      return { asked, modal: await page.evaluate(() => !!document.querySelector('.confirm-modal-card')) }
    },
    expect: (before, after, mid) => mid.modal && mid.asked.config.particle.levels < 20 && mid.asked.config.particle.levels >= before.config.particle.levels,
  }
  // Orbit Sprites: the desktop picker, six tiles across in two rows; a tap adds a built-in to the particle list.
  scenarios['page-orbit-sprites'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openLayerPage(cdp, page, 'orbit')
      await tapVisible(cdp, page, '[data-layer-subtab="sprites"]')
      const shown = await snap(cdp, page, 'page-orbit-sprites')
      await tapVisible(cdp, page, '.sprite-picker__tile:not(.sprite-picker__tile--selected):not(:disabled)')
      return { shown, picked: await read(page) }
    },
    expect: (before, after, mid) => {
      const lp = mid.shown.sheet?.layerPage
      return fits(mid.shown.sheet) && lp?.subTab === 'sprites' && lp.spriteColumns === 6 && lp.spriteTile >= 50
        && (before.config.sprites >= 4 || mid.picked.config.sprites === before.config.sprites + 1)
    },
  }
  // Logo Look: the logo picker (six across) and the 3D, Lean and Zoom pills; a tap on Zoom flips it.
  scenarios['page-logo-look'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openLayerPage(cdp, page, 'logo')
      const shown = await snap(cdp, page, 'page-logo-look')
      await tapVisible(cdp, page, '[data-layer-page] .config-checkbox-row input[name="zoom"] + label')
      return { shown, flipped: await read(page) }
    },
    expect: (before, after, mid) => {
      const lp = mid.shown.sheet?.layerPage
      return fits(mid.shown.sheet) && lp?.subTab === 'look' && lp.segments.join() === 'look,motion,pad' && lp.spriteColumns === 6
        && lp.pills.join() === 'threeD,lean,zoom' && mid.flipped.config.logo.zoom === !before.config.logo.zoom
    },
  }
  // Logo Motion (no design): Size, Spin Speed and Shake as one-slider buttons; Spin Speed is a slider here, not the desktop's dial.
  scenarios['page-logo-motion'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openLayerPage(cdp, page, 'logo')
      await tapVisible(cdp, page, '[data-layer-subtab="motion"]')
      await tapVisible(cdp, page, '[data-one-slider-item="spinSpeed"]')
      const shown = await snap(cdp, page, 'page-logo-motion')
      await slideBy(cdp, page, sliderSelector, 0.2)
      return { shown, slid: await read(page) }
    },
    expect: (before, after, mid) => {
      const lp = mid.shown.sheet?.layerPage
      return fits(mid.shown.sheet) && lp?.buttons.join() === 'size,spinSpeed,shake' && lp.selected === 'spinSpeed' && lp.sliderName === 'Spin Speed'
        && lp.dials === 0 && mid.slid.config.logo.spinSpeed !== before.config.logo.spinSpeed
    },
  }
  // Logo Pad (no design): the desktop pad, small enough for the sheet.
  scenarios['page-logo-pad'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openLayerPage(cdp, page, 'logo')
      await tapVisible(cdp, page, '[data-layer-subtab="pad"]')
      return snap(cdp, page, 'page-logo-pad')
    },
    expect: (before, after, mid) => fits(mid.sheet) && mid.sheet.layerPage?.subTab === 'pad' && mid.sheet.layerPage.padWidth > 0 && mid.sheet.layerPage.padWidth <= 172,
  }
  // Video (no design): one page, no sub-tabs; the camera switch turns the live feed on (the fake camera) and back off, and the clips stay listed.
  scenarios['page-video'] = {
    changes: [],
    init: (ctx) => ctx.grantPermissions(['microphone', 'camera']),
    prepare: wake,
    run: async (cdp, page) => {
      await openLayerPage(cdp, page, 'video')
      const shown = await snap(cdp, page, 'page-video')
      await tapVisible(cdp, page, '.video-camera__switch')
      await sleep(1500)
      const on = await snap(cdp, page, 'page-video-live')
      await tapVisible(cdp, page, '.video-camera__switch')
      return { shown, on, off: await read(page) }
    },
    expect: (before, after, mid) => {
      const lp = mid.shown.sheet?.layerPage
      return fits(mid.shown.sheet) && lp?.layer === 'video' && lp.segments.length === 0 && lp.title === 'Video' && lp.camera === 'off' && lp.clips > 0
        && mid.on.config.clips.includes('realtime') && mid.on.sheet.layerPage.camera === 'live'
        && !mid.off.config.clips.includes('realtime') && mid.off.sheet.layerPage.camera === 'off'
    },
  }
  // A blocked camera turns the switch back off and the info line says why.
  scenarios['page-video-blocked'] = {
    changes: [],
    prepare: async (page) => {
      await page.evaluate(() => {
        navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
      })
      await wake(page)
    },
    run: async (cdp, page) => {
      await openLayerPage(cdp, page, 'video')
      await tapVisible(cdp, page, '.video-camera__switch')
      await sleep(800)
      return snap(cdp, page, 'page-video-blocked')
    },
    expect: (before, after, mid) => !mid.config.clips.includes('realtime') && mid.sheet?.layerPage?.camera === 'error' && mid.sheet.layerPage.cameraInfo === 'Camera access was blocked',
  }
  // From the Layers tab's arrow too, and each page opens on its first sub-tab again after going back.
  scenarios['page-from-layers-tab'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openSheet(cdp, page)
      await tapVisible(cdp, page, '[data-menu-layer="orbit"] .menu-layer-row__open')
      await tapVisible(cdp, page, '[data-layer-subtab="sprites"]')
      const sprites = await read(page)
      await tapVisible(cdp, page, '.sheet-back')
      await tapVisible(cdp, page, '[data-menu-layer="orbit"] .menu-layer-row__open')
      return { sprites, again: await snap(cdp, page, 'page-from-layers-tab') }
    },
    expect: (before, after, mid) => mid.sprites.sheet?.layerPage?.subTab === 'sprites' && mid.again.sheet?.layerPage?.subTab === 'shape',
  }
  // Without the fractal Types (a production build without FEATURE_FLAGS=fractalTypes; a dev build turns every flag on) the Fractal
  // page is Shape alone: the title, no sub-tabs. Skipped (passes) where the flag is on.
  scenarios['page-fractal-flag-off'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openLayerPage(cdp, page, 'fractal')
      return snap(cdp, page, 'page-fractal-flag-off')
    },
    expect: (before, after, mid) => {
      const lp = mid.sheet?.layerPage
      if (lp?.segments.length === 2) return true
      return fits(mid.sheet) && lp?.subTab === 'shape' && lp.segments.length === 0 && lp.title === 'Fractal' && lp.types === 0 && lp.sliderName === 'Tour'
    },
  }
  return scenarios
}

// Opens the sheet on one of its tabs with the tab's pill.
const openTab = async (cdp, page, tab) => {
  await openSheet(cdp, page)
  await tapVisible(cdp, page, `[data-menu-tab="${tab}"]`)
}

function menuTabScenarios() {
  const scenarios = {}
  const sheetHeight = () => Math.round(Math.min(374, H * 0.6))
  const read = (page) => page.evaluate(READ)
  const fits = (sheet) => sheet?.state === 'open' && sheet.height === sheetHeight() && sheet.bottom === H
  const tabOf = (state, tab) => (state.sheet?.tab === tab ? state.sheet.menuTab[tab] : null)
  const EFFECTS = ['kaleidoscope', 'cyclone', 'wobWob', 'switcheroo', 'colorShift', 'glow', 'shockwave']
  // Effects: the 100px dial (no desktop chips under it) with the mirror count and three mode buttons beside it, then every effect,
  // the kaleidoscope first, six to a row with 44px targets and one-line 10px names, and Auto full width under them.
  scenarios['tab-effects'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openTab(cdp, page, 'effects')
      return snap(cdp, page, 'tab-effects')
    },
    expect: (before, after, mid) => {
      const fx = tabOf(mid, 'effects')
      return fits(mid.sheet) && fx?.dial === 100 && fx.dialChips === 0 && fx.count === String(before.config.kaleidoscopeCount)
        && fx.modes.length === 3 && fx.modes[before.config.kaleidoscopeMode] === true && fx.modeHeight >= 44
        && fx.buttons.join() === EFFECTS.join() && fx.columns === 6 && fx.rows === 2 && fx.minTarget >= 44
        && fx.labelSize === '10px' && fx.labelsOneLine && fx.autoWide && fx.autoHeight >= 44 && fx.autoLast
        && EFFECTS.every((key) => fx.pressed[key] === before.ui.effects[key])
    },
  }
  // A tap on an effect switches it in the config, and its button and the bar's button follow; the kaleidoscope's too.
  scenarios['tab-effects-toggle'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openTab(cdp, page, 'effects')
      await tapVisible(cdp, page, '[data-menu-effect="switcheroo"]')
      const one = await read(page)
      await tapVisible(cdp, page, '[data-menu-effect="kaleidoscope"]')
      return { one, two: await snap(cdp, page, 'tab-effects-toggle') }
    },
    expect: (before, after, mid) => {
      const one = tabOf(mid.one, 'effects')
      const two = tabOf(mid.two, 'effects')
      return mid.one.ui.effects.switcheroo === !before.ui.effects.switcheroo && one?.pressed.switcheroo === mid.one.ui.effects.switcheroo
        && mid.one.ui.effects.kaleidoscope === before.ui.effects.kaleidoscope
        && mid.two.ui.effects.kaleidoscope === !before.ui.effects.kaleidoscope && two?.pressed.kaleidoscope === mid.two.ui.effects.kaleidoscope
        && mid.two.ui.effectButtons.kaleidoscope === mid.two.ui.effects.kaleidoscope
        && ['cyclone', 'wobWob', 'colorShift', 'glow', 'shockwave'].every((key) => mid.two.ui.effects[key] === before.ui.effects[key])
    },
  }
  // The mode buttons pick the mirror mode; a drag round the dial changes the mirror count, and the count beside it follows.
  scenarios['tab-effects-dial'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openTab(cdp, page, 'effects')
      await tapVisible(cdp, page, '[data-kaleidoscope-mode="1"]')
      const moded = await read(page)
      const [cx, cy, r] = await page.evaluate(() => {
        const box = document.querySelector('.mobile-effects .kaleidoscope-dial').getBoundingClientRect()
        return [box.left + box.width / 2, box.top + box.height / 2, box.width * 0.4]
      })
      // From the top (the fewest mirrors) a quarter of the way round, clockwise.
      await drag(cdp, [[cx, cy - r]], [[cx + r, cy]], 12, 20)
      await sleep(400)
      return { moded, turned: await snap(cdp, page, 'tab-effects-dial') }
    },
    expect: (before, after, mid) => {
      const turned = tabOf(mid.turned, 'effects')
      return mid.moded.config.kaleidoscopeMode === 1 && tabOf(mid.moded, 'effects')?.modes.join() === 'false,true,false'
        && mid.turned.config.kaleidoscopeCount > before.config.kaleidoscopeCount && turned?.count === String(mid.turned.config.kaleidoscopeCount)
    },
  }
  // Auto turns on and off from the bottom of the tab.
  scenarios['tab-effects-auto'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openTab(cdp, page, 'effects')
      const first = await read(page)
      await tapVisible(cdp, page, '.mobile-effects .auto-switch-button')
      const flipped = await read(page)
      await tapVisible(cdp, page, '.mobile-effects .auto-switch-button')
      return { first, flipped, back: await read(page) }
    },
    expect: (before, after, mid) => {
      const first = tabOf(mid.first, 'effects')?.autoOn
      return typeof first === 'boolean' && tabOf(mid.flipped, 'effects')?.autoOn === !first && tabOf(mid.back, 'effects')?.autoOn === first
    },
  }
  // Color: the palettes as a sideways row of tiles (it scrolls), the range bar, Cycles, Phase and Saturation as one slider
  // (Cycles first), then Reverse and Hard Edge as pills, in that order.
  scenarios['tab-color'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openTab(cdp, page, 'color')
      return snap(cdp, page, 'tab-color')
    },
    expect: (before, after, mid) => {
      const color = tabOf(mid, 'color')
      return fits(mid.sheet) && color?.tiles.length > 6 && color.tile === (before.config.palette ?? color.tiles[0]) && color.rowScrolls && color.tileHeight >= 44
        && color.range && color.buttons.join() === 'paletteCycles,palettePhase,saturation' && color.selected === 'paletteCycles' && color.sliderName === 'Cycles'
        && color.pills.join() === 'paletteReverse,paletteHardEdge' && color.pillHeight >= 44
        && color.order.join() === 'palette-picker,palette-range,one-slider,config-checkbox-row'
    },
  }
  // A palette tile picks the palette; Phase's button puts its slider below and the slider moves Phase only; Reverse flips.
  scenarios['tab-color-change'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openTab(cdp, page, 'color')
      await tapVisible(cdp, page, '[data-palette]:not([aria-pressed="true"])')
      const picked = await read(page)
      await tapVisible(cdp, page, '[data-one-slider-item="palettePhase"]')
      await slideBy(cdp, page, '.mobile-color .sheet-slider .slider-input', 0.3)
      const slid = await read(page)
      await tapVisible(cdp, page, '.mobile-color__pills input[name="paletteReverse"] + label')
      return { picked, slid, reversed: await snap(cdp, page, 'tab-color-change') }
    },
    expect: (before, after, mid) => {
      const slid = tabOf(mid.slid, 'color')
      const { color } = before.config
      return mid.picked.config.palette !== before.config.palette && tabOf(mid.picked, 'color')?.tile === mid.picked.config.palette
        && slid?.sliderName === 'Phase' && mid.slid.config.color.palettePhase !== color.palettePhase
        && mid.slid.config.color.paletteCycles === color.paletteCycles && mid.slid.config.color.saturation === color.saturation
        && mid.reversed.config.color.paletteReverse === !color.paletteReverse && mid.reversed.config.color.paletteHardEdge === color.paletteHardEdge
    },
  }
  // Camera: Sway as the large slider and the 140px camera pad, nothing else (Speed, Rotation and Scale are gestures, no Reverse
  // Lean). At Sway 0 (the default) the pad and its caption are faded.
  scenarios['tab-camera'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openTab(cdp, page, 'camera')
      return snap(cdp, page, 'tab-camera')
    },
    expect: (before, after, mid) => {
      const cam = tabOf(mid, 'camera')
      const off = before.config.sway === 0
      return fits(mid.sheet) && cam?.sliders === 1 && cam.sliderName === 'Sway' && cam.dials === 0 && cam.checkboxes === 0 && Math.abs(cam.padWidth - 140) <= 2
        && cam.sway === (off ? 'off' : 'on') && (off ? cam.padOpacity < 0.5 && cam.infoOpacity < 0.5 : cam.padOpacity === 1 && cam.infoOpacity === 1)
    },
  }
  // Raising Sway lights the pad up, and a drag on the pad moves the camera.
  scenarios['tab-camera-pad'] = {
    changes: ['camera'],
    prepare: wake,
    run: async (cdp, page) => {
      await openTab(cdp, page, 'camera')
      await slideBy(cdp, page, '.mobile-camera .sheet-slider .slider-input', 0.4)
      const swayed = await read(page)
      const [x, y, w] = await page.evaluate(() => {
        const box = document.querySelector('.mobile-camera .pad').getBoundingClientRect()
        return [box.left + box.width / 2, box.top + box.height / 2, box.width]
      })
      await drag(cdp, [[x, y]], [[x + w * 0.35, y - w * 0.3]], 12, 20)
      await sleep(300)
      return { swayed, dragged: await snap(cdp, page, 'tab-camera-pad') }
    },
    expect: (before, after, mid) => {
      const cam = tabOf(mid.swayed, 'camera')
      return mid.swayed.config.sway > 0 && cam?.sway === 'on' && cam.padOpacity === 1 && cam.infoOpacity === 1
    },
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

// Opens the account sheet with the badge and waits for it to slide in.
const openAccountSheet = async (cdp, page) => {
  const [x, y] = await centerOf(page, '[data-mobile-badge]')
  await tap(cdp, x, y)
  await sleep(500)
}

function accountScenarios() {
  const scenarios = {}
  const sheetHeight = () => Math.round(Math.min(374, H * 0.6))
  const read = (page) => page.evaluate(READ)
  const fits = (account) => account?.state === 'open' && account.height === sheetHeight() && account.bottom === H
  // Signed out (a placeholder Clerk key) or before Clerk loads: the sheet still has the On-screen controls row.
  const guestOrLoading = (account) => (account?.account === 'guest' && account.signIn && account.rows.join() === 'controls')
    || (account?.account === 'loading' && !account.signIn && account.rows.join() === 'controls')
  const MODE_TITLES = { full: 'Full', limited: 'Limited', none: 'None' }

  // The badge opens the sheet at the menu's height on the root view; the gestures pause meanwhile, so a drag does not steer.
  scenarios['account-open'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openAccountSheet(cdp, page)
      const mid = await snap(cdp, page, 'account-open')
      await drag(cdp, [[W * 0.5, H * 0.3]], [[W * 0.8, H * 0.35]])
      return mid
    },
    expect: (before, after, mid) => before.account === null && fits(mid.account) && mid.account.view === 'root'
      && guestOrLoading(mid.account) && mid.account.controlsValue === MODE_TITLES[before.controlsMode] && mid.menuSheet === null,
  }
  // The row opens the picker (UIMode.html) with the current mode checked; a pick applies it at once and saves it in the browser,
  // and back shows it on the row.
  for (const [from, to] of [['full', 'limited'], ['full', 'none'], ['limited', 'full']]) {
    scenarios[`account-picker-${from}-${to}`] = {
      changes: [],
      init: storedMode(from),
      prepare: wake,
      run: async (cdp, page) => {
        // Limited shows no badge at rest: it comes back while the menu is open (MenuLimited.html), and the account sheet takes over.
        // The long-press can miss its timer under software GL (the known flake), so it is tried up to three times.
        for (let i = 0; from !== 'full' && i < 3 && !(await page.$('[data-mobile-badge]')); i++) {
          await tap(cdp, W * 0.5, H * 0.2, 700)
          await sleep(500)
        }
        await openAccountSheet(cdp, page)
        const opened = await read(page)
        await tapVisible(cdp, page, '[data-account-row="controls"]')
        const picker = await snap(cdp, page, `account-picker-${from}-${to}`)
        await tapVisible(cdp, page, `[data-controls-mode="${to}"]`)
        const picked = await snap(cdp, page, `account-picker-${from}-${to}-picked`)
        await tapVisible(cdp, page, '.account-sheet .sheet-back')
        return { opened, picker, picked, back: await read(page) }
      },
      expect: (before, after, mid) => {
        const { opened, picker, picked, back } = mid
        // From the menu the sheet may still be sliding in at the first read, so its place is checked on the last.
        return before.controlsMode === from && opened.account?.state === 'open' && opened.account.view === 'root' && opened.menuSheet !== 'open'
          && picker.account?.view === 'controls' && picker.account.title === 'On-screen controls'
          && Object.keys(picker.account.modes).join() === 'full,limited,none' && picker.account.modes[from] && !picker.account.modes[to]
          && picked.controlsMode === to && picked.storedMode === to && picked.account.modes[to] && !picked.account.modes[from]
          && picked.account.state === 'open'
          && fits(back.account) && back.account.view === 'root' && back.account.controlsValue === MODE_TITLES[to]
          && after.controlsMode === to
      },
    }
  }
  // Signed out with Clerk loaded (AccountGuest.html): the pitch, the sign-in button and the controls row. Needs a real Clerk
  // development key: with a placeholder Clerk never loads and the sheet stays on its loading state.
  scenarios['account-guest'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => { await openAccountSheet(cdp, page); return snap(cdp, page, 'account-guest') },
    expect: (before, after, mid) => fits(mid.account) && mid.account.account === 'guest' && mid.account.signIn
      && mid.account.rows.join() === 'controls',
  }
  // The sign-in button opens Clerk's modal above the sheet (the point in the sheet's middle is the modal's). Real key only, as above.
  scenarios['account-guest-sign-in'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openAccountSheet(cdp, page)
      // Clerk never loaded (a placeholder key): fail here rather than stop the whole run.
      if (!(await page.$('.account-signin'))) return { ...(await read(page)), modalOnTop: false }
      await tapVisible(cdp, page, '.account-signin')
      await sleep(1500)
      const mid = await snap(cdp, page, 'account-guest-sign-in')
      const modalOnTop = await page.evaluate(() => {
        const sheet = document.querySelector('.account-sheet').getBoundingClientRect()
        const top = document.elementFromPoint(sheet.left + sheet.width / 2, sheet.top + sheet.height / 2)
        return !!top && !top.closest('.account-sheet') && !!top.closest('[class*="cl-"]')
      })
      return { ...mid, modalOnTop }
    },
    expect: (before, after, mid) => mid.account?.state === 'open' && mid.modalOnTop,
  }
  // A tap on the visual closes it, without steering.
  scenarios['account-close-visual'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openAccountSheet(cdp, page)
      await tap(cdp, W * 0.5, H * 0.25)
      await sleep(500)
      return read(page)
    },
    expect: (before, after, mid) => (mid.account === null || mid.account.state === 'closing') && after.account === null,
  }
  // A drag down on its head closes it.
  scenarios['account-drag-close'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openAccountSheet(cdp, page)
      const top = H - sheetHeight() + 8
      await drag(cdp, [[W * 0.5, top]], [[W * 0.5, top + 200]])
      await sleep(500)
      return read(page)
    },
    expect: (before, after) => after.account === null,
  }
  // The sheet starts on its root view every time, even when it closed on the picker.
  scenarios['account-reopen-root'] = {
    changes: [],
    prepare: wake,
    run: async (cdp, page) => {
      await openAccountSheet(cdp, page)
      await tapVisible(cdp, page, '[data-account-row="controls"]')
      await tap(cdp, W * 0.5, H * 0.25)
      await sleep(600)
      await openAccountSheet(cdp, page)
      return read(page)
    },
    expect: (before, after, mid) => mid.account?.state === 'open' && mid.account.view === 'root',
  }
  // The long-press does not open the menu over the account sheet.
  scenarios['account-long-press'] = {
    changes: [],
    prepare: async (page) => { await countMenuOpens(page); await wake(page) },
    run: async (cdp, page) => {
      await openAccountSheet(cdp, page)
      await tap(cdp, W * 0.5, H * 0.2, 700)
      await sleep(500)
      return read(page)
    },
    expect: (before, after, mid) => mid.menuOpens === 0 && mid.menuSheet === null,
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
