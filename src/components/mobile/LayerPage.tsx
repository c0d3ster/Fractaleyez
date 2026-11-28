import React, { useEffect } from 'react'

import type { LayerKey } from '../../config/configDefaults'
import { isFeatureEnabled } from '../../config/featureFlags'
import { LAYER_REGISTRY } from '../../config/layers'
import { isLiveClip } from '../../config/video.config'
import { cameraSource, canChooseFacing, type CameraFacing } from '../../visualization/camera-source'
import { ConfigSectionItems } from '../config/ConfigSectionItems'
import { ConfigVideoBody, useCameraState } from '../config/ConfigVideoBody'
import { useConfigContext } from '../config/context/ConfigProvider'
import { useConfigSelector } from '../config/context/useConfigSelector'
import { FractalTypePicker } from '../config/FractalTypePicker'
import { LayerHeader } from '../config/LayerHeader'
import { LogoPad } from '../config/LogoPad'
import { LogoSpritePicker } from '../config/LogoSpritePicker'
import { ShapePad } from '../config/ShapePad'
import { ParticleSpriteHud } from '../huds'
import { cameraGaveUp, cameraLine, type LayerSubTab, layerSubTabs, ONE_SLIDER_SETS, resolveSubTab, showsSubTabs, SUB_TAB_LABELS } from './layerPages'
import { OneSliderSection } from './OneSliderSection'
import { useLayerReset } from './useLayerReset'
import './LayerPage.css'

// A layer's page in the menu sheet (docs/mobile-design/MenuLayerDetail.html and the Fractal, Orbit and Logo screens): the back button
// and the page's sub-tabs at the top, the layer's header row, then the sub-tab's controls. The controls are the desktop's, laid
// out for the sheet's fixed height; Logo Motion, Logo Pad and Video have no design yet and follow the same patterns.

/** The fractal Types are built but not released everywhere: without them the Fractal page is its Shape alone. */
const fractalTypesOn = (): boolean => isFeatureEnabled('fractalTypes')

/** The sub-tabs of a layer's page and the one on show. */
export const useLayerSubTabs = (layer: LayerKey, picked: LayerSubTab | null): { tabs: readonly LayerSubTab[]; current: LayerSubTab | null } => {
  const tabs = layerSubTabs(layer, fractalTypesOn())
  return { tabs, current: resolveSubTab(tabs, picked) }
}

const Chevron = (): React.ReactElement => (
  <svg aria-hidden='true' width={18} height={18} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
    <path d='M15 6l-6 6 6 6' />
  </svg>
)

type LayerPageHeadProps = {
  layer: LayerKey
  subTab: LayerSubTab | null
  onSubTab: (subTab: LayerSubTab) => void
  onBack: () => void
}

