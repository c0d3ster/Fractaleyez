import React, { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'

import type { LayerKey } from '../../config/configDefaults'
import { LAYER_REGISTRY } from '../../config/layers'
import { useConfigContext } from '../config/context/ConfigProvider'
import { useConfigSelector } from '../config/context/useConfigSelector'
import { ConfigSectionItems } from '../config/ConfigSectionItems'
import { LayerHeader } from '../config/LayerHeader'
import { PreviewLockFrame } from '../presets/PreviewLockFrame'
import { Presets, type PresetSelection } from '../presets/Presets'
import { SavePreset } from '../presets/SavePreset'
import { BottomSheet } from './BottomSheet'
import { BAR_LAYERS } from './BottomBar'
import type { LayerSubTab } from './layerPages'
import { LayerPage, LayerPageHead } from './LayerPage'
import { ConfigMenuTabBody } from './MenuTabs'
import { setMenuOpen, subscribeOpenMenu } from './menuBus'
import { CLOSED_MENU, MENU_TAB_LABELS, MENU_TABS, type MenuTab, menuSheetReducer, scrollLeftToShow } from './menuSheetState'
import { useLayerReset } from './useLayerReset'
import './MenuSheet.css'

// The mobile menu (docs/mobile-design/MenuHalf.html): a bottom sheet with a tab per part of the config. Opened through the menu
// bus (the bar's menu button, the long-press, a layer button's long-press onto that layer's page). While it is open the menu bus
// says so, which pauses the gestures (main.ts) and brings the badge back in Limited and None.

const PILL_MARGIN_PX = 16

const Chevron = (): React.ReactElement => (
  <svg aria-hidden='true' width={16} height={16} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
    <path d='M9 6l6 6-6 6' />
  </svg>
)

type TabPillsProps = { tab: MenuTab; onTab: (tab: MenuTab) => void }

/** The tab row. The active pill is always scrolled fully into view, since the sheet can open on a later tab. */
const TabPills = ({ tab, onTab }: TabPillsProps): React.ReactElement => {
  const rowRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef(true)

  useLayoutEffect(() => {
    const row = rowRef.current
    const pill = row?.querySelector<HTMLElement>(`[data-menu-tab="${tab}"]`)
    if (!row || !pill) return
    const left = scrollLeftToShow({ scrollLeft: row.scrollLeft, viewWidth: row.clientWidth, left: pill.offsetLeft, width: pill.offsetWidth }, PILL_MARGIN_PX)
    if (left !== row.scrollLeft) row.scrollTo({ left, behavior: firstRef.current ? 'auto' : 'smooth' })
    firstRef.current = false
  }, [tab])

  return (
    <div ref={rowRef} className='sheet-pills' role='tablist' aria-label='Menu tabs'>
      {MENU_TABS.map((key) => (
        <button
          key={key}
          type='button'
          role='tab'
          className='sheet-pill'
          aria-selected={key === tab}
          data-menu-tab={key}
          onClick={() => onTab(key)}
        >
          {MENU_TAB_LABELS[key]}
        </button>
      ))}
    </div>
  )
}

type LayerRowProps = { layerKey: LayerKey; onOpen: (layer: LayerKey) => void }

/** The desktop layer header (power, name, blend, opacity, order, reset; drag across for opacity) and an arrow to the layer's page. */
const LayerRow = ({ layerKey, onOpen }: LayerRowProps): React.ReactElement => {
  const enabled = useConfigSelector((config) => config.layers.meta[layerKey].enabled.value)
  const { label } = LAYER_REGISTRY[layerKey]
  const reset = useLayerReset(layerKey)

  return (
    <div className={`menu-layer-row${enabled ? '' : ' menu-layer-row--off'}`} data-menu-layer={layerKey}>
      <LayerHeader layerKey={layerKey} title={label} onReset={reset} />
      <button type='button' className='menu-layer-row__open' aria-label={`Open ${label}`} onClick={() => onOpen(layerKey)}>
        <Chevron />
      </button>
    </div>
  )
}

/** One row per layer in order of importance; the number in each header is its real place in the stack, the rows never reorder. */
const LayersTab = ({ onOpen }: { onOpen: (layer: LayerKey) => void }): React.ReactElement => (
  <div className='menu-layers'>
    {BAR_LAYERS.map((key) => <LayerRow key={key} layerKey={key} onOpen={onOpen} />)}
  </div>
)

/** The sidebar's preset list and save button. No design yet. */
const PresetsTab = (): React.ReactElement => {
  const [prefill, setPrefill] = useState<PresetSelection | null>(null)
  return (
    <div className='menu-presets'>
      <div className='menu-presets__head'>
        <SavePreset prefill={prefill} onSaved={() => setPrefill(null)} />
      </div>
      <Presets
        onSelect={setPrefill}
        onPackSelect={(pack: string) => setPrefill((prev) => (prev ? { ...prev, pack } : { name: '', label: '', pack, isOwn: false }))}
      />
    </div>
  )
}

/** The sidebar's Audio section. No design yet. */
const AudioTab = (): React.ReactElement => {
  const { updateConfigItem } = useConfigContext()
  return (
    <div className='menu-config-items'>
      <ConfigSectionItems name='audio' onChange={updateConfigItem} />
    </div>
  )
}

const TabBody = ({ tab, onOpenLayer }: { tab: MenuTab; onOpenLayer: (layer: LayerKey) => void }): React.ReactElement => {
  switch (tab) {
  case 'layers':
    return <LayersTab onOpen={onOpenLayer} />
  case 'audio':
    return <AudioTab />
  case 'presets':
    // Drawn outside the preview lock by MenuSheet.
    return <PresetsTab />
  default:
    return <ConfigMenuTabBody tab={tab} />
  }
}

export const MenuSheet = (): React.ReactElement | null => {
  const [state, dispatch] = useReducer(menuSheetReducer, CLOSED_MENU)
  const { open, tab, layerPage, subTab } = state

  useEffect(() => subscribeOpenMenu((page) => dispatch({ type: 'open', page })), [])

  // The menu bus pauses the gestures while this is true (main.ts), so the sheet does not pause them itself.
  useEffect(() => setMenuOpen(open), [open])
  useEffect(() => () => setMenuOpen(false), [])

  const close = useCallback(() => dispatch({ type: 'close' }), [])
  const selectTab = useCallback((next: MenuTab) => dispatch({ type: 'tab', tab: next }), [])
  const openLayer = useCallback((layer: LayerKey) => dispatch({ type: 'layerPage', layer }), [])
  const selectSubTab = useCallback((next: LayerSubTab) => dispatch({ type: 'subTab', subTab: next }), [])
  const back = useCallback(() => dispatch({ type: 'back' }), [])

  const head = layerPage
    ? <LayerPageHead layer={layerPage} subTab={subTab} onSubTab={selectSubTab} onBack={back} />
    : <TabPills tab={tab} onTab={selectTab} />

  return (
    <BottomSheet open={open} onClose={close} label='Menu' head={head} className='menu-sheet'>
      <div data-menu-page={layerPage ?? tab}>
        {/* Presets stay usable during a premium preview, as in the sidebar; the config controls are locked. */}
        {tab === 'presets'
          ? <PresetsTab />
          : (
            <PreviewLockFrame>
              {layerPage ? <LayerPage layer={layerPage} subTab={subTab} /> : <TabBody tab={tab} onOpenLayer={openLayer} />}
            </PreviewLockFrame>
          )}
      </div>
    </BottomSheet>
  )
}
