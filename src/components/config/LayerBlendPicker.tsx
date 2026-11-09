import React from 'react'
import classNames from 'classnames'
import './LayerBlendPicker.css'

import { useInfo } from './info/info'
import { BLEND_MODES, BlendMode } from '../../config/configDefaults'

const BLEND_MODE_LABELS: Record<BlendMode, string> = {
  mask: 'Mask',
  over: 'Over',
  screen: 'Screen',
  add: 'Add',
}

const BLEND_MODE_INFO: Record<BlendMode, string> = {
  mask: 'Blend: Mask. This layer shows only where the layers in front of it are dark',
  over: 'Blend: Over. Like Mask, but the layer also covers what is behind it wherever it is drawn',
  screen: 'Blend: Screen. Lightens what is behind it without hiding it, wherever it sits in the order',
  add: 'Blend: Add. Adds its light onto what is behind it, brighter and harsher than Screen, wherever it sits in the order',
}

const isBlendMode = (value: string): value is BlendMode => BLEND_MODES.some((mode) => mode === value)

type LayerBlendPickerProps = {
  title: string
  blendMode: BlendMode
  onChange: (blendMode: BlendMode) => void
  off?: boolean
  /** Sidebar: sits inside the header bar instead of above it. */
  inline?: boolean
}

/**
 * The layer's blend mode as a small dropdown: inside the header in the sidebar, and in the gap above it in the pop-out
 * (between the opacity readout and the reset button).
 */
export const LayerBlendPicker = React.memo(({ title, blendMode, onChange, off = false, inline = false }: LayerBlendPickerProps): React.ReactElement => {
  const info = useInfo()

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const { value } = event.target
    if (isBlendMode(value)) onChange(value)
  }

  return (
    <label className={classNames('layer-blend', { 'layer-blend--off': off, 'layer-blend--inline': inline })} {...info(BLEND_MODE_INFO[blendMode])}>
      <select className='layer-blend__select' aria-label={`${title} blend mode`} value={blendMode} onChange={handleChange}>
        {BLEND_MODES.map((mode) => (
          <option key={mode} value={mode}>{BLEND_MODE_LABELS[mode]}</option>
        ))}
      </select>
      <svg className='layer-blend__caret' viewBox='0 0 10 6' width='8' height='5' aria-hidden='true' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round'>
        <path d='M1 1l4 4 4-4' />
      </svg>
    </label>
  )
})
