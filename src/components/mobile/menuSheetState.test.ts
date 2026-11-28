import { describe, expect, it } from 'vitest'

import {
  CLOSED_MENU,
  closesOnRelease,
  DRAG_CLOSE_PX,
  dragOffset,
  isLayerPage,
  isMenuTab,
  type MenuSheetState,
  menuSheetReducer,
  scrollLeftToShow,
} from './menuSheetState'

const opened = (page?: string): MenuSheetState => menuSheetReducer(CLOSED_MENU, { type: 'open', page })

describe('menu sheet reducer', () => {
  it('opens on the Layers tab with no page given', () => {
    expect(opened()).toEqual({ open: true, tab: 'layers', layerPage: null })
  })

  it('opens straight onto a layer page for a layer key', () => {
    expect(opened('orbit')).toEqual({ open: true, tab: 'layers', layerPage: 'orbit' })
  })

  it('opens on a named tab, and on Layers for an unknown page', () => {
    expect(opened('camera')).toEqual({ open: true, tab: 'camera', layerPage: null })
    expect(opened('nowhere')).toEqual({ open: true, tab: 'layers', layerPage: null })
  })

  it('starts fresh on Layers each time it opens', () => {
    let state = menuSheetReducer(opened(), { type: 'tab', tab: 'audio' })
    state = menuSheetReducer(state, { type: 'close' })
    expect(state.open).toBe(false)
    expect(menuSheetReducer(state, { type: 'open' })).toEqual({ open: true, tab: 'layers', layerPage: null })
  })

  it('opening again while open lands on the new page', () => {
    const state = menuSheetReducer(opened('fractal'), { type: 'open', page: 'video' })
    expect(state).toEqual({ open: true, tab: 'layers', layerPage: 'video' })
  })

  it('a tab switch leaves any layer page', () => {
    const state = menuSheetReducer(opened('logo'), { type: 'tab', tab: 'color' })
    expect(state).toEqual({ open: true, tab: 'color', layerPage: null })
  })

  it('opens a layer page from the Layers tab, and back returns to the rows', () => {
    const page = menuSheetReducer(opened(), { type: 'layerPage', layer: 'fractal' })
    expect(page).toEqual({ open: true, tab: 'layers', layerPage: 'fractal' })
    expect(menuSheetReducer(page, { type: 'back' })).toEqual({ open: true, tab: 'layers', layerPage: null })
  })

  it('keeps the same state object for no-op actions', () => {
    const state = opened()
    expect(menuSheetReducer(state, { type: 'back' })).toBe(state)
    expect(menuSheetReducer(state, { type: 'tab', tab: 'layers' })).toBe(state)
    expect(menuSheetReducer(CLOSED_MENU, { type: 'close' })).toBe(CLOSED_MENU)
  })
})

describe('menu pages', () => {
  it('knows the layer keys and the tabs', () => {
    expect(['fractal', 'orbit', 'logo', 'video'].every(isLayerPage)).toBe(true)
    expect(isLayerPage('layers')).toBe(false)
    expect(isLayerPage('toString')).toBe(false)
    expect(isLayerPage(undefined)).toBe(false)
    expect(isMenuTab('presets')).toBe(true)
    expect(isMenuTab('fractal')).toBe(false)
  })
})

describe('drag to close', () => {
  it('follows the finger down only', () => {
    expect(dragOffset(100, 160)).toBe(60)
    expect(dragOffset(100, 40)).toBe(0)
  })

  it('closes only past the threshold', () => {
    expect(closesOnRelease(DRAG_CLOSE_PX)).toBe(false)
    expect(closesOnRelease(DRAG_CLOSE_PX + 1)).toBe(true)
  })
})

describe('scrollLeftToShow', () => {
  const view = { scrollLeft: 0, viewWidth: 300 }

  it('leaves the row alone when the item is in view', () => {
    expect(scrollLeftToShow({ ...view, left: 100, width: 80 }, 16)).toBe(0)
  })

  it('scrolls right just enough to show an item past the right edge', () => {
    expect(scrollLeftToShow({ ...view, left: 280, width: 80 }, 16)).toBe(76)
  })

  it('scrolls left to show an item before the left edge, never below 0', () => {
    expect(scrollLeftToShow({ scrollLeft: 200, viewWidth: 300, left: 120, width: 80 }, 16)).toBe(104)
    expect(scrollLeftToShow({ scrollLeft: 200, viewWidth: 300, left: 0, width: 80 }, 16)).toBe(0)
  })
})
