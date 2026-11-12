// Clean-room audio capture: the microphone into the measuring worklet, frames out. No global is touched until a method runs.
export { AudioSource, MIC_CONSTRAINTS } from './audio-source'
export type { AudioSourceOptions, FrameListener } from './audio-source'
