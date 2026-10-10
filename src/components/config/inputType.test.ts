import { describe, expect, it } from 'vitest'

import { trackInputType } from './inputType'

const event = (pointerType: string, dataset: DOMStringMap = {}): { pointerType: string; currentTarget: { dataset: DOMStringMap } } => ({
  pointerType,
  currentTarget: { dataset },
})

describe('trackInputType', () => {
  it('marks an element as touched when a finger reaches it', () => {
    const touched = event('touch')
    trackInputType(touched)
    expect(touched.currentTarget.dataset.input).toBe('touch')
  })

  it('marks it as pointer for a mouse or a pen', () => {
    const mouse = event('mouse')
    const pen = event('pen')
    trackInputType(mouse)
    trackInputType(pen)
    expect(mouse.currentTarget.dataset.input).toBe('pointer')
    expect(pen.currentTarget.dataset.input).toBe('pointer')
  })

  it('goes back to pointer when the mouse is used after a touch', () => {
    const dataset: DOMStringMap = {}
    trackInputType(event('touch', dataset))
    expect(dataset.input).toBe('touch')
    trackInputType(event('mouse', dataset))
    expect(dataset.input).toBe('pointer')
  })

  it('does not write the attribute again when it already says the same thing', () => {
    let writes = 0
    const dataset: DOMStringMap = {}
    const watched = new Proxy(dataset, { set: (target, key, value) => { writes += 1; return Reflect.set(target, key, value) } })
    trackInputType(event('mouse', watched))
    trackInputType(event('mouse', watched))
    trackInputType(event('mouse', watched))
    expect(writes).toBe(1)
  })
})
