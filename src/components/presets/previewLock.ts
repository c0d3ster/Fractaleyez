import { useSyncExternalStore } from 'react'

type Listener = () => void

/**
 * Whether a premium preview is running, so the config controls can lock (visible, disabled) and the hotkeys that change the
 * config stand down. A store outside React because the preset list that starts a preview, the config UI (the sidebar and the
 * pop-out window, both rendered by the main window's React) and `main.ts`'s hotkeys all read it.
 */
export class PreviewLock {
  private locked = false
  private readonly listeners = new Set<Listener>()

  isLocked = (): boolean => this.locked

  set = (locked: boolean): void => {
    if (locked === this.locked) return
    this.locked = locked
    ;[...this.listeners].forEach((listener) => listener())
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

export const previewLock = new PreviewLock()

export const usePreviewLocked = (): boolean => useSyncExternalStore(previewLock.subscribe, previewLock.isLocked)
