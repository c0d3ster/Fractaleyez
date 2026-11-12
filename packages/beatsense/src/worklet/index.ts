// What the worklet measures and how a frame travels. The processor itself (`processor.ts`) is its own bundle entry, not exported here.
export { FrameEmitter } from './frame-emitter'
export { CAPTURE_HZ, PROCESSOR_NAME, packFrame, toAudioFrame, unpackFrame } from './frame-message'
export type { CaptureCommand, CaptureFrame } from './frame-message'
