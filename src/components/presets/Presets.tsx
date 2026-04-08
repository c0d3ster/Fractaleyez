import React, { useState, useCallback } from 'react'
import { Row, Col } from 'react-bootstrap'
import './Presets.css'

import { connectConfig } from '../config/context/ConfigProvider'
import { PresetRetrieveEvent, PresetMeta } from '../config/context/ConfigProvider'

export type PresetSelection = { name: string; label: string; pack: string; isOwn: boolean }

/** Public path like `sprites/foo.png`, or inlined `data:image/...` from saved presets */
function presetSpriteSrc(sprite: string): string {
  if (!sprite) return '/fractaleye.png'
  if (
    sprite.startsWith('data:') ||
    sprite.startsWith('blob:') ||
    sprite.startsWith('http://') ||
    sprite.startsWith('https://')
  ) {
    return sprite
  }
  return sprite.startsWith('/') ? sprite : `/${sprite}`
}

type PresetsProps = {
  retrieveConfigPreset: (event: PresetRetrieveEvent) => Promise<void>
  presets: PresetMeta[]
  expanded?: boolean
  onSelect?: (preset: PresetSelection) => void
  onPackSelect?: (pack: string) => void
  headerActions?: React.ReactNode
}

const PresetsInner = ({ retrieveConfigPreset, presets, expanded = false, onSelect, onPackSelect, headerActions }: PresetsProps): React.ReactElement => {
  const [activePack, setActivePack] = useState('All')
  const [page, setPage] = useState(0)
  const [paging, setPaging] = useState(false)

  const packs = ['All', ...new Set(presets.map(p => p.pack).filter(Boolean))]
  const itemsPerPage = expanded ? 18 : 9
  const filtered = activePack === 'All' ? presets : presets.filter(p => p.pack === activePack)
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
    onPackSelect?.(pack === 'All' ? '' : pack)
  }

  return (
    <Row>
      <Col className={`presets-container${expanded ? ' presets-container--expanded' : ''}`}>
        <div className='pack-tabs-row'>
          <div className='pack-tabs'>
            {packs.map(pack => (
              <button
                key={pack}
                className={`pack-tab${activePack === pack ? ' active' : ''}`}
                onClick={() => selectPack(pack)}
              >
                {pack}
              </button>
            ))}
          </div>
          {headerActions}
        </div>
        <div className={`presets-grid${expanded ? ' presets-grid--expanded' : ''}${paging ? ' paging' : ''}`}>
          {visible.map(({ id, name, label, sprite, pack, isOwn }) => (
            <button
              key={id ?? name}
              className='preset-item'
              data-name={name}
              data-id={id ?? ''}
              onClick={() => {
                void retrieveConfigPreset({
                  currentTarget: { dataset: { name: String(name), id: id ?? '' } },
                } as PresetRetrieveEvent)
                onSelect?.({ name, label, pack, isOwn })
              }}
            >
              <img src={presetSpriteSrc(sprite)} alt='' className='preset-sprite' />
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
