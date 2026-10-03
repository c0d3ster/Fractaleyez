import * as THREE from 'three'

import { AudioAnalysedDataForVisualization } from '../../audioanalysis/audio-analysed-data'

/** One drawable layer. Draws into the target it is handed and never touches the screen. */
export type Layer = {
  render: (target: THREE.WebGLRenderTarget, deltaTime: number, audio: AudioAnalysedDataForVisualization) => void
  /** Called with the drawing buffer size in pixels; the layer's own target is sized by the compositor. */
  resize: (width: number, height: number) => void
  dispose: () => void
  /** When it returns false the layer is skipped this frame, same as a disabled one. Omitted means always active. */
  isActive?: () => boolean
}
