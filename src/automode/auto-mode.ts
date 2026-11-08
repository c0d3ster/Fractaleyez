import type { SectionState } from '../audioanalysis/sections'
import { KaleidoscopeAuto, type KaleidoscopeFold } from './kaleidoscope-target'

/**
 * Auto mode: the visualizer follows the song on its own, until the user takes over. It is on by default, and it
 * goes off when the user adjusts something Auto is steering or picks a preset. It only supplies targets that the
 * renderer reads in place of the stored values; it never writes the config, so turning it off puts the preset back.
 * The first target is the kaleidoscope (see docs/implementation-plans/auto-mode.md).
 */
export class AutoMode {
  private enabled = true
  private readonly listeners = new Set<() => void>()
  private readonly kaleidoscopeAuto = new KaleidoscopeAuto()

  isEnabled = (): boolean => this.enabled

  setEnabled = (enabled: boolean): void => {
    if (enabled === this.enabled) return
    this.enabled = enabled
    // Coming back starts from the song as it is, not from where it left off.
    if (enabled) this.kaleidoscopeAuto.reset()
    this.listeners.forEach((listener) => listener())
  }

  /** The user did something deliberate in a category Auto steers: Auto steps back. */
  takeOver = (): void => this.setEnabled(false)

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** The fold to draw instead of the stored kaleidoscope settings, or null when Auto is off. Called every frame. */
  kaleidoscope = (state: SectionState, nowMs: number): KaleidoscopeFold | null =>
    this.enabled ? this.kaleidoscopeAuto.step(state, nowMs) : null
}

export const autoMode = new AutoMode()

/** The effects items Auto steers: touching one of these is taking over. */
export const isAutomatedEffectItem = (category: string, item: string): boolean =>
  category === 'effects' && item.startsWith('kaleidoscope')
