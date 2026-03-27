import React, { useState, useCallback } from 'react'
import { Row, Col } from 'react-bootstrap'
import './Presets.css'

import { connectConfig } from '../config/context/ConfigProvider'
import { presets } from '../../config/presets'

const toLabel = (name) => name.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
const getPresetSprite = (name) => presets[name]?.particle?.sprites?.value?.[0] ?? 'fractaleye.png'

const PRESETS = Object.keys(presets).map(name => ({
  name,
  label: toLabel(name),
  pack: presets[name]?.pack ?? 'Other',
}))

const PACKS = ['All', ...new Set(PRESETS.map(p => p.pack))]

const Presets = ({ retrieveConfigPreset, expanded = false }) => {
  const [activePack, setActivePack] = useState('All')
  const [page, setPage] = useState(0)
  const [paging, setPaging] = useState(false)

  const itemsPerPage = expanded ? 18 : 9
  const filtered = activePack === 'All' ? PRESETS : PRESETS.filter(p => p.pack === activePack)
  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const visible = filtered.slice(page * itemsPerPage, (page + 1) * itemsPerPage)

  const changePage = useCallback((next) => {
    setPaging(true)
    setTimeout(() => {
      setPage(next)
      setPaging(false)
    }, 150)
  }, [])

  const selectPack = (pack) => {
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
              onClick={retrieveConfigPreset}
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

export default connectConfig(Presets)
