export class AudioData {
  bufferSize: number
  timedomainData: Uint8Array
  frequencyData: Uint8Array

  constructor(timedomainData: Uint8Array, frequencyData: Uint8Array, bufferSize: number) {
    this.bufferSize = bufferSize
    this.timedomainData = timedomainData
    this.frequencyData = frequencyData
  }
}
