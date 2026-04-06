import React, { useState, useContext, useCallback, useEffect } from 'react'
import { ConfigContext } from '../config/context/ConfigProvider'
import { PresetSelection } from './Presets'

type SavePresetProps = {
  prefill?: PresetSelection | null
  onSaved?: () => void
}

export const SavePreset = ({ prefill, onSaved }: SavePresetProps): React.ReactElement | null => {
  const context = useContext(ConfigContext)
  const [name, setName] = useState('')
  const [pack, setPack] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'confirm' | 'saved' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (prefill) {
      setName(prefill.label)
      setPack(prefill.pack)
    }
  }, [prefill])

  const handleSave = useCallback(async (force = false) => {
    if (!name.trim() || !context) return
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
  }, [name, pack, context, onSaved])

  if (!context?.isSignedIn) return null

  const statusMessage = status === 'saved' ? 'Saved!' : status === 'error' ? errorMessage : ''

  return (
    <div className='save-preset-wrapper'>
      <div className='save-preset'>
        <input
          className='save-preset-input save-preset-input--pack'
          type='text'
          placeholder='Pack'
          value={pack}
          onChange={(e) => setPack(e.target.value)}
          disabled={status === 'saving'}
        />
        <input
          className='save-preset-input'
          type='text'
          placeholder='Preset Name'
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave(false)}
          disabled={status === 'saving'}
        />
        {status === 'confirm' ? (
          <>
            <button
              className='save-preset-btn save-preset-btn--confirm'
              onClick={() => handleSave(true)}
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
            disabled={!name.trim() || status === 'saving'}
          >
            {status === 'saving' ? '...' : 'Save'}
          </button>
        )}
      </div>
      <span className={`save-preset-status save-preset-status--${status}`}>{statusMessage}</span>
    </div>
  )
}
