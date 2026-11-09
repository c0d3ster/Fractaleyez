import { describe, expect, it } from 'vitest'
import { Heading, shortestTurn, TAU, wrapAngle } from './heading'
import { HeadingFollower } from './headingFollower'

describe('wrapAngle', () => {
  it('keeps angles within one turn', () => {
    expect(wrapAngle(-0.5)).toBeCloseTo(TAU - 0.5)
    expect(wrapAngle(TAU + 1)).toBeCloseTo(1)
  })
})

describe('shortestTurn', () => {
  it('goes the short way round', () => {
    expect(shortestTurn(0.1, TAU - 0.1)).toBeCloseTo(-0.2)
    expect(shortestTurn(TAU - 0.1, 0.1)).toBeCloseTo(0.2)
  })
})

describe('Heading', () => {
  it('shows what a visualizer reports, wrapped', () => {
    const heading = new Heading()
    heading.report(-Math.PI / 2)
    expect(heading.angle).toBeCloseTo(Math.PI * 1.5)
  })

  it('shows a drag at once and asks followers to honor it', () => {
    const heading = new Heading()
    heading.set(1)
    expect(heading.angle).toBe(1)
    expect(heading.requested).toBe(1)
    expect(heading.revision).toBe(1)
  })
})

describe('HeadingFollower', () => {
  it('owes nothing until the user drags', () => {
    const follower = new HeadingFollower(new Heading())
    expect(follower.takeTurn(2)).toBe(0)
  })

  it('hands over the turn to a drag once', () => {
    const heading = new Heading()
    const follower = new HeadingFollower(heading)
    heading.set(0)
    expect(follower.takeTurn(1)).toBeCloseTo(-1)
    expect(follower.takeTurn(0)).toBe(0)
  })

  it('does not take a drag that happened before it existed', () => {
    const heading = new Heading()
    heading.set(1)
    expect(new HeadingFollower(heading).takeTurn(0)).toBe(0)
  })

  it('lets every follower honor the same drag', () => {
    const heading = new Heading()
    const first = new HeadingFollower(heading)
    const second = new HeadingFollower(heading)
    heading.set(0.5)
    expect(first.takeTurn(0)).toBeCloseTo(0.5)
    expect(second.takeTurn(0.25)).toBeCloseTo(0.25)
  })
})
