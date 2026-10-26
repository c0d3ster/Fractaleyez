/**
 * Calls `onChange` with whether `element` is on screen (inside the viewport and not scrolled out of a scroll container),
 * now and whenever that changes. Returns the stop function. Where IntersectionObserver is missing it says visible once.
 */
export const observeOnScreen = (element: Element, onChange: (visible: boolean) => void): (() => void) => {
  if (typeof IntersectionObserver === 'undefined') {
    onChange(true)
    return () => undefined
  }
  const observer = new IntersectionObserver((entries) => {
    const latest = entries[entries.length - 1]
    if (latest) onChange(latest.isIntersecting)
  })
  observer.observe(element)
  return () => observer.disconnect()
}
