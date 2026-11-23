import { useSyncExternalStore } from 'react'
import axios from 'axios'

/** GET /api/uploads (server/services/UploadService.ts's PublicUpload). A video kind can join `sprite` and `avatar` later. */
export type LibraryUpload = {
  id: string
  url: string
  kind: 'sprite' | 'avatar'
  createdAt: string
}

export type UploadLibraryStatus = 'idle' | 'loading' | 'ready' | 'error'

export type UploadLibraryState = {
  userId: string | null
  uploads: LibraryUpload[]
  status: UploadLibraryStatus
}

export type DeleteOutcome = { ok: true } | { ok: false; message: string }

type GetToken = () => Promise<string | null>

const EMPTY: UploadLibraryState = { userId: null, uploads: [], status: 'idle' }

/** The body of a 409 from DELETE /api/uploads/:id (UploadInUseError). `shared`: a built-in or kept preset shows it. */
type UploadInUse = { error: string; code: 'upload_in_use'; presets: string[]; logo: boolean; shared?: boolean }

const isUploadInUse = (value: unknown): value is UploadInUse =>
  typeof value === 'object' && value !== null && (value as { code?: unknown }).code === 'upload_in_use'

/** What the picker says when the server refuses a delete. */
export const inUseMessage = ({ presets, logo, shared }: Pick<UploadInUse, 'presets' | 'logo' | 'shared'>): string => {
  const uses = [...(logo ? ['your logo'] : []), ...presets.map((name) => `"${name}"`), ...(shared ? ['a built-in preset'] : [])]
  return `Used in ${uses.join(', ')}. Remove it there first.`
}

/**
 * The signed-in user's uploads, one list for every picker. A module-level store rather than per-component state, so the
 * particle and logo pickers (and the popped-out config window, rendered by the same React) share one fetch and one list,
 * and a delete in one shows in the others. Only the pickers subscribe, so a change here never re-renders the config UI.
 */
export class UploadLibrary {
  private state: UploadLibraryState = EMPTY
  private readonly listeners = new Set<() => void>()
  private requestId = 0

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): UploadLibraryState => this.state

  private setState(next: UploadLibraryState): void {
    this.state = next
    for (const listener of this.listeners) listener()
  }

  /** Fetches once per user; `force` re-reads (after an upload). Signed out clears the list. */
  load = async (userId: string | null, getToken: GetToken, force = false): Promise<void> => {
    if (!userId) {
      this.requestId++
      if (this.state !== EMPTY) this.setState(EMPTY)
      return
    }
    const sameUser = this.state.userId === userId
    if (!force && sameUser && (this.state.status === 'loading' || this.state.status === 'ready')) return

    const id = ++this.requestId
    this.setState({ userId, uploads: sameUser ? this.state.uploads : [], status: 'loading' })
    try {
      const token = await getToken()
      if (!token) throw new Error('No session token')
      const { data } = await axios.get<{ uploads: LibraryUpload[] }>('/api/uploads', { headers: { Authorization: `Bearer ${token}` } })
      if (id !== this.requestId) return
      this.setState({ userId, uploads: data.uploads ?? [], status: 'ready' })
    } catch {
      if (id !== this.requestId) return
      this.setState({ ...this.state, status: 'error' })
    }
  }

  /** Deletes one upload. A 409 comes back as the "used in" message; a 404 means it is already gone, so it leaves the list too. */
  remove = async (uploadId: string, getToken: GetToken): Promise<DeleteOutcome> => {
    const drop = (): void => this.setState({ ...this.state, uploads: this.state.uploads.filter((u) => u.id !== uploadId) })
    try {
      const token = await getToken()
      if (!token) return { ok: false, message: 'Sign in to delete your images.' }
      await axios.delete(`/api/uploads/${encodeURIComponent(uploadId)}`, { headers: { Authorization: `Bearer ${token}` } })
      drop()
      return { ok: true }
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined
      const body: unknown = axios.isAxiosError(err) ? err.response?.data : undefined
      if (status === 409 && isUploadInUse(body)) return { ok: false, message: inUseMessage(body) }
      if (status === 404) {
        drop()
        return { ok: true }
      }
      return { ok: false, message: 'Could not delete this image.' }
    }
  }
}

export const uploadLibrary = new UploadLibrary()

export const useUploadLibrary = (): UploadLibraryState => useSyncExternalStore(uploadLibrary.subscribe, uploadLibrary.getSnapshot)
