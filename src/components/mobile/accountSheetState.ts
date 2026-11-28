import { CONTROLS_MODE_OPTIONS, type ControlsMode } from '../../config/mobileControls.config'
import { PLAN_LABELS, type PlanId } from '../../config/plans.config'

// The account sheet's state (docs/mobile-design/AccountSheet.html, AccountGuest.html): open or not, and which view it shows. The
// rows lead to in-sheet views, the On-screen controls picker (UIMode.html) and the Plan tab's content, each with a back button.

export const ACCOUNT_VIEWS = ['root', 'controls', 'plan'] as const
export type AccountView = typeof ACCOUNT_VIEWS[number]

export type AccountSheetState = { open: boolean; view: AccountView }

export type AccountSheetAction =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'view'; view: AccountView }
  | { type: 'back' }

export const CLOSED_ACCOUNT: AccountSheetState = { open: false, view: 'root' }

/** Every open starts on the root view. Closing keeps the view, so the sheet does not change while it slides away. */
export const accountSheetReducer = (state: AccountSheetState, action: AccountSheetAction): AccountSheetState => {
  switch (action.type) {
  case 'open':
    return { open: true, view: 'root' }
  case 'close':
    return state.open ? { ...state, open: false } : state
  case 'view':
    return state.open ? { ...state, view: action.view } : state
  case 'back':
    return state.view === 'root' ? state : { ...state, view: 'root' }
  }
}

/** The title of each sub-view, beside its back button. */
export const ACCOUNT_VIEW_TITLES: Record<Exclude<AccountView, 'root'>, string> = {
  controls: 'On-screen controls',
  plan: 'Plan',
}

/** The picker's name for `mode`, shown on the On-screen controls row. */
export const controlsModeTitle = (mode: ControlsMode): string =>
  CONTROLS_MODE_OPTIONS.find((option) => option.mode === mode)?.title ?? mode

/** The parts of a Clerk user the sheet's head uses. */
export type AccountUser = {
  fullName?: string | null
  username?: string | null
  email?: string | null
}

export type AccountIdentity = {
  name: string
  /** The avatar's fallback letter. */
  initial: string
  /** The plan's display name, or null until `/api/me` has loaded it. */
  plan: string | null
}

/** Who is signed in, as the sheet's head shows it: the full name, else the username, else the email. */
export const accountIdentity = (user: AccountUser, plan: PlanId | null | undefined): AccountIdentity => {
  const name = [user.fullName, user.username, user.email].map((value) => value?.trim()).find((value) => !!value) ?? 'Your account'
  return { name, initial: name.charAt(0).toUpperCase(), plan: plan ? PLAN_LABELS[plan] : null }
}
