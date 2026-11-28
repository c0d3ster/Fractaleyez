import { useSyncExternalStore } from 'react'

// How the mobile shell's pieces ask for the menu sheet and the account sheet without holding references to each other. Anything
// (the long-press, the bar's menu button, the badge) asks with openMenu/openAccount; the sheet listens with the subscribe
// functions, and reports whether it is open with setMenuOpen.

type Listener<T> = (value: T) => void

const openMenuListeners = new Set<Listener<string | undefined>>()
const openAccountListeners = new Set<() => void>()
const menuOpenListeners = new Set<() => void>()
let menuOpen = false

const subscribe = <T>(set: Set<T>, listener: T): (() => void) => {
  set.add(listener)
  return () => set.delete(listener)
}

/** Asks for the menu sheet, on `page` when given (the sheet decides what pages exist). */
export const openMenu = (page?: string): void => openMenuListeners.forEach((listener) => listener(page))

export const subscribeOpenMenu = (listener: Listener<string | undefined>): (() => void) => subscribe(openMenuListeners, listener)

/** Asks for the account sheet. */
export const openAccount = (): void => openAccountListeners.forEach((listener) => listener())

export const subscribeOpenAccount = (listener: () => void): (() => void) => subscribe(openAccountListeners, listener)

/** Called by the menu sheet when it opens or closes. */
export const setMenuOpen = (open: boolean): void => {
  if (open === menuOpen) return
  menuOpen = open
  menuOpenListeners.forEach((listener) => listener())
}

export const isMenuOpen = (): boolean => menuOpen

export const subscribeMenuOpen = (listener: () => void): (() => void) => subscribe(menuOpenListeners, listener)

export const useMenuOpen = (): boolean => useSyncExternalStore(subscribeMenuOpen, isMenuOpen, isMenuOpen)
