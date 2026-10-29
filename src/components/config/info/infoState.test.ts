import { describe, expect, it } from 'vitest'

import { enterInfo, hideInfo, IDLE_INFO, updateInfo } from './infoState'

describe('infoState', () => {
  it('starts a new hover on entering a control', () => {
    expect(enterInfo(IDLE_INFO, 'Saves it')).toEqual({ text: 'Saves it', session: 1 })
  })

  it('does not start another hover when focus follows the pointer onto the same control', () => {
    const hovered = enterInfo(IDLE_INFO, 'Saves it')
    expect(enterInfo(hovered, 'Saves it')).toBe(hovered)
  })

  it('starts a new hover when moving to a different control', () => {
    const hovered = enterInfo(IDLE_INFO, 'Saves it')
    expect(enterInfo(hovered, 'Resets it')).toEqual({ text: 'Resets it', session: 2 })
  })

  it('swaps the text in place, in the same hover, when the control it is on changes it', () => {
    const hovered = enterInfo(IDLE_INFO, 'Lag: 20 ms')
    expect(updateInfo(hovered, 'Lag: 21 ms')).toEqual({ text: 'Lag: 21 ms', session: 1 })
    expect(updateInfo(hovered, 'Lag: 20 ms')).toBe(hovered)
  })

  it('does not bring the text back when the pointer moves after it has left', () => {
    const left = hideInfo(enterInfo(IDLE_INFO, 'Saves it'))
    expect(updateInfo(left, 'Saves it')).toBe(left)
  })

  it('counts leaving as a change, so the text fades out, and leaving twice is nothing', () => {
    const left = hideInfo(enterInfo(IDLE_INFO, 'Saves it'))
    expect(left).toEqual({ text: null, session: 2 })
    expect(hideInfo(left)).toBe(left)
  })
})
