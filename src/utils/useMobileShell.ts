import { useSyncExternalStore } from 'react'

/** The mobile shell is on when touch is the primary input and the viewport is phone-sized. Desktop and touch laptops keep the desktop UI. */
export const MOBILE_SHELL_QUERY = '(pointer: coarse) and (max-width: 820px)'

const mediaQuery = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(MOBILE_SHELL_QUERY) : null

/** Whether the mobile shell is active right now, for code outside React. */
export const isMobileShell = (): boolean => mediaQuery()?.matches ?? false

/** Calls `listener` whenever the shell turns on or off (a rotation past 820px, a pointer change). Returns the unsubscribe. */
export const subscribeMobileShell = (listener: () => void): (() => void) => {
  const query = mediaQuery()
  if (!query) return () => undefined
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

/** Whether the mobile shell is active, re-rendering when it changes. */
export const useMobileShell = (): boolean => useSyncExternalStore(subscribeMobileShell, isMobileShell, () => false)
