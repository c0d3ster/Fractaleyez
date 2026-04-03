import React, { useState, useCallback } from 'react'
import { Row, Col } from 'react-bootstrap'
import './Presets.css'

import { connectConfig } from '../config/context/ConfigProvider'
import { PresetRetrieveEvent } from '../config/context/ConfigProvider'
import { presets } from '../../config/presets'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const presetsAny = presets as Record<string, any>

const toLabel = (name: string): string => name.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
const getPresetSprite = (name: string): string => presetsAny[name]?.particle?.sprites?.value?.[0] ?? 'fractaleye.png'

const PRESETS = Object.keys(presets).map(name => ({
  name,
  label: toLabel(name),
  pack: (presetsAny[name]?.pack ?? 'Other') as string,
}))

const PACKS = ['All', ...new Set(PRESETS.map(p => p.pack))]

type PresetsProps = {
  retrieveConfigPreset: (event: PresetRetrieveEvent) => Promise<void>
  expanded?: boolean
}

const PresetsInner = ({ retrieveConfigPreset, expanded = false }: PresetsProps): React.ReactElement => {
  const [activePack, setActivePack] = useState('All')
  const [page, setPage] = useState(0)
  const [paging, setPaging] = useState(false)

  const itemsPerPage = expanded ? 18 : 9
  const filtered = activePack === 'All' ? PRESETS : PRESETS.filter(p => p.pack === activePack)
  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const visible = filtered.slice(page * itemsPerPage, (page + 1) * itemsPerPage)

  const changePage = useCallback((next: number) => {
    setPaging(true)
    setTimeout(() => {
      setPage(next)
      setPaging(false)
    }, 150)
  }, [])

  const selectPack = (pack: string): void => {
    setActivePack(pack)
    setPage(0)
  }

  return (
    <Row>
      <Col className={`presets-container${expanded ? ' presets-container--expanded' : ''}`}>
        <div className='pack-tabs'>
          {PACKS.map(pack => (
            <button
              key={pack}
              className={`pack-tab${activePack === pack ? ' active' : ''}`}
              onClick={() => selectPack(pack)}
            >
              {pack}
            </button>
          ))}
        </div>
        <div className={`presets-grid${expanded ? ' presets-grid--expanded' : ''}${paging ? ' paging' : ''}`}>
          {visible.map(({ name, label }) => (
            <button
              key={name}
              className='preset-item'
              data-name={name}
              onClick={retrieveConfigPreset as React.MouseEventHandler<HTMLButtonElement>}
            >
              <img src={`/${getPresetSprite(name)}`} alt='' className='preset-sprite' />
              <span>{label}</span>
            </button>
          ))}
        </div>
        {totalPages > 1 && (
          <div className='presets-pagination'>
            <button
              className='pagination-arrow'
              onClick={() => changePage(page === 0 ? totalPages - 1 : page - 1)}
            >
              &#8592;
            </button>
            <span className='pagination-label'>{page + 1} / {totalPages}</span>
            <button
              className='pagination-arrow'
              onClick={() => changePage(page === totalPages - 1 ? 0 : page + 1)}
            >
              &#8594;
            </button>
          </div>
        )}
      </Col>
    </Row>
  )
}

export const Presets = connectConfig(PresetsInner)
