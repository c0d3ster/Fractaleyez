import type { SectionState } from '../audioanalysis/sections'
import { ghostKey, ghostStore, type GhostStore } from '../utils/ghostStore'
import { KaleidoscopeAuto, type KaleidoscopeFold } from './kaleidoscope-target'
import { rollDenominator, type RollLevel } from './roll-rate'

// What Auto publishes for the config to draw. Everything it steers sits in the Effects section for now.
const AUTO_GHOST_PREFIX = 'effects.'
const KALEIDOSCOPE_GHOST = ghostKey('effects', 'kaleidoscope')
const KALEIDOSCOPE_COUNT_GHOST = ghostKey('effects', 'kaleidoscopeCount')
/** The snare roll's note value (4, 8 or 16) while one is read, for the Auto switch to show. */
export const ROLL_GHOST = ghostKey('auto', 'roll')

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

  /** `ghosts` is where Auto shows what it is doing, so the config can draw it beside the stored values (see ghostStore). */
  constructor(private readonly ghosts: GhostStore = ghostStore) {}

  isEnabled = (): boolean => this.enabled

  setEnabled = (enabled: boolean): void => {
    if (enabled === this.enabled) return
    this.enabled = enabled
    // Coming back starts from the song as it is, not from where it left off.
    if (enabled) this.kaleidoscopeAuto.reset()
    // Off, there is nothing to show: the stored settings are what is drawn again.
    else {
      this.ghosts.clear(AUTO_GHOST_PREFIX)
      this.ghosts.clear('auto.')
    }
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

  /** The fold to draw instead of the stored kaleidoscope settings, or null when Auto is off. Called every frame; `beat` is true on the frame a beat is detected, which is when a decided change shows. */
  kaleidoscope = (state: SectionState, nowMs: number, beat: boolean, roll: RollLevel | null = null): KaleidoscopeFold | null => {
    if (!this.enabled) return null
    const fold = this.kaleidoscopeAuto.step(state, nowMs, beat, roll)
    // What the drums are rolling at, shown by the switch while it is read, so a roll that is missed can be seen.
    this.ghosts.set(ROLL_GHOST, roll === null ? null : rollDenominator(roll))
    // The config shows this beside the stored switch and count. A count only means something while the fold is on.
    this.ghosts.set(KALEIDOSCOPE_GHOST, fold.on)
    this.ghosts.set(KALEIDOSCOPE_COUNT_GHOST, fold.on ? fold.count : null)
    return fold
  }

  /**
   * True on the frame the drop's big fold first shows (read after `kaleidoscope`): one shockwave marks the jump to it. Only that one, not
   * the Shockwave effect, which would fire on every beat, and never while Auto is off.
   */
  dropShockwave = (): boolean => this.enabled && this.kaleidoscopeAuto.landedDrop()
}

export const autoMode = new AutoMode()

/** The effects items Auto steers: touching one of these is taking over. */
export const isAutomatedEffectItem = (category: string, item: string): boolean =>
  category === 'effects' && item.startsWith('kaleidoscope')
