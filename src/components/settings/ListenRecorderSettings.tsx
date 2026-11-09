import React, { useCallback, useState, useSyncExternalStore } from 'react'
import { useUser } from '@clerk/clerk-react'

import { RecorderState, SPOTIFY_SCOPES, listenRecorder } from '../../spotify/listen-recorder'

const STATUS_TEXT: Record<RecorderState['status'], string> = {
  'off': 'Off',
  'signed-out': 'Sign in to record',
  'needs-permission': 'Spotify needs to allow reading what is playing',
  'idle': 'On, waiting for Spotify to play something',
  'recording': 'Recording',
  'error': 'Something went wrong',
}

/**
 * The training recorder's switch and status (admin only): while it is on, every song played on Spotify is saved with what the mic heard,
 * for labelling and training the section model (src/spotify/listen-recorder.ts).
 */
export const ListenRecorderSettings = (): React.ReactElement => {
  const { user } = useUser()
  const state = useSyncExternalStore(listenRecorder.subscribe, listenRecorder.getState)
  const [enabled, setEnabled] = useState(listenRecorder.isEnabled)
  const [grantError, setGrantError] = useState<string | null>(null)

  const onToggle = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    listenRecorder.setEnabled(e.target.checked)
    setEnabled(e.target.checked)
  }, [])

  // Clerk asks Spotify for the extra scopes on a reauthorize (signing in again does not), then comes back here.
  const onGrant = useCallback(async () => {
    if (!user) return
    setGrantError(null)
    try {
      const redirectUrl = window.location.href
      const existing = user.externalAccounts.find((known) => known.provider === 'spotify')
      const account = existing
        ? await existing.reauthorize({ additionalScopes: SPOTIFY_SCOPES, redirectUrl })
        : await user.createExternalAccount({ strategy: 'oauth_spotify', redirectUrl, additionalScopes: SPOTIFY_SCOPES })
      const next = account.verification?.externalVerificationRedirectURL
      if (next) window.location.href = next.href
    } catch (err) {
      setGrantError(err instanceof Error ? err.message : String(err))
    }
  }, [user])

  const { status, track, saved, skipped, failed, lastSaved, error } = state
  const detail = status === 'recording' && track ? `${track.name} (${track.artists.join(', ')})` : null

  return (
    <>
      <div className='user-settings-page__section-title'>Training recorder</div>
      <label className='user-settings-page__checkbox'>
        <input type='checkbox' checked={enabled} onChange={onToggle} />
        Record the songs I play on Spotify
      </label>
      <div className='user-settings-page__row'>
        <span className='user-settings-page__logo-hint'>
          {STATUS_TEXT[status]}{detail ? `: ${detail}` : ''}
        </span>
        <span className='user-settings-page__logo-hint'>
          Saved {saved} {saved === 1 ? 'song' : 'songs'} this session, skipped {skipped} (under 30 s){failed > 0 ? `, ${failed} failed` : ''}
          {lastSaved ? `. Last: ${lastSaved}` : ''}
        </span>
        {status === 'needs-permission' ? (
          <button type='button' className='user-settings-page__select' onClick={() => void onGrant()}>Grant Spotify access</button>
        ) : null}
        {error || grantError ? <span className='user-settings-page__upload-error'>{grantError ?? error}</span> : null}
        <span className='user-settings-page__logo-hint'>
          Keep this tab visible while you listen: the analysis pauses in a hidden tab. Only band levels and a coarse spectrum are saved, never audio.
        </span>
      </div>
    </>
  )
}
