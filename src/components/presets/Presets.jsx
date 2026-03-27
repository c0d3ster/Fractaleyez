import React, { useState, useCallback } from 'react'
import { Row, Col } from 'react-bootstrap'
import './Presets.css'

import { connectConfig } from '../config/context/ConfigProvider'
import { presets } from '../../config/presets'

const PRESETS = [
  // Essentials
  { name: 'default',              label: 'Default',               pack: 'Essentials' },
  { name: 'kaiber',               label: 'Kaiber',                pack: 'Essentials' },
  { name: 'edgeChaseSpin',        label: 'Edge Chase Spin',       pack: 'Essentials' },
  { name: 'crossheirSpin',        label: 'Crossheir Spin',        pack: 'Essentials' },
  { name: 'eyeChase',             label: 'Eye Chase',             pack: 'Essentials' },
  { name: 'sideSwirl',            label: 'Side Swirl',            pack: 'Essentials' },
  { name: 'circles',              label: 'Circles',               pack: 'Essentials' },
  { name: 'notes',                label: 'Notes',                 pack: 'Essentials' },
  { name: 'noteExplosion',        label: 'Note Explosion',        pack: 'Essentials' },
  { name: 'weed',                 label: 'Weed',                  pack: 'Essentials' },
  { name: 'honeycomb',            label: 'Honeycomb',             pack: 'Essentials' },
  { name: 'blackout',             label: 'Blackout',              pack: 'Essentials' },
  // Galaxy
  { name: 'galaxySpace',          label: 'Galaxy Space',          pack: 'Galaxy' },
  { name: 'galaxySalad',          label: 'Galaxy Salad',          pack: 'Galaxy' },
  { name: 'galaxyPortal',         label: 'Galaxy Portal',         pack: 'Galaxy' },
  { name: 'galaxySpiral',         label: 'Galaxy Spiral',         pack: 'Galaxy' },
  // Emorfik
  { name: 'emorfik',              label: 'Emorfik',               pack: 'Emorfik' },
  { name: 'emorfikIntroJumpy',    label: 'Emorfik Intro Jumpy',   pack: 'Emorfik' },
  { name: 'emorfikZombieWave',    label: 'Emorfik Zombie Wave',   pack: 'Emorfik' },
  { name: 'emorfikWireWhite',     label: 'Emorfik Wire White',    pack: 'Emorfik' },
  { name: 'emorfikWire',          label: 'Emorfik Wire',          pack: 'Emorfik' },
  { name: 'emorfikWireLogo',      label: 'Emorfik Wire Logo',     pack: 'Emorfik' },
  { name: 'emorfikFire',          label: 'Emorfik Fire',          pack: 'Emorfik' },
  { name: 'emorfikSkull',         label: 'Emorfik Skull',         pack: 'Emorfik' },
  { name: 'emorfikSkullVid',      label: 'Emorfik Skull Vid',     pack: 'Emorfik' },
  { name: 'hyperEmorfik',         label: 'Hyper Emorfik',         pack: 'Emorfik' },
  { name: 'emorfikSpin',          label: 'Emorfik Spin',          pack: 'Emorfik' },
  { name: 'emorfikSaladColor',    label: 'Emorfik Salad Color',   pack: 'Emorfik' },
  { name: 'emorfikSalad',         label: 'Emorfik Salad',         pack: 'Emorfik' },
  // Sacred
  { name: 'squareMandala',        label: 'Square Mandala',        pack: 'Sacred' },
  { name: 'pointerz',             label: 'Pointerz',              pack: 'Sacred' },
  { name: 'colorPortal',          label: 'Color Portal',          pack: 'Sacred' },
  { name: 'dispersionTunnelSpin', label: 'Dispersion Tunnel Spin', pack: 'Sacred' },
  // Sprites
  { name: 'choppingHands',        label: 'Chopping Hands',        pack: 'Sprites' },
  { name: 'choppingMen',          label: 'Chopping Men',          pack: 'Sprites' },
  { name: 'ohSprite',             label: 'Oh Sprite',             pack: 'Sprites' },
  { name: 'slimeHands',           label: 'Slime Hands',           pack: 'Sprites' },
  { name: 'garbageMan',           label: 'Garbage Man',           pack: 'Sprites' },
  { name: 'garbageMonsters',      label: 'Garbage Monsters',      pack: 'Sprites' },
  // Elemental
  { name: 'fire',                 label: 'Fire',                  pack: 'Elemental' },
]

const PACKS = ['All', 'Essentials', 'Galaxy', 'Emorfik', 'Sacred', 'Sprites', 'Elemental']
const getPresetSprite = (name) => presets[name]?.particle?.sprites?.value?.[0] ?? 'fractaleye.png'

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

export { PRESETS }
export default connectConfig(Presets)
