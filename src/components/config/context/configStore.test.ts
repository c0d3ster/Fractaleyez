import { describe, expect, it, vi } from 'vitest'

import { AppConfig, configDefaults } from '../../../config/configDefaults'
import { ConfigStore, readSelector, shallowEqual } from './configStore'

const fresh = (): AppConfig => structuredClone(configDefaults)

// What updateConfigItem does: a new config with only the touched section replaced.
const withSpeed = (config: AppConfig, value: number): AppConfig => ({
  ...config,
  user: { ...config.user, speed: { ...config.user.speed, value } },
})

describe('ConfigStore', () => {
  it('tells subscribers when the config is replaced, and not when it is set to itself', () => {
    const config = fresh()
    const store = new ConfigStore(config)
    const listener = vi.fn()
    store.subscribe(listener)
    store.set(config)
    expect(listener).not.toHaveBeenCalled()
    store.set(withSpeed(config, 5))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.get().user.speed.value).toBe(5)
  })

  it('stops calling a listener once it has unsubscribed, even from inside a notification', () => {
    const store = new ConfigStore(fresh())
    const calls: string[] = []
    const stopFirst = store.subscribe(() => { calls.push('first'); stopFirst() })
    store.subscribe(() => calls.push('second'))
    store.set(withSpeed(store.get(), 1))
    store.set(withSpeed(store.get(), 2))
    expect(calls).toEqual(['first', 'second', 'second'])
  })
})

describe('readSelector', () => {
  it('gives back the same slice while its section did not change, so its subscribers are not woken', () => {
    const store = new ConfigStore(fresh())
    const orbit = readSelector(store, (config) => config.orbit)
    const first = orbit.getSnapshot()
    store.set(withSpeed(store.get(), 7))
    expect(orbit.getSnapshot()).toBe(first)
  })

  it('gives a new slice when its section changed', () => {
    const store = new ConfigStore(fresh())
    const user = readSelector(store, (config) => config.user)
    const first = user.getSnapshot()
    store.set(withSpeed(store.get(), 7))
    expect(user.getSnapshot()).not.toBe(first)
    expect(user.getSnapshot().speed.value).toBe(7)
  })

  it('holds a selector that builds a new object each time to its last result while the pieces are the same', () => {
    const store = new ConfigStore(fresh())
    const picked = readSelector(store, ({ orbit, color }) => ({ orbit, color }), shallowEqual)
    const first = picked.getSnapshot()
    store.set(withSpeed(store.get(), 3))
    expect(picked.getSnapshot()).toBe(first)
    store.set({ ...store.get(), orbit: { ...store.get().orbit } })
    expect(picked.getSnapshot()).not.toBe(first)
  })

  it('reads the config as it is at the time, with no stale answer after a change', () => {
    const store = new ConfigStore(fresh())
    const speed = readSelector(store, (config) => config.user.speed.value)
    expect(speed.getSnapshot()).toBe(configDefaults.user.speed.value)
    store.set(withSpeed(store.get(), 9))
    expect(speed.getSnapshot()).toBe(9)
  })

  it('returns the same answer on repeated reads of an unchanged config without selecting again', () => {
    const store = new ConfigStore(fresh())
    const select = vi.fn((config: AppConfig) => ({ user: config.user }))
    const reader = readSelector(store, select, shallowEqual)
    reader.getSnapshot()
    reader.getSnapshot()
    reader.getSnapshot()
    expect(select).toHaveBeenCalledTimes(1)
  })
})

describe('shallowEqual', () => {
  it('compares one level deep', () => {
    const a = { x: 1, y: { z: 1 } }
    expect(shallowEqual(a, { x: 1, y: a.y })).toBe(true)
    expect(shallowEqual(a, { x: 1, y: { z: 1 } })).toBe(false)
    expect(shallowEqual({ x: 1 }, { x: 1, y: 2 } as unknown as { x: number })).toBe(false)
  })
})
