import React, { useCallback } from 'react'
import './PalettePicker.css'

import { connectConfig, ConfigContextValue } from './context/ConfigProvider'
import { AppConfig } from '../../config/configDefaults'
import { colorConfig } from '../../config/color.config'
import { CUSTOM_PALETTE, PALETTES, RAINBOW_PALETTE } from '../../config/palettes'

type PalettePickerProps = {
  config: AppConfig
  updateColorList: ConfigContextValue['updateColorList']
}

type Choice = {
  id: string
  label: string
  gradient: string
}

const RAINBOW_GRADIENT = 'linear-gradient(to right, hsl(0, 100%, 50%), hsl(60, 100%, 50%), hsl(120, 100%, 50%), hsl(180, 100%, 50%), hsl(240, 100%, 50%), hsl(300, 100%, 50%), hsl(360, 100%, 50%))'

const stopsGradient = (stops: readonly string[]): string => `linear-gradient(to right, ${stops.join(', ')})`

const PalettePickerInner = ({ config, updateColorList }: PalettePickerProps): React.ReactElement => {
  const { palette, customStops } = config.color
  const selected = palette.value[0] ?? RAINBOW_PALETTE
  const stops = customStops.value

  const choices: Choice[] = [
    { id: RAINBOW_PALETTE, label: 'Rainbow', gradient: RAINBOW_GRADIENT },
    ...PALETTES.map(({ id, label, stops: paletteStops }) => ({ id, label, gradient: stopsGradient(paletteStops) })),
    { id: CUSTOM_PALETTE, label: 'Custom', gradient: stopsGradient(stops.length > 1 ? stops : [...stops, ...stops, '#000000']) },
  ]

  const choose = useCallback((id: string): void => updateColorList('palette', [id]), [updateColorList])

  const changeStop = useCallback((index: number, color: string): void => {
    updateColorList('customStops', stops.map((stop, i) => (i === index ? color : stop)))
  }, [stops, updateColorList])

  const removeStop = useCallback((index: number): void => {
    if (stops.length <= colorConfig.customStops_MIN) return
    updateColorList('customStops', stops.filter((_, i) => i !== index))
  }, [stops, updateColorList])

  const addStop = useCallback((): void => {
    if (stops.length >= colorConfig.customStops_MAX) return
    updateColorList('customStops', [...stops, stops[stops.length - 1] ?? '#ffffff'])
  }, [stops, updateColorList])

  return (
    <div className='palette-picker'>
      <div className='palette-picker__grid'>
        {choices.map(({ id, label, gradient }) => (
          <button
            key={id}
            type='button'
            className={`palette-picker__choice${id === selected ? ' palette-picker__choice--selected' : ''}`}
            aria-pressed={id === selected}
            onClick={() => choose(id)}
          >
            <span className='palette-picker__swatch' style={{ background: gradient }} />
            <span className='palette-picker__name'>{label}</span>
          </button>
        ))}
      </div>
      {selected === CUSTOM_PALETTE && (
        <div className='palette-picker__stops'>
          {stops.map((stop, index) => (
            // Stops are positional, so the index is their identity.
            <span className='palette-picker__stop' key={index}>
              <input
                type='color'
                value={stop}
                aria-label={`Color ${index + 1}`}
                onChange={(event) => changeStop(index, event.target.value)}
              />
              {stops.length > colorConfig.customStops_MIN && (
                <button type='button' className='palette-picker__stop-remove' aria-label={`Remove color ${index + 1}`} onClick={() => removeStop(index)}>×</button>
              )}
            </span>
          ))}
          {stops.length < colorConfig.customStops_MAX && (
            <button type='button' className='palette-picker__stop-add' aria-label='Add color' onClick={addStop}>+</button>
          )}
        </div>
      )}
    </div>
  )
}

/** The palette choices (rainbow, named palettes, custom) with the custom palette's color editor. */
export const PalettePicker = connectConfig(PalettePickerInner)
