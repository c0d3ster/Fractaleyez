import { type RefObject, useEffect, useState } from 'react'

/** How far from the bottom still counts as the end, so a fractional scroll position never leaves the fade on. */
export const MORE_BELOW_SLACK_PX = 2

/** Whether a scroll box has content past its bottom edge. */
export const hasMoreBelow = ({ scrollTop, scrollHeight, clientHeight }: { scrollTop: number; scrollHeight: number; clientHeight: number }): boolean =>
  scrollHeight - clientHeight - scrollTop > MORE_BELOW_SLACK_PX

/**
 * Whether the element in `ref` has more to scroll to below, kept up as it scrolls, resizes or its content changes. Off while
 * `enabled` is false, so a component can call it unconditionally.
 */
export const useMoreBelow = (ref: RefObject<HTMLElement | null>, enabled: boolean): boolean => {
  const [more, setMore] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!enabled || !element) {
      setMore(false)
      return undefined
    }
    const update = (): void => setMore(hasMoreBelow(element))
    update()
    element.addEventListener('scroll', update, { passive: true })
    const resize = new ResizeObserver(update)
    resize.observe(element)
    // A new pack or more presets change the content's height without resizing the box.
    const mutation = new MutationObserver(update)
    mutation.observe(element, { childList: true })
    return () => {
      element.removeEventListener('scroll', update)
      resize.disconnect()
      mutation.disconnect()
    }
  }, [ref, enabled])
  return more
}
