import React, { useCallback, useEffect, useReducer } from 'react'
import { useClerk, useUser } from '@clerk/clerk-react'

import { CONTROLS_MODE_OPTIONS, type ControlsMode } from '../../config/mobileControls.config'
import { useConfigContext } from '../config/context/ConfigProvider'
import { PlanPage } from '../settings/PlanPage'
import { useProfilePages } from '../settings/profilePages'
import { ACCOUNT_VIEW_TITLES, accountIdentity, accountSheetReducer, type AccountView, CLOSED_ACCOUNT, controlsModeTitle } from './accountSheetState'
import { BottomSheet } from './BottomSheet'
import { useControlsMode } from './controlsMode'
import { setMenuOpen, subscribeOpenAccount, subscribeOpenMenu } from './menuBus'
import './AccountSheet.css'

// The sheet the account badge opens (docs/mobile-design/AccountSheet.html signed in, AccountGuest.html signed out), the menu
// sheet's frame and height. Its rows open in-sheet views (the On-screen controls picker, UIMode.html, and the Plan tab's content)
// or Clerk's modals, which sit above it. Opening the menu closes it, and opening it closes the menu.

type AccountState = 'loading' | 'signed-in' | 'guest'

const ChevronRight = (): React.ReactElement => (
  <svg aria-hidden='true' width={16} height={16} viewBox='0 0 24 24' fill='none' stroke='#CFCFCF' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
    <path d='M9 6l6 6-6 6' />
  </svg>
)

const ChevronLeft = (): React.ReactElement => (
  <svg aria-hidden='true' width={18} height={18} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
    <path d='M15 6l-6 6 6 6' />
  </svg>
)

type RowProps = { id: string; label: string; value?: string | null; chevron?: boolean; danger?: boolean; onClick: () => void }

const Row = ({ id, label, value, chevron = true, danger = false, onClick }: RowProps): React.ReactElement => (
  <button type='button' className={`account-row${danger ? ' account-row--danger' : ''}`} data-account-row={id} onClick={onClick}>
    <span>{label}</span>
    <span className='account-row__value'>
      {value}
      {chevron && <ChevronRight />}
    </span>
  </button>
)

/** The On-screen controls row: shows the current mode, opens the picker. */
const ControlsRow = ({ onOpen }: { onOpen: () => void }): React.ReactElement => {
  const mode = useControlsMode()
  return <Row id='controls' label='On-screen controls' value={controlsModeTitle(mode)} onClick={onOpen} />
}

