const TOUCH_CLASS = 'touch-input'

// Touch devices that also report a mouse (Windows touchscreens) match `hover: hover`, so a tap leaves :hover stuck.
// Hover rules are gated on html:not(.touch-input); this flags the page after a touch and clears it on real mouse use.
export const initTouchInputFlag = (): void => {
  const root = document.documentElement
  document.addEventListener('pointerdown', ({ pointerType }) => {
    if (pointerType === 'mouse') return
    root.classList.add(TOUCH_CLASS)
  }, { capture: true, passive: true })
  document.addEventListener('pointermove', ({ pointerType }) => {
    if (pointerType !== 'mouse') return
    root.classList.remove(TOUCH_CLASS)
  }, { capture: true, passive: true })
}