/** The page's top row: the back button, then the sub-tabs as a segmented control, or the layer's name when it has none. */
export const LayerPageHead = ({ layer, subTab, onSubTab, onBack }: LayerPageHeadProps): React.ReactElement => {
  const { tabs, current } = useLayerSubTabs(layer, subTab)
  const { label } = LAYER_REGISTRY[layer]
  return (
    <div className='sheet-page-head'>
      <button type='button' className='sheet-back' aria-label='Back to Layers' onClick={onBack}>
        <Chevron />
      </button>
      {showsSubTabs(tabs)
        ? (
          <div className='sheet-segments' role='tablist' aria-label={`${label} sections`}>
            {tabs.map((tab) => (
              <button
                key={tab}
                type='button'
                role='tab'
                className='sheet-segment'
                aria-selected={tab === current}
                data-layer-subtab={tab}
                onClick={() => onSubTab(tab)}
              >
                {SUB_TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        )
        : <span className='sheet-page-title'>{label}</span>}
    </div>
  )
}

/** The layer's header (power, blend, opacity, order, reset), as in the Layers tab but without the arrow. */
const LayerPageRow = ({ layer }: { layer: LayerKey }): React.ReactElement => {
  const enabled = useConfigSelector((config) => config.layers.meta[layer].enabled.value)
  const reset = useLayerReset(layer)
  return (
    <div className={`menu-layer-row menu-layer-row--page${enabled ? '' : ' menu-layer-row--off'}`} data-menu-layer-page-row={layer}>
      <LayerHeader layerKey={layer} title={LAYER_REGISTRY[layer].label} onReset={reset} />
    </div>
  )
}

/** The Tour slider on top, then the Shape pad beside Tour | Manual and the named shapes (FractalShape.html). */
const FractalShape = (): React.ReactElement => {
  const { updateConfigItem } = useConfigContext()
  return (
    <>
      <div className='sheet-slider'>
        <ConfigSectionItems name='fractal' only={['tour']} onChange={updateConfigItem} />
      </div>
      <ShapePad compact />
    </>
  )
}

/** The logo picker, then 3D, Lean and Zoom as the desktop's pills (LogoLook.html). */
const LogoLook = (): React.ReactElement => {
  const { updateConfigItem } = useConfigContext()
  return (
    <>
      <LogoSpritePicker />
      <div className='config-checkbox-row'>
        <ConfigSectionItems name='logo' only={['threeD', 'lean', 'zoom']} onChange={updateConfigItem} />
      </div>
    </>
  )
}

const FACINGS: readonly { id: CameraFacing; label: string }[] = [
  { id: 'user', label: 'Front' },
  { id: 'environment', label: 'Rear' },
]

/**
 * The live camera switch, the touch version of the C key, with Front | Rear once the phone shows it has more than one camera. A
 * camera that is blocked turns the switch back off, and the info line under it says why. No design yet.
 */
const CameraSwitch = (): React.ReactElement => {
  const { toggleLiveVideo } = useConfigContext()
  const active = useConfigSelector((config) => config.video.clips.some(isLiveClip))
  const camera = useCameraState()
  const gaveUp = active && cameraGaveUp(camera)

  useEffect(() => {
    if (gaveUp) toggleLiveVideo()
  }, [gaveUp, toggleLiveVideo])

  const facing = camera.facing ?? 'user'
  return (
    <div className='video-camera' data-camera={active || cameraGaveUp(camera) ? camera.status : 'off'}>
      <button type='button' className='video-camera__switch' aria-pressed={active} onClick={toggleLiveVideo}>
        <span className='video-camera__name'>Live camera</span>
        <span className='video-camera__state'>{active ? 'On' : 'Off'}</span>
      </button>
      {active && canChooseFacing(camera.devices) && (
        <div className='sheet-segments video-camera__facing' role='group' aria-label='Camera'>
          {FACINGS.map(({ id, label }) => (
            <button
              key={id}
              type='button'
              className='sheet-segment'
              aria-pressed={id === facing}
              data-camera-facing={id}
              onClick={() => cameraSource.setFacing(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <p className='video-camera__info' role='status'>{cameraLine(camera, active)}</p>
    </div>
  )
}

/** The clip picker and the camera on one page. No design yet. */
const VideoPage = (): React.ReactElement => (
  <>
    <CameraSwitch />
    <div className='menu-config-items video-clips'>
      <ConfigVideoBody hideLive />
    </div>
  </>
)

const PageBody = ({ layer, subTab }: { layer: LayerKey; subTab: LayerSubTab | null }): React.ReactElement | null => {
  switch (layer) {
  case 'fractal':
    return subTab === 'type' ? <FractalTypePicker expanded /> : <FractalShape />
  case 'orbit':
    if (subTab === 'particles') return <OneSliderSection {...ONE_SLIDER_SETS.orbitParticles} />
    if (subTab === 'sprites') return <ParticleSpriteHud pickerOnly />
    return <OneSliderSection {...ONE_SLIDER_SETS.orbitShape} />
  case 'logo':
    if (subTab === 'motion') return <OneSliderSection {...ONE_SLIDER_SETS.logoMotion} />
    if (subTab === 'pad') return <div className='layer-page__pad'><LogoPad /></div>
    return <LogoLook />
  case 'video':
    return <VideoPage />
  default:
    return null
  }
}

type LayerPageProps = { layer: LayerKey; subTab: LayerSubTab | null }

export const LayerPage = ({ layer, subTab }: LayerPageProps): React.ReactElement => {
  const { current } = useLayerSubTabs(layer, subTab)
  return (
    <div className='menu-layer-page' data-layer-page={layer} data-layer-subtab-page={current ?? layer}>
      <LayerPageRow layer={layer} />
      {/* Keyed by sub-tab, so each one-slider section opens on its first setting. */}
      <PageBody key={current ?? layer} layer={layer} subTab={current} />
    </div>
  )
}
