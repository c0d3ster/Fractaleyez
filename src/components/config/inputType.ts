/** The little of a pointer event this needs, so it can be called with React's and tested without a DOM. */
type PointerLike = {
  pointerType: string
  currentTarget: { dataset: DOMStringMap }
}

/**
 * Marks an element with the kind of pointer that last reached it: data-input="touch" or "pointer".
 *
 * A touch leaves what was tapped stuck in :hover until something else is touched, so on a touch screen a button reads
 * as still lit after you let go. Hover styles sit behind html:not([data-input='touch']) (watchInputType marks <html>),
 * so a touch turns them off and the next mouse move brings them back. Press feedback uses :active, which clears on release.
 */
export const trackInputType = ({ pointerType, currentTarget }: PointerLike): void => {
  const next = pointerType === 'touch' ? 'touch' : 'pointer'
  if (currentTarget.dataset.input !== next) currentTarget.dataset.input = next
}

/** Tracks the last pointer type on <html>, so every hover look in the app can sit behind html[data-input='touch']. */
export const watchInputType = (): void => {
  const track = ({ pointerType }: PointerEvent): void => trackInputType({ pointerType, currentTarget: document.documentElement })
  document.addEventListener('pointerdown', track, { capture: true, passive: true })
  document.addEventListener('pointerover', track, { capture: true, passive: true })
}
