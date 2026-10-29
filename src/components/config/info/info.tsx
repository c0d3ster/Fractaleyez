import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import './info.css'
import { enterInfo, hideInfo, IDLE_INFO, InfoState, updateInfo } from './infoState'

// What a hovered or focused control says about itself shows in one strip at the bottom of the expanded config, always in the
// same place, instead of in the browser's own tooltip (slow, unstyled, in a different place each time and clipped by the window).
// The text and the actions that set it are in separate contexts: a control only needs the actions, which never change, so
// hovering re-renders the strip and nothing else (the pop-out shares its thread with the visualizer).

type InfoActions = {
  /** A pointer or focus arrived on a control: a new hover, which the strip fades to. */
  enter: (text: string) => void
  /** The pointer moved over the control it is already on: the text may have changed, and is swapped in place. */
  update: (text: string) => void
  hide: () => void
}

const InfoTextContext = createContext<InfoState>(IDLE_INFO)
const InfoActionsContext = createContext<InfoActions | null>(null)

/** What an element needs to describe itself. Spread it onto the element: `<button {...info('Saves the preset')} />`. */
export type InfoProps = Pick<React.HTMLAttributes<HTMLElement>, 'title' | 'onPointerEnter' | 'onPointerMove' | 'onPointerLeave' | 'onFocus' | 'onBlur'>

type InfoProviderProps = { children: React.ReactNode }

export const InfoProvider = ({ children }: InfoProviderProps): React.ReactElement => {
  const [state, setState] = useState<InfoState>(IDLE_INFO)
  const actions = useMemo<InfoActions>(() => ({
    enter: (text) => setState((previous) => enterInfo(previous, text)),
    update: (text) => setState((previous) => updateInfo(previous, text)),
    hide: () => setState(hideInfo),
  }), [])
  return (
    <InfoActionsContext.Provider value={actions}>
      <InfoTextContext.Provider value={state}>{children}</InfoTextContext.Provider>
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
    // Moving over the element updates the text in place, so a description that changes while it is hovered (the live numbers in the Performance panel) keeps up.
    return {
      onPointerEnter: () => actions.enter(text),
      onPointerMove: () => actions.update(text),
      onPointerLeave: actions.hide,
      onFocus: () => actions.enter(text),
      onBlur: actions.hide,
    }
  }, [actions])
}

const IDLE_TEXT = 'Hover a control to see what it does.'

// How long the text takes to fade out, and then in.
const FADE_MS = 120

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
 * Moving to another control fades the text out and the new one in; the arrow at its top middle hides the strip, leaving only a
 * small arrow to bring it back, and the choice is kept.
 */
export const InfoStrip = (): React.ReactElement => {
  const { text, session } = useContext(InfoTextContext)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  // What is on show lags the hovered text by the fade, so the old text can fade out before the new one fades in.
  const [shown, setShown] = useState<string | null>(text)
  const [visible, setVisible] = useState(true)
  const latest = useRef(text)
  latest.current = text
  const fading = useRef(false)
  const firstSession = useRef(true)

  useEffect(() => {
    if (firstSession.current) {
      firstSession.current = false
      return undefined
    }
    fading.current = true
    setVisible(false)
    const timer = window.setTimeout(() => {
      fading.current = false
      setShown(latest.current)
      setVisible(true)
    }, FADE_MS)
    return () => window.clearTimeout(timer)
  }, [session])

  useEffect(() => {
    if (!fading.current) setShown(text)
  }, [text])

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
  const textClass = ['info-strip__text', shown === null ? 'info-strip__text--idle' : '', visible ? '' : 'info-strip__text--hidden'].filter(Boolean).join(' ')
  return (
    <div className='info-strip' role='status'>
      {arrow}
      <span className={textClass}>{shown ?? IDLE_TEXT}</span>
    </div>
  )
}
