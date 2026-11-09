import React, { useSyncExternalStore } from 'react'
import { autoMode } from '../../automode'
import { useInfo } from './info/info'
import './AutoSwitch.css'

/**
 * The Auto mode switch, centered under the Effects card. It is not part of any section's config: it decides whether the
 * visualizer follows the song on its own, and (like Auto itself) turns off when the user takes over.
 */
export const AutoSwitch = (): React.ReactElement => {
  const info = useInfo()
  const on = useSyncExternalStore(autoMode.subscribe, autoMode.isEnabled)
  return (
    <div className='auto-switch'>
      <button
        type='button'
        className={`auto-switch-button${on ? ' auto-switch-button--on' : ''}`}
        aria-pressed={on}
        onClick={() => autoMode.setEnabled(!on)}
        {...info('Auto mode. While it is on, the kaleidoscope follows the song: mirrors build up through a buildup (stepping up as the snare roll goes quarters, eighths, sixteenths, when there is one; the Beat HUD shows the note value it hears), land big on a drop and settle, and go away in a groove or a break, switching on the beat. The green outlines in the config show what Auto is doing, and your settings stay as they are. It turns itself off when you change the kaleidoscope or pick a preset, and your settings come back. Click to turn it on again.')}
      >
        Auto
      </button>
    </div>
  )
}
