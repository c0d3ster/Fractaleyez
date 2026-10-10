/** The little of a pointer event this needs, so it can be called with React's and tested without a DOM. */
type PointerLike = {
  pointerType: string
  currentTarget: { dataset: DOMStringMap }
}

/**
 * Marks an element with the kind of pointer that last reached it: data-input="touch" or "pointer".
 *
 * A touch leaves what was tapped stuck in :hover until something else is touched, so on a touch screen a button reads
 * as still lit after you let go. `@media (hover: hover)` already keeps hover looks off phones and tablets, which say
 * they cannot hover. A touch screen on a desktop still says it can (the mouse is its main input), so styles also leave
 * hover looks out under [data-input='touch']; the next mouse move marks it "pointer" again and they come back.
 */
export const trackInputType = ({ pointerType, currentTarget }: PointerLike): void => {
  const next = pointerType === 'touch' ? 'touch' : 'pointer'
  if (currentTarget.dataset.input !== next) currentTarget.dataset.input = next
}
