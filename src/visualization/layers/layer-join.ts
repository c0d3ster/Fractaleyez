import type { LayerKey } from '../../config/configDefaults'

/** Whether a layer can join: `ready` to draw its first frame, `waiting` for what it shows (its image, its clip), or `off` (disabled). */
export type JoinState = 'ready' | 'waiting' | 'off'

// A layer still waiting after this long stops holding back the ones after it (they join without it; it joins when it is ready).
const MAX_BLOCK_MS = 2000

/**
 * Lets the layers come in one at a time, in order, instead of all on the first frame: the logo can show while the rest is still loading,
 * and each layer's first draw (its shader compile, its first uploads) lands in a frame of its own. At most one layer joins per frame, the
 * next in `order` once it is ready; one that is off is passed over, and one that is waiting holds back the ones after it, for up to
 * MAX_BLOCK_MS. Until a layer joins the compositor treats it as inactive, and once it joins it fades in from black.
 */
export class LayerJoin {
  private readonly joined = new Set<LayerKey>()
  private readonly waitingSince = new Map<LayerKey, number>()

  constructor(
    private readonly order: readonly LayerKey[],
    private readonly state: (key: LayerKey) => JoinState,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Called once per drawn frame, before the layers are planned. */
  beginFrame = (): void => {
    if (this.joined.size === this.order.length) return
    const now = this.now()
    for (const key of this.order) {
      if (this.joined.has(key)) continue
      const state = this.state(key)
      if (state === 'off') continue
      if (state === 'ready') {
        this.joined.add(key)
        return
      }
      const since = this.waitingSince.get(key) ?? now
      this.waitingSince.set(key, since)
      if (now - since < MAX_BLOCK_MS) return
    }
  }

  has = (key: LayerKey): boolean => this.joined.has(key)
}
