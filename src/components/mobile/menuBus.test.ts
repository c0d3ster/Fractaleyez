import { describe, expect, it, vi } from 'vitest'

import { isMenuOpen, openAccount, openMenu, setMenuOpen, subscribeMenuOpen, subscribeOpenAccount, subscribeOpenMenu } from './menuBus'

describe('menu bus', () => {
  it('passes menu requests, with their page, to the listeners until they unsubscribe', () => {
    const listener = vi.fn()
    const stop = subscribeOpenMenu(listener)
    openMenu()
    openMenu('color')
    expect(listener.mock.calls).toEqual([[undefined], ['color']])
    stop()
    openMenu()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('passes account requests', () => {
    const listener = vi.fn()
    const stop = subscribeOpenAccount(listener)
    openAccount()
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
  })

  it('reports the open state only when it changes', () => {
    const listener = vi.fn()
    const stop = subscribeMenuOpen(listener)
    expect(isMenuOpen()).toBe(false)
    setMenuOpen(true)
    setMenuOpen(true)
    expect(isMenuOpen()).toBe(true)
    setMenuOpen(false)
    expect(listener).toHaveBeenCalledTimes(2)
    stop()
  })

  it('stays open while either sheet is open', () => {
    const listener = vi.fn()
    const stop = subscribeMenuOpen(listener)
    setMenuOpen(true)
    setMenuOpen(true, 'account')
    setMenuOpen(false)
    expect(isMenuOpen()).toBe(true)
    setMenuOpen(false, 'account')
    expect(isMenuOpen()).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)
    stop()
  })
})
