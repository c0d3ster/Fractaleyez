import React, { useState, useContext, useCallback, useEffect, useMemo, useRef } from 'react'
import { ConfigContext } from '../config/context/ConfigProvider'
import { PresetSelection } from './Presets'

type SavePresetProps = {
  prefill?: PresetSelection | null
  onSaved?: () => void
}

export const SavePreset = ({ prefill, onSaved }: SavePresetProps): React.ReactElement | null => {
  const context = useContext(ConfigContext)
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
    setStatus('saving')
    try {
      await context.savePreset(name.trim(), pack.trim(), force)
      setStatus('saved')
      setName('')
      setPack('')
      onSaved?.()
      setTimeout(() => setStatus('idle'), 2000)
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any
      const httpStatus = e?.response?.status
      console.error('savePreset failed', httpStatus, err)
      if (httpStatus === 409) {
        setStatus('confirm')
      } else {
        const msg = e?.response?.data?.error ?? `Error (${httpStatus ?? 'network'})`
        setErrorMessage(msg)
        setStatus('error')
        setTimeout(() => setStatus('idle'), 3000)
      }
    }
  }, [name, pack, packTrimmed, context, onSaved, systemPacks])

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
          onFocus={(e) => selectReservedPackText(e.currentTarget)}
          onClick={(e) => selectReservedPackText(e.currentTarget)}
          disabled={status === 'saving'}
          aria-invalid={packReserved}
          title={packReserved ? 'Built-in presets use this pack name — choose another' : undefined}
          autoComplete='off'
        />
        <input
          className='save-preset-input'
          type='text'
          placeholder='Preset Name'
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !packReserved && handleSave(false)}
          disabled={status === 'saving'}
        />
        {status === 'confirm' ? (
          <>
            <button
              className='save-preset-btn save-preset-btn--confirm'
              onClick={() => handleSave(true)}
              disabled={packReserved}
            >
              Overwrite?
            </button>
            <button
              className='save-preset-btn'
              onClick={() => setStatus('idle')}
            >
              ✕
            </button>
          </>
        ) : (
          <button
            className='save-preset-btn'
            onClick={() => handleSave(false)}
            disabled={!name.trim() || status === 'saving' || packReserved}
          >
            {status === 'saving' ? '...' : 'Save'}
          </button>
        )}
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
      </div>
      <span className={`save-preset-status save-preset-status--${status}`}>{statusMessage}</span>
    </div>
  )
}
