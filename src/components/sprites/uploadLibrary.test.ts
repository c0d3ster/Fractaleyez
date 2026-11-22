import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { UploadLibrary, inUseMessage } from './uploadLibrary'

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>()
  return { default: { ...actual.default, get: vi.fn(), delete: vi.fn(), isAxiosError: actual.default.isAxiosError } }
})

const getToken = vi.fn(async (): Promise<string | null> => 'token')

const axiosError = (status: number, data: unknown): Error =>
  new axios.AxiosError('failed', String(status), undefined, undefined, { status, data } as never)

const uploads = [
  { id: '2', url: 'b.png', kind: 'sprite' as const, createdAt: '2026-11-02T00:00:00.000Z' },
  { id: '1', url: 'a.png', kind: 'sprite' as const, createdAt: '2026-11-01T00:00:00.000Z' },
]

describe('UploadLibrary', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset().mockResolvedValue({ data: { uploads } })
    vi.mocked(axios.delete).mockReset().mockResolvedValue({ status: 204 })
  })

  it('fetches once per user and notifies subscribers', async () => {
    const library = new UploadLibrary()
    const listener = vi.fn()
    library.subscribe(listener)
    await library.load('user_1', getToken)
    await library.load('user_1', getToken)
    expect(axios.get).toHaveBeenCalledTimes(1)
    expect(axios.get).toHaveBeenCalledWith('/api/uploads', { headers: { Authorization: 'Bearer token' } })
    expect(library.getSnapshot()).toEqual({ userId: 'user_1', uploads, status: 'ready' })
    expect(listener).toHaveBeenCalled()
  })

  it('re-reads on force and clears when signed out', async () => {
    const library = new UploadLibrary()
    await library.load('user_1', getToken)
    await library.load('user_1', getToken, true)
    expect(axios.get).toHaveBeenCalledTimes(2)
    await library.load(null, getToken)
    expect(library.getSnapshot()).toEqual({ userId: null, uploads: [], status: 'idle' })
  })

  it('drops a response that a newer load superseded', async () => {
    const library = new UploadLibrary()
    let resolveFirst: (value: unknown) => void = () => undefined
    vi.mocked(axios.get).mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
    const first = library.load('user_1', getToken)
    await library.load('user_2', getToken)
    resolveFirst({ data: { uploads: [] } })
    await first
    expect(library.getSnapshot()).toMatchObject({ userId: 'user_2', uploads, status: 'ready' })
  })

  it('removes a deleted upload from the list', async () => {
    const library = new UploadLibrary()
    await library.load('user_1', getToken)
    expect(await library.remove('2', getToken)).toEqual({ ok: true })
    expect(axios.delete).toHaveBeenCalledWith('/api/uploads/2', { headers: { Authorization: 'Bearer token' } })
    expect(library.getSnapshot().uploads.map((u) => u.id)).toEqual(['1'])
  })

  it('keeps it and returns the server\'s reason on a 409', async () => {
    vi.mocked(axios.delete).mockRejectedValue(axiosError(409, { error: 'Used in A', code: 'upload_in_use', presets: ['A'], logo: false }))
    const library = new UploadLibrary()
    await library.load('user_1', getToken)
    expect(await library.remove('2', getToken)).toEqual({ ok: false, message: 'Used in "A". Remove it there first.' })
    expect(library.getSnapshot().uploads).toHaveLength(2)
  })

  it('treats a 404 as already gone', async () => {
    vi.mocked(axios.delete).mockRejectedValue(axiosError(404, { error: 'Upload not found' }))
    const library = new UploadLibrary()
    await library.load('user_1', getToken)
    expect(await library.remove('2', getToken)).toEqual({ ok: true })
    expect(library.getSnapshot().uploads.map((u) => u.id)).toEqual(['1'])
  })
})

describe('inUseMessage', () => {
  it('names the logo first, then the presets', () => {
    expect(inUseMessage({ presets: ['One', 'Two'], logo: true })).toBe('Used in your logo, "One", "Two". Remove it there first.')
  })
})
