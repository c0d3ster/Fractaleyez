import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { warmSpriteCache as WarmSpriteCache, getResolvedSpriteUrl as GetResolvedSpriteUrl } from './spriteCache'

type FakeCache = {
  store: Map<string, Response>
  match: (url: string) => Promise<Response | undefined>
  put: (url: string, res: Response) => Promise<void>
  delete: (url: string) => Promise<boolean>
}

const makeFakeCache = (): FakeCache => {
  const store = new Map<string, Response>()
  return {
    store,
    match: vi.fn(async (url: string) => store.get(url)),
    put: vi.fn(async (url: string, res: Response) => {
      store.set(url, res)
    }),
    delete: vi.fn(async (url: string) => store.delete(url)),
  }
}

describe('spriteCache', () => {
  const originalFetch = global.fetch
  const originalCaches = (globalThis as { caches?: unknown }).caches
  let warmSpriteCache: typeof WarmSpriteCache
  let getResolvedSpriteUrl: typeof GetResolvedSpriteUrl

  // resolvedUrls is a private module-level singleton -- reset the module between tests so
  // eviction in one test can't affect entries resolved by another.
  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./spriteCache')
    warmSpriteCache = mod.warmSpriteCache
    getResolvedSpriteUrl = mod.getResolvedSpriteUrl
  })

  afterEach(() => {
    global.fetch = originalFetch
    ;(globalThis as { caches?: unknown }).caches = originalCaches
    vi.restoreAllMocks()
  })

  it('passes local (data:/blob:/relative) sprite references through unchanged, without touching the network', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy as unknown as typeof fetch

    await warmSpriteCache(['data:image/png;base64,AAAA', 'galaxySprite.png'])

    expect(getResolvedSpriteUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(getResolvedSpriteUrl('galaxySprite.png')).toBe('galaxySprite.png')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falls back to the original URL when Cache Storage is unavailable', async () => {
    ;(globalThis as { caches?: unknown }).caches = undefined
    const url = 'https://particles.example.com/unavailable-caches.png'

    await warmSpriteCache([url])

    expect(getResolvedSpriteUrl(url)).toBe(url)
  })

  it('renders a previously-cached sprite with zero network access (no-network test)', async () => {
    const fakeCache = makeFakeCache()
    const url = 'https://particles.example.com/warm-from-earlier-session.png'
    // Simulate a response cached during an earlier, online session.
    fakeCache.store.set(url, new Response(new Blob(['fake-image-bytes'])))
    ;(globalThis as { caches?: unknown }).caches = { open: vi.fn(async () => fakeCache) }

    const fetchSpy = vi.fn(() => Promise.reject(new Error('network unavailable')))
    global.fetch = fetchSpy as unknown as typeof fetch

    await warmSpriteCache([url])

    const resolved = getResolvedSpriteUrl(url)
    expect(resolved).not.toBe(url)
    expect(resolved.startsWith('blob:')).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fetches and caches a not-yet-seen sprite when the network is available', async () => {
    const fakeCache = makeFakeCache()
    const url = 'https://particles.example.com/first-time.png'
    ;(globalThis as { caches?: unknown }).caches = { open: vi.fn(async () => fakeCache) }

    const fetchSpy = vi.fn(async () => new Response(new Blob(['fresh-image-bytes']), { status: 200 }))
    global.fetch = fetchSpy as unknown as typeof fetch

    await warmSpriteCache([url])

    expect(fetchSpy).toHaveBeenCalledWith(url)
    expect(fakeCache.store.has(url)).toBe(true)
    expect(getResolvedSpriteUrl(url).startsWith('blob:')).toBe(true)
  })

  it('leaves an unresolvable sprite falling back to its original URL when offline and never cached', async () => {
    const fakeCache = makeFakeCache()
    const url = 'https://particles.example.com/never-seen-and-offline.png'
    ;(globalThis as { caches?: unknown }).caches = { open: vi.fn(async () => fakeCache) }
    global.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch

    await warmSpriteCache([url])

    expect(getResolvedSpriteUrl(url)).toBe(url)
  })

  it('evicts entries no longer in the active sprite list, revoking their object URL and removing them from Cache Storage', async () => {
    const fakeCache = makeFakeCache()
    const staleUrl = 'https://particles.example.com/stale.png'
    const activeUrl = 'https://particles.example.com/active.png'
    ;(globalThis as { caches?: unknown }).caches = { open: vi.fn(async () => fakeCache) }
    global.fetch = vi.fn(async () => new Response(new Blob(['bytes']), { status: 200 })) as unknown as typeof fetch

    await warmSpriteCache([staleUrl, activeUrl])
    expect(getResolvedSpriteUrl(staleUrl).startsWith('blob:')).toBe(true)
    expect(fakeCache.store.has(staleUrl)).toBe(true)

    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    await warmSpriteCache([activeUrl])

    expect(getResolvedSpriteUrl(staleUrl)).toBe(staleUrl)
    expect(fakeCache.store.has(staleUrl)).toBe(false)
    expect(revokeSpy).toHaveBeenCalledTimes(1)
    expect(getResolvedSpriteUrl(activeUrl).startsWith('blob:')).toBe(true)
  })
})
