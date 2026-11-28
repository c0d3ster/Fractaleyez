import React, { useSyncExternalStore } from 'react'

import { soundHint } from '../audioanalysis/sound-hint'

const HINT_TEXT = {
  tap: 'Tap to start sound',
  blocked: 'Sound is blocked. Allow the microphone in your browser settings.',
} as const

// The line at the bottom of the screen on mobile until the sound runs. It lets every tap through to the page, which is what starts the sound.
export const SoundHint = (): React.ReactElement | null => {
  const hint = useSyncExternalStore(soundHint.subscribe, soundHint.get)
  if (!hint) return null
  return (
    <div
      role='status'
      className='pointer-events-none fixed inset-x-0 z-20 flex justify-center px-4 text-center'
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
      <span className='rounded-full bg-black/60 px-3 py-1 text-xs text-white/80'>{HINT_TEXT[hint]}</span>
    </div>
  )
}
