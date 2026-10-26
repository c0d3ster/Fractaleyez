type TargetSize = { width: number; height: number }

/**
 * Decides whether a layer that draws into a persistent render target has to draw this frame. The target keeps its pixels
 * between frames, so a layer whose picture has not changed (a video between decoded frames) can skip the draw. It must
 * draw when something marked it dirty, while it animates, and when the target is a different one or was resized (a resize
 * reallocates the target and loses its contents).
 */
export class RedrawGate {
  private dirty = true
  private lastTarget: TargetSize | null = null
  private lastWidth = 0
  private lastHeight = 0

  markDirty = (): void => {
    this.dirty = true
  }

  shouldDraw = (target: TargetSize, animating: boolean): boolean => {
    const targetChanged = target !== this.lastTarget || target.width !== this.lastWidth || target.height !== this.lastHeight
    if (!this.dirty && !animating && !targetChanged) return false
    this.dirty = false
    this.lastTarget = target
    this.lastWidth = target.width
    this.lastHeight = target.height
    return true
  }
}
