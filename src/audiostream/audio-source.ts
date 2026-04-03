import { userConfig as UserConfig } from '../config/user.config'

export class AudioSource {
  private audioContext: AudioContext
  private source: AudioBufferSourceNode | MediaStreamAudioSourceNode | null
  private sourceType: string
  private audioFeedback: boolean

  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
    this.source = null
    this.sourceType = ''
    this.audioFeedback = false
  }

  loadAudioFromLibrary(filepath: string): Promise<void> {
    if (UserConfig.showloginfos) console.info(`Loading file ${filepath}`)

    return new Promise((resolve, reject) => {
      this.loadFile(filepath).then((audioData) => {
        this.audioContext.decodeAudioData(audioData).then((buffer) => {
          this.source = this.audioContext.createBufferSource()
          this.source.buffer = buffer
          this.sourceType = 'audiofile'
          if (UserConfig.showloginfos) console.info(`Audio from file ${filepath} loaded\n------------`)
          resolve()
        }).catch((error) => {
          if (UserConfig.showerrors) console.error(`File ${filepath} loaded, but can't decode audio data.\n${error}`)
          reject(error)
        })
      }).catch((error) => {
        if (UserConfig.showerrors) console.error(`File ${filepath} cannot be loaded.\n${error}`)
        reject(error)
      })
    })
  }

  loadAudioFromFile(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.addEventListener('load', (e) => {
        const data = e.target?.result as ArrayBuffer
        this.audioContext.decodeAudioData(data).then((buffer) => {
          this.source = this.audioContext.createBufferSource()
          this.source.buffer = buffer
          this.sourceType = 'audiofile'
          if (UserConfig.showloginfos) console.info('Audio from file loaded\n------------')
          resolve()
        }).catch(reject)
      })
      reader.readAsArrayBuffer(file)
    })
  }

  getStreamFromMicrophone(audioFeedback?: boolean): Promise<void> {
    if (UserConfig.showloginfos) console.info('Setting up microphone')

    this.audioFeedback = typeof audioFeedback === 'undefined' ? false : audioFeedback

    return new Promise((resolve, reject) => {
      if (!navigator.mediaDevices) {
        if (UserConfig.showerrors) console.info('getUserMedia is not supported on this browser')
        reject(new Error('getUserMedia is not supported on this browser'))
        return
      }

      const timeoutMs = 30000
      let timeoutId: ReturnType<typeof setTimeout> | undefined

      const clearWait = (): void => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId)
          timeoutId = undefined
        }
      }

      timeoutId = setTimeout(() => {
        timeoutId = undefined
        if (UserConfig.showloginfos) console.info('Microphone attempt timed out')
        reject(new Error('Microphone getUserMedia timed out'))
      }, timeoutMs)

      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        clearWait()
        this.source = this.audioContext.createMediaStreamSource(stream)
        this.sourceType = 'microphone'
        if (UserConfig.showloginfos) console.info('Audio stream is coming from microphone')
        resolve()
      }).catch((error) => {
        clearWait()
        if (UserConfig.showerrors) console.error(`The following gUM error occured: ${error}`)
        reject(error)
      })
    })
  }

  private loadFile(filepath: string): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.responseType = 'arraybuffer'
      xhr.open('GET', filepath, true)
      xhr.onloadend = () => {
        if (xhr.status === 404)
          reject(xhr.statusText)
        else
          resolve(xhr.response as ArrayBuffer)
      }
      xhr.send()
    })
  }

  play(when = 0, offset = 0): void {
    if (this.sourceType === 'audiofile')
      (this.source as AudioBufferSourceNode).start(when, offset)
    else if (UserConfig.showerrors) {
      console.error('Couldn\'t start the audio source. Source is a microphone.')
    }
  }

  isThereFeedback(): boolean {
    if (this.sourceType === 'microphone')
      return this.audioFeedback
    else
      return true
  }

  getAudioContext(): AudioContext {
    return this.audioContext
  }

  getSourceNode(): AudioBufferSourceNode | MediaStreamAudioSourceNode | null {
    if (UserConfig.showerrors && !this.source) console.error('Audio source has not bet set up')
    return this.source
  }
}
