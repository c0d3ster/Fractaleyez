import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import './Presets.css'

import { connectConfig } from '../config/context/ConfigProvider'
import { PresetRetrieveEvent, PresetMeta, PackMeta } from '../config/context/ConfigProvider'
import { AppConfig } from '../../config/configDefaults'
import { presetSpriteSrc } from '../../utils/presetSpriteSrc'
import { resolveUserName } from '../../utils/userReference'
import { usePremiumTrial } from './usePremiumTrial'
import { PremiumTrialModal } from './PremiumTrialModal'

export type PresetSelection = { name: string; label: string; pack: string; isOwn: boolean }

/** Every pack a preset is listed under; a preset can be in several. */
const packsOf = ({ pack, packs }: PresetMeta): string[] => (packs?.length ? packs : pack ? [pack] : [])

type PresetsProps = {
  retrieveConfigPreset: (event: PresetRetrieveEvent) => Promise<void>
  revertConfig: (snapshot: AppConfig) => void
  config: AppConfig
  presets: PresetMeta[]
  packs?: PackMeta[]
  userSprite?: string
  userName?: string | null
  expanded?: boolean
  onSelect?: (preset: PresetSelection) => void
  onPackSelect?: (pack: string) => void
  headerActions?: React.ReactNode
}

const PresetsInner = ({ retrieveConfigPreset, revertConfig, config, presets, packs = [], userSprite, userName = null, expanded = false, onSelect, onPackSelect, headerActions }: PresetsProps): React.ReactElement => {
  const [activePack, setActivePack] = useState('All')
  const [page, setPage] = useState(0)
  const [paging, setPaging] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [trialPresetKey, setTrialPresetKey] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const packMap = useMemo(() => new Map(packs.map(p => [p.name, p])), [packs])

  const { startTrial, cancelTrial, modalVisible, trialPackName, secondsLeft, dismissTrial } = usePremiumTrial({
    config,
    revertConfig,
    retrieveConfigPreset,
  })

  // Marks a preset premium when every pack it is in is premium. This is only a label: it never decides access.
  const isPremiumPreset = useCallback((preset: PresetMeta): boolean => {
    const names = packsOf(preset)
    return names.length > 0 && names.every(name => packMap.get(name)?.isPremium)
  }, [packMap])

  // A preset loads if any pack it is in is free or the viewer is entitled to it; otherwise it is gated behind the first of its (premium) packs.
  const lockingPack = useCallback((preset: PresetMeta): string | null => {
    const names = packsOf(preset)
    if (!names.length || names.some(name => !packMap.get(name)?.isPremium || packMap.get(name)?.isEntitled)) return null
    return names[0] ?? null
  }, [packMap])

  const packNames = ['All', ...new Set(presets.flatMap(packsOf))]
  const itemsPerPage = expanded ? 18 : 9
  const filtered = activePack === 'All' ? presets : presets.filter(p => packsOf(p).includes(activePack))
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
    setPreviewMode(false)
    onPackSelect?.(pack === 'All' ? '' : pack)
  }

  const handlePresetClick = useCallback((preset: PresetMeta, event: PresetRetrieveEvent): void => {
    const locked = lockingPack(preset)
    if (locked) {
      setTrialPresetKey(preset.id ?? preset.name)
      startTrial(locked, event)
    } else {
      cancelTrial()
      setTrialPresetKey(null)
      void retrieveConfigPreset(event)
    }
    onSelect?.({ name: preset.name, label: preset.label, pack: preset.pack, isOwn: preset.isOwn })
  }, [lockingPack, startTrial, cancelTrial, retrieveConfigPreset, onSelect])

  useEffect(() => {
    // Popped-out config windows render this component into a separate window.open()
    // document, so the listener must attach to that document rather than the global
    // one or hotkeys silently do nothing there.
    const ownerDocument = containerRef.current?.ownerDocument ?? document
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (ownerDocument.activeElement?.tagName === 'INPUT') return
      if (e.repeat) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (modalVisible) return
      const activeMeta = packMap.get(activePack)
      if (activeMeta?.isPremium && !activeMeta.isEntitled && !previewMode) return
      const hotkeyIndex = Number(e.key) - 1
      if (!Number.isInteger(hotkeyIndex) || hotkeyIndex < 0 || hotkeyIndex > 8) return
      const preset = visible[hotkeyIndex]
      if (!preset) return
      const event: PresetRetrieveEvent = {
        currentTarget: { dataset: { name: String(preset.name), id: preset.id ?? '' } },
      }
      handlePresetClick(preset, event)
    }
    ownerDocument.addEventListener('keydown', handleKeyDown)
    return () => ownerDocument.removeEventListener('keydown', handleKeyDown)
  }, [visible, activePack, previewMode, modalVisible, packMap, handlePresetClick])

  return (
    <>
      <div className={`flow-root${expanded ? ' -mx-[15px]' : ''}`}>
        <div className={`presets-container${expanded ? ' presets-container--expanded' : ''}`}>
          <div ref={containerRef} className='pack-tabs-row'>
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
                    {isPremium && <span className='premium-ring' aria-hidden />}
                    {resolveUserName(pack, userName)}
                  </button>
                )
              })}
            </div>
            {headerActions}
          </div>
          <div className='presets-grid-wrap'>
            {(() => {
              const activeMeta = packMap.get(activePack)
              return activeMeta?.isPremium && !activeMeta.isEntitled && !previewMode ? (
                <div className='pack-premium-overlay'>
                  <span className='pack-premium-overlay-label'>✦ Premium</span>
                  <button className='pack-premium-overlay-btn' onClick={() => setPreviewMode(true)}>Preview</button>
                </div>
              ) : null
            })()}
            <div className={`presets-grid${expanded ? ' presets-grid--expanded' : ''}${paging ? ' paging' : ''}`}>
              {visible.map((preset, index) => {
                const { id, name, label, sprite } = preset
                const event: PresetRetrieveEvent = {
                  currentTarget: { dataset: { name: String(name), id: id ?? '' } },
                }
                const isTrialing = trialPresetKey === (id ?? name) && secondsLeft !== null
                const isPremium = isPremiumPreset(preset)
                const hotkey = index < 9 ? index + 1 : null
                return (
                  <button
                    key={id ?? name}
                    className={`preset-item${isPremium ? ' preset-item--premium' : ''}`}
                    data-name={name}
                    data-id={id ?? ''}
                    onClick={() => handlePresetClick(preset, event)}
                  >
                    {isPremium && <span className='premium-ring' aria-hidden />}
                    {hotkey !== null && (
                      <span className='preset-hotkey-badge'>
                        <span className='preset-hotkey-badge-num'>{hotkey}</span>
                      </span>
                    )}
                    <img src={presetSpriteSrc(sprite, userSprite)} alt='' className='preset-sprite' />
                    <span>{resolveUserName(label, userName)}</span>
                    {isTrialing && <span className='preset-trial-countdown'>{secondsLeft}</span>}
                  </button>
                )
              })}
            </div>
          </div>
          <div className={`presets-pagination${totalPages > 1 ? '' : ' presets-pagination--hidden'}`}>
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
        </div>
      </div>
      {modalVisible && (
        <PremiumTrialModal packName={resolveUserName(trialPackName, userName)} onDismiss={dismissTrial} />
      )}
    </>
  )
}

export const Presets = connectConfig(PresetsInner)
