import { describe, expect, it } from 'vitest'

import { accountIdentity, accountSheetReducer, CLOSED_ACCOUNT, controlsModeTitle } from './accountSheetState'

describe('account sheet state', () => {
  it('opens on the root view, even after a sub-view was left open', () => {
    const open = accountSheetReducer(CLOSED_ACCOUNT, { type: 'open' })
    expect(open).toEqual({ open: true, view: 'root' })
    const onPicker = accountSheetReducer(open, { type: 'view', view: 'controls' })
    expect(onPicker.view).toBe('controls')
    const closed = accountSheetReducer(onPicker, { type: 'close' })
    expect(closed).toEqual({ open: false, view: 'controls' })
    expect(accountSheetReducer(closed, { type: 'open' })).toEqual({ open: true, view: 'root' })
  })

  it('goes back to the root view and ignores a back on it', () => {
    const onPlan = accountSheetReducer(accountSheetReducer(CLOSED_ACCOUNT, { type: 'open' }), { type: 'view', view: 'plan' })
    const back = accountSheetReducer(onPlan, { type: 'back' })
    expect(back.view).toBe('root')
    expect(accountSheetReducer(back, { type: 'back' })).toBe(back)
  })

  it('changes nothing while closed', () => {
    expect(accountSheetReducer(CLOSED_ACCOUNT, { type: 'close' })).toBe(CLOSED_ACCOUNT)
    expect(accountSheetReducer(CLOSED_ACCOUNT, { type: 'view', view: 'plan' })).toBe(CLOSED_ACCOUNT)
  })
})

describe('accountIdentity', () => {
  it('names the user by full name, then username, then email', () => {
    expect(accountIdentity({ fullName: 'Ada Lovelace', username: 'ada', email: 'a@x.io' }, 'tier1')).toEqual({ name: 'Ada Lovelace', initial: 'A', plan: 'Lucid' })
    expect(accountIdentity({ fullName: '  ', username: 'zed', email: 'a@x.io' }, 'free').name).toBe('zed')
    expect(accountIdentity({ fullName: null, username: null, email: 'bo@x.io' }, 'tier2')).toEqual({ name: 'bo@x.io', initial: 'B', plan: 'Third Eye' })
  })

  it('has a fallback name and no plan until the plan loads', () => {
    expect(accountIdentity({}, null)).toEqual({ name: 'Your account', initial: 'Y', plan: null })
  })
})

describe('controlsModeTitle', () => {
  it('uses the picker titles', () => {
    expect(controlsModeTitle('full')).toBe('Full')
    expect(controlsModeTitle('limited')).toBe('Limited')
    expect(controlsModeTitle('none')).toBe('None')
  })
})
