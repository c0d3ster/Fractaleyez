import React, { useState, useCallback, useEffect } from 'react'
import axios from 'axios'
import { Row, Col } from 'react-bootstrap'
import './Presets.css'

import { connectConfig } from '../config/context/ConfigProvider'
import { PresetRetrieveEvent } from '../config/context/ConfigProvider'
import { presets as bundledPresets } from '../../config/presets'

type PresetMeta = {
  name: string
  label: string
  pack: string
  sprite: string
  userId?: string
}

type ApiPreset = {
  name: string
  pack: string
  sprite: string
  userId?: string
}

const toLabel = (name: string): string => name.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())

export type PresetSelection = { name: string; label: string; pack: string; isOwn: boolean }

type PresetsProps = {
  retrieveConfigPreset: (event: PresetRetrieveEvent) => Promise<void>
  currentUserId?: string | null
  expanded?: boolean
  onSelect?: (preset: PresetSelection) => void
  onPackSelect?: (pack: string) => void
  headerActions?: React.ReactNode
}

const PresetsInner = ({ retrieveConfigPreset, currentUserId, expanded = false, onSelect, onPackSelect, headerActions }: PresetsProps): React.ReactElement => {
  const [presets, setPresets] = useState<PresetMeta[]>([])
  const [activePack, setActivePack] = useState('All')
  const [page, setPage] = useState(0)
  const [paging, setPaging] = useState(false)

  useEffect(() => {
    axios.get<ApiPreset[]>('/api/getPresets')
      .then(({ data }) => setPresets(data.map(p => ({ ...p, label: toLabel(p.name), userId: p.userId }))))
      .catch(err => {
        console.error('Failed to load presets from API, falling back to bundled', err)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bundled = Object.entries(bundledPresets).map(([name, data]: [string, any]) => ({
          name,
          label: toLabel(name),
          pack: (data.pack ?? '') as string,
          sprite: (data.particle?.sprites?.value?.[0] ?? 'fractaleye.png') as string,
        }))
        setPresets(bundled)
      })
  }, [])

  const packs = ['All', ...new Set(presets.map(p => p.pack))]
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
          {visible.map(({ name, label, sprite, pack, userId }) => (
            <button
              key={name}
              className='preset-item'
              data-name={name}
              onClick={(e) => {
                retrieveConfigPreset(e as unknown as PresetRetrieveEvent)
                const isOwn = !!currentUserId && currentUserId === userId
                onSelect?.({ name, label, pack, isOwn })
              }}
            >
              <img src={`/${sprite}`} alt='' className='preset-sprite' />
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
