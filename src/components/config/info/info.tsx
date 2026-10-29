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

/** The strip itself: pinned to the bottom of the expanded config, showing what the control under the pointer (or in focus) does. */
export const InfoStrip = (): React.ReactElement => {
  const text = useContext(InfoTextContext)
  return (
    <div className={text === null ? 'info-strip info-strip--idle' : 'info-strip'} role='status'>
      {text ?? IDLE_TEXT}
    </div>
  )
}
