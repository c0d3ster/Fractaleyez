import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import './info.css'

// What a hovered or focused control says about itself shows in one strip at the bottom of the expanded config, always in the
// same place, instead of in the browser's own tooltip (slow, unstyled, in a different place each time and clipped by the window).
// The text and the actions that set it are in separate contexts: a control only needs the actions, which never change, so
// hovering re-renders the strip and nothing else (the pop-out shares its thread with the visualizer).

type InfoActions = {
  show: (text: string) => void
  hide: () => void
}

const InfoTextContext = createContext<string | null>(null)
const InfoActionsContext = createContext<InfoActions | null>(null)

/** What an element needs to describe itself. Spread it onto the element: `<button {...info('Saves the preset')} />`. */
export type InfoProps = Pick<React.HTMLAttributes<HTMLElement>, 'title' | 'onPointerEnter' | 'onPointerMove' | 'onPointerLeave' | 'onFocus' | 'onBlur'>

type InfoProviderProps = { children: React.ReactNode }

export const InfoProvider = ({ children }: InfoProviderProps): React.ReactElement => {
  const [text, setText] = useState<string | null>(null)
  const actions = useMemo<InfoActions>(() => ({ show: setText, hide: () => setText(null) }), [])
  return (
    <InfoActionsContext.Provider value={actions}>
      <InfoTextContext.Provider value={text}>{children}</InfoTextContext.Provider>
    </InfoActionsContext.Provider>
  )
}

/**
 * Returns a function that turns a description into the props for the element it describes. Where there is no strip (the
 * sidebar in the main window) the description is the element's own `title`, so it still shows. No text means no props.
 */
export const useInfo = (): ((text: string | undefined) => InfoProps) => {
  const actions = useContext(InfoActionsContext)
  return useCallback((text) => {
    if (!text) return {}
    if (!actions) return { title: text }
    const show = (): void => actions.show(text)
    // Moving over the element shows it again too, so a description that changes while it is hovered (the live numbers in the Performance panel) keeps up; setting the same text is a no-op.
    return { onPointerEnter: show, onPointerMove: show, onPointerLeave: actions.hide, onFocus: show, onBlur: actions.hide }
  }, [actions])
}

const IDLE_TEXT = 'Hover a control to see what it does.'

const COLLAPSED_KEY = 'infoStripCollapsed'

const readCollapsed = (): boolean => {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

const writeCollapsed = (collapsed: boolean): void => {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // Storage can be blocked; the strip still hides for this visit.
  }
}

/**
 * The strip itself: pinned to the bottom of the expanded config, showing what the control under the pointer (or in focus) does.
 * The arrow at its top middle hides it, leaving only a small arrow to bring it back; the choice is kept.
 */
export const InfoStrip = (): React.ReactElement => {
  const text = useContext(InfoTextContext)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggle = (): void => {
    setCollapsed((hidden) => {
      writeCollapsed(!hidden)
      return !hidden
    })
  }
  const arrow = (
    <button type='button' className='info-strip__toggle' aria-expanded={!collapsed} aria-label={collapsed ? 'Show the hint strip' : 'Hide the hint strip'} onClick={toggle}>
      <svg viewBox='0 0 12 8' width='12' height='8' aria-hidden='true' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round'>
        <path d={collapsed ? 'M1 6.5 6 1.5 11 6.5' : 'M1 1.5 6 6.5 11 1.5'} />
      </svg>
    </button>
  )
  if (collapsed) return <div className='info-strip info-strip--collapsed'>{arrow}</div>
  return (
    <div className={text === null ? 'info-strip info-strip--idle' : 'info-strip'} role='status'>
      {arrow}
      {text ?? IDLE_TEXT}
    </div>
  )
}
