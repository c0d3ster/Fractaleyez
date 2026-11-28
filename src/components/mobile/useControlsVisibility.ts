import { useMemo } from 'react'

import { controlsVisibility, type ControlsVisibility } from '../../config/mobileControls.config'
import { useControlsMode } from './controlsMode'
import { useMenuOpen } from './menuBus'

/** What the mobile shell shows for the active mode and menu state (see controlsVisibility). */
export const useControlsVisibility = (): ControlsVisibility => {
  const mode = useControlsMode()
  const menuOpen = useMenuOpen()
  return useMemo(() => controlsVisibility(mode, menuOpen), [mode, menuOpen])
}
