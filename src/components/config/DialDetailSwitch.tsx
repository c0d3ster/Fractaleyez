import React from 'react'

import { DialDetail } from '../../config/quality.config'
import { pickDialDetail } from './useDialDetail'

type Option = { label: string, level: DialDetail | null, description: string }

const OPTIONS: readonly Option[] = [
  { label: 'Auto', level: null, description: 'Follows the quality tier, which is Stepped, except in the Horizontal and Vertical kaleidoscope modes, which draw Mini.' },
  { label: 'Mini', level: 'mini', description: 'Bare dots, turned and kicked from a 10 per second timer, with no mirrored strips. Lightest on the video.' },
  { label: 'Stepped', level: 'stepped', description: 'The full galaxy, animated in steps, so the window only redraws when a step changes. The strip modes still draw Mini.' },
  { label: 'Full', level: 'full', description: 'The full galaxy, animating on every display frame. This one makes the video stutter.' },
]

type DialDetailSwitchProps = {
  /** The level picked by hand, or null while the quality tier's is used. */
  picked: DialDetail | null
}

/** How much the dial above animates: it costs the video smoothness in proportion to how often the window redraws. */
export const DialDetailSwitch = React.memo(({ picked }: DialDetailSwitchProps): React.ReactElement => (
  <div className='dial-detail-switch' role='group' aria-label='Dial detail'>
    {OPTIONS.map(({ label, level, description }) => (
      <button
        key={label}
        type='button'
        className={`dial-detail-option${picked === level ? ' dial-detail-option--on' : ''}`}
        title={`${label}: ${description}`}
        aria-pressed={picked === level}
        onClick={() => pickDialDetail(level)}
      >
        {label}
      </button>
    ))}
  </div>
))
