import React, { useCallback, useState } from 'react'
import './PalettePicker.css'

import { connectConfig, ConfigContextValue } from './context/ConfigProvider'
import { AppConfig } from '../../config/configDefaults'
import { colorConfig } from '../../config/color.config'
import { CUSTOM_PALETTE, PALETTE_BY_ID, PALETTES, RAINBOW_PALETTE } from '../../config/palettes'

type PalettePickerProps = {
  config: AppConfig
  updateConfigItem: ConfigContextValue['updateConfigItem']
  updateColorList: ConfigContextValue['updateColorList']
}

type Choice = {
  id: string
  label: string
  gradient: string
}

const PALETTES_PER_PAGE = 6
const PALETTE_COLUMNS = 2
// Every page reserves the rows of a full one (the last page is shorter), so opening the grid or turning the page never moves what is below it.
const GRID_ROWS = `repeat(${PALETTES_PER_PAGE / PALETTE_COLUMNS}, minmax(45px, auto))`

const stopsGradient = (stops: readonly string[]): string => `linear-gradient(to right, ${stops.join(', ')})`

const PALETTE_IDS = [...PALETTES.map(({ id }) => id), CUSTOM_PALETTE]
const PAGE_COUNT = Math.ceil(PALETTE_IDS.length / PALETTES_PER_PAGE)

const PalettePickerInner = ({ config, updateConfigItem, updateColorList }: PalettePickerProps): React.ReactElement => {
  const { palette, customStops } = config.color
  const selected = palette.value[0] ?? RAINBOW_PALETTE
  const stops = customStops.value

  // Collapsed to the current palette to save room; opens onto the page holding it.
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(() => Math.floor(Math.max(0, PALETTE_IDS.indexOf(selected)) / PALETTES_PER_PAGE))

  const choices: Choice[] = [
    ...PALETTES.map(({ id, label, stops: paletteStops }) => ({ id, label, gradient: stopsGradient(paletteStops) })),
    { id: CUSTOM_PALETTE, label: 'Custom', gradient: stopsGradient(stops.length > 1 ? stops : [...stops, ...stops, '#000000']) },
  ]
  const visible = choices.slice(page * PALETTES_PER_PAGE, (page + 1) * PALETTES_PER_PAGE)
  const selectedChoice = choices.find(({ id }) => id === selected) ?? choices[0]
  const toggleOpen = useCallback((): void => setOpen((isOpen) => !isOpen), [])

  // A one-way ramp only loops cleanly played out and back, so picking one turns Mirror on (it can still be turned off).
  const choose = useCallback((id: string): void => {
    if (id === selected) return
    updateColorList('palette', [id])
    const chosen = PALETTE_BY_ID[id]
    if (chosen) updateConfigItem('color', 'paletteMirror', !chosen.cyclic)
  }, [selected, updateColorList, updateConfigItem])
  const previousPage = useCallback((): void => setPage((current) => Math.max(0, current - 1)), [])
  const nextPage = useCallback((): void => setPage((current) => Math.min(PAGE_COUNT - 1, current + 1)), [])

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
      <button type='button' className='palette-picker__current' aria-expanded={open} onClick={toggleOpen}>
        <span className='palette-picker__swatch palette-picker__swatch--current' style={{ background: selectedChoice?.gradient }} />
        <span className='palette-picker__current-name'>{selectedChoice?.label}</span>
        <span className='palette-picker__chevron'>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className='palette-picker__grid' style={{ gridTemplateRows: GRID_ROWS }}>
          {visible.map(({ id, label, gradient }) => (
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
      )}
      {open && (
        <div className='palette-picker__pager'>
          <button type='button' aria-label='Previous palettes' disabled={page === 0} onClick={previousPage}>←</button>
          <span>{page + 1}/{PAGE_COUNT}</span>
          <button type='button' aria-label='Next palettes' disabled={page === PAGE_COUNT - 1} onClick={nextPage}>→</button>
        </div>
      )}
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

/** The palette choices (rainbow, named palettes, custom), eight to a page, with the custom palette's color editor. */
export const PalettePicker = connectConfig(PalettePickerInner)
