import React, { useCallback, useLayoutEffect, useRef, useState } from 'react'

import { type AppConfig, type ConfigItem, configDefaults } from '../../config/configDefaults'
import { ConfigSectionItems, formatSliderValue } from '../config/ConfigSectionItems'
import { useConfigContext } from '../config/context/ConfigProvider'
import { shallowEqual } from '../config/context/configStore'
import { useConfigSelector } from '../config/context/useConfigSelector'
import { type OneSliderSet, resolveOneSliderItem } from './layerPages'
import { scrollLeftToShow } from './menuSheetState'

// The one-slider pattern (docs/mobile-design/OrbitShape.html, OrbitParticles.html): a sideways row of buttons, each a setting's name
// and value, and one large slider under them for the selected one. The slider is the section's own row from ConfigSectionItems
// (`only` the selected item), so the particle load zones, the red-zone confirmation, the ghost thumb and the double-tap reset
// are the desktop's, not a copy of them.

const BUTTON_MARGIN_PX = 16

type OneSliderSectionProps = OneSliderSet

type SectionValues = Record<string, number>

/** A setting's name, which no preset changes. */
const nameOf = (section: OneSliderSet['section'], item: string): string =>
  (configDefaults[section] as unknown as Record<string, ConfigItem>)[item]?.name ?? item

export const OneSliderSection = ({ section, items, label }: OneSliderSectionProps): React.ReactElement => {
  const { updateConfigItem } = useConfigContext()
  const [picked, setPicked] = useState<string | null>(null)
  const selected = resolveOneSliderItem(items, picked)
  const rowRef = useRef<HTMLDivElement>(null)

  // Only the values the buttons show, so a slider elsewhere does not render this row again.
  const selectValues = useCallback((config: AppConfig): SectionValues => {
    const sectionItems = config[section] as unknown as Record<string, ConfigItem>
    return Object.fromEntries(items.map((item) => [item, Number(sectionItems[item]?.value ?? 0)]))
  }, [section, items])
  const values = useConfigSelector(selectValues, shallowEqual)

  // The selected button is always fully in view; the row runs out under the sheet's right edge.
  useLayoutEffect(() => {
    const row = rowRef.current
    const button = row?.querySelector<HTMLElement>(`[data-one-slider-item="${selected}"]`)
    if (!row || !button) return
    const left = scrollLeftToShow({ scrollLeft: row.scrollLeft, viewWidth: row.clientWidth, left: button.offsetLeft, width: button.offsetWidth }, BUTTON_MARGIN_PX)
    if (left !== row.scrollLeft) row.scrollTo({ left, behavior: 'smooth' })
  }, [selected])

  return (
    <div className='one-slider' data-one-slider={section}>
      <div ref={rowRef} className='one-slider__row' role='tablist' aria-label={label}>
        {items.map((item) => (
          <button
            key={item}
            type='button'
            role='tab'
            className='one-slider__button'
            aria-selected={item === selected}
            data-one-slider-item={item}
            onClick={() => setPicked(item)}
          >
            <span className='one-slider__name'>{nameOf(section, item)}</span>
            <span className='one-slider__value'>{formatSliderValue(item, values[item] ?? 0)}</span>
          </button>
        ))}
      </div>
      <div className='sheet-slider' role='tabpanel'>
        <ConfigSectionItems name={section} only={[selected]} noDials onChange={updateConfigItem} />
      </div>
    </div>
  )
}
