import { describe, it, expect, vi } from 'vitest'
import { PreviewLock } from './previewLock'

describe('PreviewLock', () => {
  it('starts unlocked and tells subscribers only when the lock changes', () => {
    const lock = new PreviewLock()
    const listener = vi.fn()
    const unsubscribe = lock.subscribe(listener)
    expect(lock.isLocked()).toBe(false)
    lock.set(true)
    lock.set(true)
    expect(lock.isLocked()).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    lock.set(false)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(lock.isLocked()).toBe(false)
  })
})
