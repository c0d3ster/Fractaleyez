import { describe, it, expect, vi, afterEach } from 'vitest'

const loadWith = async (value: string | undefined): Promise<boolean> => {
  vi.resetModules()
  if (value === undefined) delete process.env.STRIPE_AUTOMATIC_TAX
  else process.env.STRIPE_AUTOMATIC_TAX = value
  const { isAutomaticTaxEnabled } = await import('./stripe.js')
  return isAutomaticTaxEnabled()
}

describe('isAutomaticTaxEnabled', () => {
  afterEach(() => {
    delete process.env.STRIPE_AUTOMATIC_TAX
  })

  it('is off by default and for anything but true or 1', async () => {
    expect(await loadWith(undefined)).toBe(false)
    expect(await loadWith('')).toBe(false)
    expect(await loadWith('false')).toBe(false)
    expect(await loadWith('yes')).toBe(false)
  })

  it('is on for true or 1', async () => {
    expect(await loadWith('true')).toBe(true)
    expect(await loadWith(' TRUE ')).toBe(true)
    expect(await loadWith('1')).toBe(true)
  })
})
