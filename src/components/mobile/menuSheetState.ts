import type { LayerKey } from '../../config/configDefaults'
import { LAYER_REGISTRY } from '../../config/layers'

// The menu sheet's state (docs/mobile-design/MenuHalf.html): open or not, the active tab, and the layer page open inside the
// Layers tab. Pure, so the reducer and the sheet's geometry are tested without a DOM.

export const MENU_TABS = ['presets', 'layers', 'color', 'effects', 'audio', 'camera'] as const
export type MenuTab = (typeof MENU_TABS)[number]

export const MENU_TAB_LABELS: Record<MenuTab, string> = {
  presets: 'Presets',
  layers: 'Layers',
  color: 'Color',
  effects: 'Effects',
  audio: 'Audio',
  camera: 'Camera',
}

export type MenuSheetState = {
  open: boolean
  tab: MenuTab
  /** A layer's page, shown in place of the Layers tab's rows; null on every other tab. */
  layerPage: LayerKey | null
}

export type MenuSheetAction =
  /** `page` from `openMenu`: a layer key opens that layer's page, a tab id that tab, anything else the Layers tab. */
  | { type: 'open'; page?: string }
  | { type: 'close' }
  | { type: 'tab'; tab: MenuTab }
  | { type: 'layerPage'; layer: LayerKey }
  | { type: 'back' }

export const CLOSED_MENU: MenuSheetState = { open: false, tab: 'layers', layerPage: null }

export const isLayerPage = (page: string | undefined): page is LayerKey => page !== undefined && Object.prototype.hasOwnProperty.call(LAYER_REGISTRY, page)

export const isMenuTab = (page: string | undefined): page is MenuTab => MENU_TABS.some((tab) => tab === page)

export const menuSheetReducer = (state: MenuSheetState, action: MenuSheetAction): MenuSheetState => {
  switch (action.type) {
  case 'open':
    // Each opening starts fresh: the Layers tab unless the request names a layer or a tab.
    if (isLayerPage(action.page)) return { open: true, tab: 'layers', layerPage: action.page }
    return { open: true, tab: isMenuTab(action.page) ? action.page : 'layers', layerPage: null }
  case 'close':
    return state.open ? { ...state, open: false } : state
  case 'tab':
    return state.tab === action.tab && state.layerPage === null ? state : { ...state, tab: action.tab, layerPage: null }
  case 'layerPage':
    return { ...state, tab: 'layers', layerPage: action.layer }
  case 'back':
    return state.layerPage === null ? state : { ...state, layerPage: null }
  default:
    return state
  }
}

/** How far down the sheet has to be dragged for letting go to close it. */
export const DRAG_CLOSE_PX = 80
/** A press on the sheet's top has to move this far down before it counts as a drag (and stops being a tap on a pill). */
export const DRAG_START_PX = 8

/** The sheet follows the finger down, never up past where it rests. */
export const dragOffset = (startY: number, y: number): number => Math.max(0, y - startY)

export const closesOnRelease = (offset: number): boolean => offset > DRAG_CLOSE_PX

type ScrollBox = { scrollLeft: number; viewWidth: number; left: number; width: number }

/**
 * The scrollLeft that brings an item of a sideways-scrolling row fully into view, with `margin` to spare, moving the row as
 * little as it can (unchanged when the item is already in view).
 */
export const scrollLeftToShow = ({ scrollLeft, viewWidth, left, width }: ScrollBox, margin = 0): number => {
  if (left - margin < scrollLeft) return Math.max(0, left - margin)
  if (left + width + margin > scrollLeft + viewWidth) return left + width + margin - viewWidth
  return scrollLeft
}