/** UIMode.html: one radio card per mode. Saved to the account signed in, and to this browser either way. */
const ControlsPicker = (): React.ReactElement => {
  const mode = useControlsMode()
  const { updateUserSettings } = useConfigContext()
  const pick = (next: ControlsMode): void => {
    if (next !== mode) updateUserSettings({ onScreenControls: next })
  }
  return (
    <div className='account-controls'>
      <p id='account-controls-intro' className='account-controls__intro'>How much shows up while you play. Gestures work the same in every mode.</p>
      <div className='account-controls__options' role='radiogroup' aria-label='On-screen controls' aria-describedby='account-controls-intro'>
        {CONTROLS_MODE_OPTIONS.map((option) => (
          <button
            key={option.mode}
            type='button'
            role='radio'
            className='account-mode'
            aria-checked={option.mode === mode}
            data-controls-mode={option.mode}
            onClick={() => pick(option.mode)}
          >
            <span className='account-mode__radio' aria-hidden='true'><span /></span>
            <span className='account-mode__text'>
              <span className='account-mode__title'>{option.title}</span>
              <span className='account-mode__description'>{option.description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export const AccountSheet = (): React.ReactElement => {
  const [{ open, view: requestedView }, dispatch] = useReducer(accountSheetReducer, CLOSED_ACCOUNT)
  const { isLoaded, isSignedIn, user } = useUser()
  const clerk = useClerk()
  const { entitlements } = useConfigContext()
  const { customPages, portals } = useProfilePages()

  useEffect(() => subscribeOpenAccount(() => dispatch({ type: 'open' })), [])
  // One sheet at a time: the menu (the bar's button, a long-press) takes over from this one.
  useEffect(() => subscribeOpenMenu(() => dispatch({ type: 'close' })), [])
  useEffect(() => setMenuOpen(open, 'account'), [open])
  useEffect(() => () => setMenuOpen(false, 'account'), [])

  const close = useCallback(() => dispatch({ type: 'close' }), [])
  const show = (next: AccountView) => (): void => dispatch({ type: 'view', view: next })
  const back = (): void => dispatch({ type: 'back' })

  const state: AccountState = !isLoaded ? 'loading' : isSignedIn ? 'signed-in' : 'guest'
  // Signed out from under the Plan view (in another tab, say): there is no plan to show.
  const view: AccountView = requestedView === 'plan' && state !== 'signed-in' ? 'root' : requestedView
  const identity = user
    ? accountIdentity({ fullName: user.fullName, username: user.username, email: user.primaryEmailAddress?.emailAddress }, entitlements?.plan)
    : null

  let head: React.ReactNode
  let body: React.ReactNode
  if (view !== 'root') {
    head = (
      <div className='sheet-page-head'>
        <button type='button' className='sheet-back' aria-label='Back to account' onClick={back}>
          <ChevronLeft />
        </button>
        <span className='sheet-page-title'>{ACCOUNT_VIEW_TITLES[view]}</span>
      </div>
    )
    body = view === 'controls' ? <ControlsPicker /> : <div className='account-plan'><PlanPage /></div>
  } else if (state === 'signed-in' && identity) {
    head = (
      <div className='account-identity'>
        <span className='account-avatar' aria-hidden='true'>
          {user?.imageUrl ? <img src={user.imageUrl} alt='' draggable={false} /> : identity.initial}
        </span>
        <span className='account-identity__text'>
          <span className='account-identity__name'>{identity.name}</span>
          {identity.plan && <span className='account-identity__plan'>{identity.plan}</span>}
        </span>
      </div>
    )
    body = (
      <div className='account-rows'>
        <ControlsRow onOpen={show('controls')} />
        <Row id='manage' label='Manage account' onClick={() => clerk.openUserProfile({ customPages })} />
        <Row id='plan' label='Plan' value={identity.plan} onClick={show('plan')} />
        <Row id='signout' label='Sign out' chevron={false} danger onClick={() => { void clerk.signOut() }} />
      </div>
    )
  } else if (state === 'guest') {
    head = (
      <div className='account-guest'>
        <span className='account-guest__title'>Save what you make</span>
        <span className='account-guest__line'>Sign in to save presets and upload your own logos and sprites.</span>
      </div>
    )
    body = (
      <>
        <button type='button' className='account-signin' onClick={() => clerk.openSignIn()}>Sign in or create an account</button>
        <div className='account-rows'>
          <ControlsRow onOpen={show('controls')} />
        </div>
      </>
    )
  } else {
    // Clerk is still loading: the controls row already works, the rest waits for the account.
    head = (
      <div className='account-identity account-identity--loading' aria-busy='true'>
        <span className='account-avatar account-avatar--empty' aria-hidden='true' />
        <span className='account-identity__text'>
          <span className='account-identity__name'>Loading your account…</span>
        </span>
      </div>
    )
    body = (
      <div className='account-rows'>
        <ControlsRow onOpen={show('controls')} />
      </div>
    )
  }

  return (
    <>
      <BottomSheet open={open} onClose={close} label='Account' head={head} className='account-sheet'>
        <div className='account-sheet__body' data-account-sheet={state} data-account-view={view}>{body}</div>
      </BottomSheet>
      {/* Clerk's Manage account modal fills these with the Visualizer and Plan pages; they stay mounted with the modal. */}
      {portals}
    </>
  )
}
