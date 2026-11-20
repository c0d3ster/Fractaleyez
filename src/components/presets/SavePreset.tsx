import React, { useState, useContext, useCallback, useEffect, useMemo, useRef } from 'react'
import { useInfo } from '../config/info/info'
import { ConfigContext } from '../config/context/ConfigProvider'
import { PresetSelection } from './Presets'
import { useUpgrade } from '../upgrade/UpgradeProvider'
import { PREMIUM_PREVIEW_MESSAGE, hasRoomFor, isPremiumPreviewRefusal, isQuotaExceeded, quotaMessage } from '../../config/plans.config'
import { previewLock } from './previewLock'

type SavePresetProps = {
  prefill?: PresetSelection | null
  onSaved?: () => void
}

export const SavePreset = ({ prefill, onSaved }: SavePresetProps): React.ReactElement | null => {
  const info = useInfo()
  const context = useContext(ConfigContext)
  const { requestUpgrade } = useUpgrade()
  const packInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [pack, setPack] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'confirm' | 'saved' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (prefill) {
      setName(prefill.label || prefill.name)
      setPack(prefill.pack)
      setStatus('idle')
      setErrorMessage('')
    }
  }, [prefill])

  const systemPacks = useMemo(
    () =>
      new Set(
        context?.presets.filter(p => !p.isOwn).map(p => p.pack).filter(Boolean) ?? []
      ),
    [context?.presets]
  )

  const packTrimmed = pack.trim()
  const packReserved = packTrimmed.length > 0 && systemPacks.has(packTrimmed)

  // Overwriting one of the viewer's own presets is always allowed (the server agrees); only a new name needs room in the plan.
  const nameTrimmed = name.trim()
  const isOverwrite = useMemo(
    () => !!nameTrimmed && (context?.presets.some(p => p.isOwn && p.name === nameTrimmed) ?? false),
    [context?.presets, nameTrimmed],
  )
  const entitlements = context?.entitlements ?? null
  const usage = context?.usage ?? null
  const atLimit = !isOverwrite && !hasRoomFor(entitlements, usage, 'savedPresets')
  const limitMessage = atLimit && entitlements
    ? quotaMessage({ quota: 'savedPresets', limit: entitlements.quotas.savedPresets ?? 0, plan: entitlements.plan })
    : ''

  const selectReservedPackText = useCallback((el: HTMLInputElement): void => {
    if (!packReserved) return
    requestAnimationFrame(() => {
      el.select()
    })
  }, [packReserved])

  const handleSave = useCallback(async (force = false) => {
    if (!name.trim() || !context) return
    if (systemPacks.has(packTrimmed)) {
      return
    }
    if (atLimit) {
      requestUpgrade(limitMessage)
      return
    }
    // The server would refuse it (premium_preview); no need to ask.
    if (previewLock.isLocked()) {
      requestUpgrade(PREMIUM_PREVIEW_MESSAGE)
      return
    }
    setStatus('saving')
    try {
      await context.savePreset(name.trim(), pack.trim(), force)
      setStatus('saved')
      onSaved?.()
      setTimeout(() => setStatus('idle'), 2000)
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any
      const httpStatus = e?.response?.status
      console.error('savePreset failed', httpStatus, err)
      if (httpStatus === 409) {
        setStatus('confirm')
      } else if (httpStatus === 403 && isQuotaExceeded(e?.response?.data)) {
        // The plan changed elsewhere, or the count was stale: re-read it and offer the upgrade.
        setStatus('idle')
        context.refreshAccount()
        requestUpgrade(quotaMessage(e.response.data))
      } else if (httpStatus === 403 && isPremiumPreviewRefusal(e?.response?.data)) {
        setStatus('idle')
        requestUpgrade(PREMIUM_PREVIEW_MESSAGE)
      } else {
        const msg = e?.response?.data?.error ?? `Error (${httpStatus ?? 'network'})`
        setErrorMessage(msg)
        setStatus('error')
        setTimeout(() => setStatus('idle'), 3000)
      }
    }
  }, [name, pack, packTrimmed, context, onSaved, systemPacks, atLimit, limitMessage, requestUpgrade])

  if (!context?.isSignedIn) return null

  const statusMessage = status === 'saved' ? 'Saved!' : status === 'error' ? errorMessage : ''

  return (
    <div className='save-preset-wrapper'>
      <div className='save-preset'>
        <input
          ref={packInputRef}
          className={`save-preset-input save-preset-input--pack${packReserved ? ' save-preset-input--pack-reserved' : ''}`}
          type='text'
          placeholder='Pack'
          value={pack}
          onChange={(e) => setPack(e.target.value)}
          {...info(packReserved ? 'Built-in presets use this pack name — choose another' : undefined)}
          onFocus={(e) => selectReservedPackText(e.currentTarget)}
          onClick={(e) => selectReservedPackText(e.currentTarget)}
          disabled={status === 'saving'}
          aria-invalid={packReserved}
          autoComplete='off'
        />
        <input
          className='save-preset-input save-preset-input--name'
          type='text'
          placeholder='Preset Name'
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !packReserved && handleSave(false)}
          disabled={status === 'saving'}
        />
        <div className='save-preset-actions'>
          {status === 'confirm' ? (
            <div className='save-preset-btn-wrap save-preset-btn-wrap--confirm'>
              <button
                type='button'
                className='ui-dismiss-bubble'
                aria-label='Cancel overwrite'
                onClick={() => setStatus('idle')}
              >
                ×
              </button>
              <button
                type='button'
                className='save-preset-btn save-preset-btn--confirm'
                onClick={() => handleSave(true)}
                disabled={packReserved}
              >
                Overwrite
              </button>
            </div>
          ) : (
            <button
              type='button'
              className='save-preset-btn'
              onClick={() => handleSave(false)}
              disabled={!name.trim() || status === 'saving' || packReserved}
            >
              {status === 'saving' ? '...' : 'Save'}
            </button>
          )}
        </div>
        <div className='save-preset-bottom-row'>
          {atLimit && !packReserved ? (
            <p className='save-preset-pack-hint save-preset-pack-hint--action' role='status'>
              {limitMessage}{' '}
              <button type='button' className='upgrade-link' onClick={() => requestUpgrade(limitMessage)}>Upgrade</button>
            </p>
          ) : (
            <p
              className={`save-preset-pack-hint${packReserved ? ' save-preset-pack-hint--action' : ' save-preset-pack-hint--inactive'}`}
              role={packReserved ? 'status' : undefined}
              aria-hidden={!packReserved}
              onClick={packReserved ? () => {
                const el = packInputRef.current
                if (!el) return
                el.focus()
                selectReservedPackText(el)
              } : undefined}
            >
              {packReserved ? 'Reserved pack. Use a new pack name.' : '\u00a0'}
            </p>
          )}
          <span className={`save-preset-status save-preset-status--${status}`}>{statusMessage}</span>
        </div>
      </div>
    </div>
  )
}
