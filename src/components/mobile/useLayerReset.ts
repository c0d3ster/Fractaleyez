import { useCallback } from 'react'

import type { LayerKey } from '../../config/configDefaults'
import { LAYER_REGISTRY } from '../../config/layers'
import { isResettableSection } from '../config/ConfigSectionItems'
import { useConfigContext } from '../config/context/ConfigProvider'

/** A layer header's reset, as in the sidebar: Video restores the preset's clips, the others every section the layer owns. */
export const useLayerReset = (layerKey: LayerKey): (() => void) => {
  const { resetConfigSection, resetVideoClips } = useConfigContext()
  const { popupColumn } = LAYER_REGISTRY[layerKey]
  return useCallback(() => {
    if (layerKey === 'video') {
      resetVideoClips()
      return
    }
    popupColumn.filter(isResettableSection).forEach((section) => { void resetConfigSection(section) })
  }, [layerKey, popupColumn, resetConfigSection, resetVideoClips])
}
