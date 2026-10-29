import { useEffect, useState } from 'react'

import { DialDetail } from '../../config/quality.config'
import { subscribeUiTick } from '../../utils/uiTicker'

const DEFAULT_DETAIL: DialDetail = 'stepped'

/** Main app window when config runs in a popup; otherwise `window`. The quality tier lives there. */
const mainWindow = (): Window => window.opener ?? window

type DialDetailState = {
  /** How much the dial animates right now. */
  detail: DialDetail
  /** The level picked by hand, or null while the quality tier's is used. */
  picked: DialDetail | null
}

const readState = (): DialDetailState => ({
  detail: mainWindow().getDialDetail?.() ?? DEFAULT_DETAIL,
  picked: mainWindow().getDialDetailPick?.() ?? null,
})

/** How much the kaleidoscope dial should animate right now: the quality tier's choice, or the one picked with `pickDialDetail`. */
export const useDialDetail = (): DialDetailState => {
  const [state, setState] = useState<DialDetailState>(readState)

  useEffect(() => subscribeUiTick(() => {
    const next = readState()
    setState((previous) => (previous.detail === next.detail && previous.picked === next.picked ? previous : next))
  }), [])

  return state
}

/** Picks a level for the dial, or null to follow the quality tier again. */
export const pickDialDetail = (level: DialDetail | null): void => {
  mainWindow().setDialDetail?.(level)
}
