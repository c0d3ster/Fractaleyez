import React, { useState, useCallback } from 'react'
import { Row, Col } from 'react-bootstrap'
import './Presets.css'

import { connectConfig } from '../config/context/ConfigProvider'
import { PresetRetrieveEvent, PresetMeta, PackMeta } from '../config/context/ConfigProvider'
import { AppConfig } from '../../config/configDefaults'
import { presetSpriteSrc } from '../../utils/presetSpriteSrc'
import { usePremiumTrial } from './usePremiumTrial'
import { PremiumTrialModal } from './PremiumTrialModal'

export type PresetSelection = { name: string; label: string; pack: string; isOwn: boolean }

type PresetsProps = {
  retrieveConfigPreset: (event: PresetRetrieveEvent) => Promise<void>
  revertConfig: (snapshot: AppConfig) => void
  config: AppConfig
  presets: PresetMeta[]
  packs?: PackMeta[]
  expanded?: boolean
  onSelect?: (preset: PresetSelection) => void
  onPackSelect?: (pack: string) => void
  headerActions?: React.ReactNode
}

const PresetsInner = ({ retrieveConfigPreset, revertConfig, config, presets, packs = [], expanded = false, onSelect, onPackSelect, headerActions }: PresetsProps): React.ReactElement => {
  const [activePack, setActivePack] = useState('All')
  const [page, setPage] = useState(0)
  const [paging, setPaging] = useState(false)

  const packMap = new Map(packs.map(p => [p.name, p]))

  const { startTrial, modalVisible, trialPackName, dismissTrial } = usePremiumTrial({
    config,
    revertConfig,
    retrieveConfigPreset,
  })

  const packNames = ['All', ...new Set(presets.map(p => p.pack).filter(Boolean))]
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

  const handlePresetClick = (preset: PresetMeta, event: PresetRetrieveEvent): void => {
    const packMeta = packMap.get(preset.pack)
    if (packMeta?.isPremium && !packMeta.isOwn) {
      startTrial(preset.pack, event)
    } else {
      void retrieveConfigPreset(event)
    }
    onSelect?.({ name: preset.name, label: preset.label, pack: preset.pack, isOwn: preset.isOwn })
  }

  return (
    <>
      <Row>
        <Col className={`presets-container${expanded ? ' presets-container--expanded' : ''}`}>
          <div className='pack-tabs-row'>
            <div className='pack-tabs'>
              {packNames.map(pack => {
                const meta = packMap.get(pack)
                const isPremium = meta?.isPremium ?? false
                return (
                  <button
                    key={pack}
                    className={`pack-tab${activePack === pack ? ' active' : ''}${isPremium ? ' pack-tab--premium' : ''}`}
                    onClick={() => selectPack(pack)}
                  >
                    {pack}
                  </button>
                )
              })}
            </div>
            {headerActions}
          </div>
          <div className={`presets-grid${expanded ? ' presets-grid--expanded' : ''}${paging ? ' paging' : ''}`}>
            {visible.map((preset) => {
              const { id, name, label, sprite } = preset
              const event: PresetRetrieveEvent = {
                currentTarget: { dataset: { name: String(name), id: id ?? '' } },
              }
              return (
                <button
                  key={id ?? name}
                  className='preset-item'
                  data-name={name}
                  data-id={id ?? ''}
                  onClick={() => handlePresetClick(preset, event)}
                >
                  <img src={presetSpriteSrc(sprite)} alt='' className='preset-sprite' />
                  <span>{label}</span>
                </button>
              )
            })}
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
      {modalVisible && (
        <PremiumTrialModal packName={trialPackName} onDismiss={dismissTrial} />
      )}
    </>
  )
}

export const Presets = connectConfig(PresetsInner)
