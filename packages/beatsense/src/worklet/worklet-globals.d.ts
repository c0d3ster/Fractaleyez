// What the AudioWorkletGlobalScope gives a processor; the DOM lib does not describe it.
declare const sampleRate: number

declare class AudioWorkletProcessor {
  readonly port: MessagePort
}

declare const registerProcessor: (name: string, processor: new () => AudioWorkletProcessor) => void
