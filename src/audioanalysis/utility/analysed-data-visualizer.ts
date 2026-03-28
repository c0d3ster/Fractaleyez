import { userConfig as UserConfig } from '../../config/user.config'
import { analyserConfig as AnalyserConfig } from '../../config/analyser.config'

import { AudioAnalysedData, Peak } from '../audio-analysed-data'

const PANNEL_SIGNAL = { pos_x: 0, pos_y: 0, size_x: 256, size_y: 128 }
const PANNEL_SPECTRUM = { pos_x: 256, pos_y: 0, size_x: 256, size_y: 128 }
const PANNEL_ENERGY = { pos_x: 512, pos_y: 0, size_x: 256, size_y: 128 }
const PANNEL_MULTIBAND_ENERGIES = { pos_x: 0, pos_y: 128, size_x: 1024, size_y: 125 }
const PANNEL_ALGO_1 = { pos_x: 0, pos_y: 300, size_x: 1024, size_y: 40 }
const PANNEL_ALGO_2 = { pos_x: 0, pos_y: 357, size_x: 1024, size_y: 400 }

// suppress unused variable warning for PANNEL_SIGNAL since it's defined for completeness
void PANNEL_SIGNAL

export class AnalysedDataVisualizer {
  private canvas: HTMLCanvasElement | null
  private context: CanvasRenderingContext2D | null
  private frame: number

  constructor() {
    this.canvas = null
    this.context = null
    this.frame = 0
  }

  init(): void {
    this.canvas = document.createElement('canvas')
    this.canvas.setAttribute('width', '1025')
    this.canvas.setAttribute('height', '1024')
    document.body.appendChild(this.canvas)
    this.context = this.canvas.getContext('2d')
    if (UserConfig.showloginfos) console.info('Visualizer initialized\n------------')
  }

  draw(analysedData: AudioAnalysedData, startTimer: Date): void {
    this.frame++

    this.context!.clearRect(0, 0, this.canvas!.width, this.canvas!.height)
    this.context!.fillStyle = 'black'
    this.context!.fillRect(0, 0, this.canvas!.width, this.canvas!.height)

    this.drawSpectrum(analysedData.getFrequenciesData())
    this.drawPeakDetection(analysedData.peak, analysedData.peakHistory, startTimer)
    this.drawMultibandPeakDetection(analysedData.multibandPeak, analysedData.multibandPeakHistory, startTimer)
  }

  drawSpectrum(frequencyData: Uint8Array): void {
    const pannel = PANNEL_SPECTRUM
    const ctx = this.context!

    ctx.strokeStyle = 'white'
    ctx.strokeRect(pannel.pos_x + 0.5, pannel.pos_y + 0.5, pannel.size_x, pannel.size_y)
    ctx.font = '12px Lucida Console'
    ctx.fillStyle = 'white'
    ctx.fillText('Signal spectrum', pannel.pos_x + 5, pannel.pos_y + 13)

    const freqWidth = pannel.size_x / frequencyData.length
    const heightRatio = pannel.size_y / 255

    for (let i = 0; i < frequencyData.length; i++) {
      const val = frequencyData[i] ?? 0
      ctx.fillStyle = `hsl(${i / frequencyData.length * 180}, 100%, 50%)`
      ctx.fillRect(pannel.pos_x + freqWidth * i + 1, pannel.pos_y + pannel.size_y - val * heightRatio, freqWidth, val * heightRatio)
    }
  }

  drawEnergyHistogram(energyHistory: number[], energyAverage: number): void {
    const rect = PANNEL_ENERGY
    const ctx = this.context!

    ctx.strokeStyle = 'white'
    ctx.strokeRect(rect.pos_x + 0.5, rect.pos_y + 0.5, rect.size_x, rect.size_y)
    ctx.font = '12px Lucida Console'
    ctx.fillStyle = 'red'
    ctx.fillText('Moment energy', rect.pos_x + 5, rect.pos_y + 13)
    ctx.fillStyle = 'white'
    ctx.fillText('on signal compared to', rect.pos_x + 107, rect.pos_y + 13)
    ctx.fillStyle = '#00ff00'
    ctx.fillText('local average energy', rect.pos_x + 5, rect.pos_y + 27)

    ctx.beginPath()
    ctx.moveTo(rect.pos_x + rect.size_x, rect.pos_y + rect.size_y - energyAverage)
    ctx.lineTo(rect.pos_x + rect.size_x - energyHistory.length * 2, rect.pos_y + rect.size_y - energyAverage)
    ctx.strokeStyle = '#00ff00'
    ctx.stroke()
    ctx.closePath()

    ctx.beginPath()
    for (let i = 0; i < energyHistory.length; i++) {
      ctx.lineTo(rect.pos_x + rect.size_x - i * 2, rect.pos_y + rect.size_y - (energyHistory[energyHistory.length - i - 1] ?? 0))
    }
    ctx.strokeStyle = 'red'
    ctx.stroke()
    ctx.closePath()
  }

  drawPeakDetection(peak: Peak, peakHistory: Peak[], startTimer: Date): void {
    const rect = PANNEL_ALGO_1
    const ctx = this.context!

    ctx.strokeStyle = 'white'
    ctx.strokeRect(rect.pos_x + 0.5, rect.pos_y + 0.5, rect.size_x, rect.size_y)
    ctx.font = '12px Lucida Console'
    ctx.fillStyle = 'white'
    ctx.fillText(`ALGO1 / threshold: ${AnalyserConfig.options.peakDetection.options.threshold_DEFAULT} / ignoreTime: ${AnalyserConfig.options.peakDetection.options.ignoreTime_DEFAULT} / results: ${peakHistory.length}`, rect.pos_x + 5, rect.pos_y - 2)

    for (let i = 0; i < peakHistory.length; i++) {
      const p = peakHistory[i]!
      ctx.beginPath()
      ctx.moveTo(rect.pos_x + (p.timer!.getTime() - startTimer.getTime()) / 1000 * 3, rect.pos_y + rect.size_y)
      ctx.lineTo(rect.pos_x + (p.timer!.getTime() - startTimer.getTime()) / 1000 * 3, rect.pos_y + 1)
      ctx.strokeStyle = '#00ff00'
      ctx.stroke()
      ctx.closePath()
    }

    const now = new Date()
    ctx.beginPath()
    ctx.moveTo(rect.pos_x + (now.getTime() - startTimer.getTime()) / 1000 * 3, rect.pos_y + rect.size_y)
    ctx.lineTo(rect.pos_x + (now.getTime() - startTimer.getTime()) / 1000 * 3, rect.pos_y + 1)
    ctx.strokeStyle = 'red'
    ctx.stroke()
    ctx.closePath()

    const beatPower = peak.value
    ctx.beginPath()
    ctx.arc(rect.pos_x + rect.size_x - 20, rect.pos_y + rect.size_y / 2, 10, 0, 2 * Math.PI)
    ctx.fillStyle = `rgba(0,255,0,${beatPower})`
    ctx.fill()
    ctx.closePath()
  }

  drawMultibandHistogram(energiesHistory: number[][]): void {
    const pannel = PANNEL_MULTIBAND_ENERGIES
    const ctx = this.context!
    const bands = AnalyserConfig.options.multibandPeakDetection.options.bands

    ctx.strokeStyle = 'white'
    ctx.strokeRect(pannel.pos_x + 0.5, pannel.pos_y + 0.5, pannel.size_x, pannel.size_y)
    ctx.font = '12px Lucida Console'
    ctx.fillStyle = 'white'
    ctx.fillText(`Multi-band energies comparaisons: ${bands} bands / ${AnalyserConfig.options.multibandPeakDetection.options.energyPersistence}ms energy persistence / max 28 on screen`, pannel.pos_x + 5, pannel.pos_y + 13)

    const band_histogram_width = 64
    const band_histogram_height = 48
    const margin = 5
    let bands_y = 18
    let bands_x = margin

    for (let band = 0; (band < bands && band < 28); band++) {
      if (bands_x + margin + band_histogram_width > this.canvas!.width) {
        bands_x = margin
        bands_y += margin + band_histogram_height
      }

      ctx.strokeStyle = 'white'
      ctx.strokeRect(pannel.pos_x + bands_x + 0.5, pannel.pos_y + bands_y + 0.5, band_histogram_width, band_histogram_height)

      ctx.beginPath()
      for (let i = 0; i < energiesHistory.length; i++) {
        const row = energiesHistory[energiesHistory.length - i - 1]!
        ctx.lineTo(pannel.pos_x + bands_x + 0.5 + band_histogram_width - i / 2, pannel.pos_y + bands_y + band_histogram_height - 0.5 - (row[band] ?? 0) * band_histogram_height / 256)
      }
      ctx.strokeStyle = 'red'
      ctx.stroke()
      ctx.closePath()

      if (!(bands_x + margin + band_histogram_width > this.canvas!.width)) {
        bands_x += margin + band_histogram_width
      }
    }
  }

  drawMultibandPeakDetection(peaks: Peak[], peaksHistory: Peak[][], startTimer: Date): void {
    const rect = PANNEL_ALGO_2
    const ctx = this.context!
    const bands = AnalyserConfig.options.multibandPeakDetection.options.bands

    ctx.strokeStyle = 'white'
    ctx.strokeRect(rect.pos_x + 0.5, rect.pos_y + 0.5, rect.size_x, rect.size_y)
    ctx.font = '12px Lucida Console'
    ctx.fillStyle = 'white'
    ctx.fillText(`ALGO2 / bands: ${bands} threshold: ${AnalyserConfig.options.multibandPeakDetection.options.threshold} / ignoreTime: ${AnalyserConfig.options.multibandPeakDetection.options.ignoreTime}`, rect.pos_x + 5, rect.pos_y - 2)

    const band_height = 20
    const margin = 5
    const currentTimer = new Date()

    for (let b = 0; b < bands; b++) {
      const bandHistory = peaksHistory[b]!
      for (let i = 0; i < bandHistory.length; i++) {
        const p = bandHistory[i]!
        ctx.beginPath()
        ctx.moveTo(1 + rect.pos_x + margin + (p.timer!.getTime() - startTimer.getTime()) / 1000 * 3, rect.pos_y + b * band_height + margin * (b + 1))
        ctx.lineTo(1 + rect.pos_x + margin + (p.timer!.getTime() - startTimer.getTime()) / 1000 * 3, rect.pos_y + b * band_height + margin * (b + 1) + band_height)
        ctx.strokeStyle = `hsl(${b / bands * 180}, 100%, 50%)`
        ctx.stroke()
        ctx.closePath()
      }

      const beatPower = peaks[b]!.value
      ctx.beginPath()
      ctx.arc(rect.pos_x + rect.size_x - 20, rect.pos_y + b * band_height + margin * (b + 1) + band_height / 2, 7, 0, 2 * Math.PI)
      ctx.fillStyle = `hsl(${b / bands * 180}, 100%, ${beatPower * 50}%)`
      ctx.fill()
      ctx.closePath()

      ctx.beginPath()
      ctx.moveTo(1 + margin + rect.pos_x + (currentTimer.getTime() - startTimer.getTime()) / 1000 * 3, rect.pos_y + (1 + b) * margin + b * band_height)
      ctx.lineTo(1 + margin + rect.pos_x + (currentTimer.getTime() - startTimer.getTime()) / 1000 * 3, rect.pos_y + (1 + b) * margin + (b + 1) * band_height)
      ctx.strokeStyle = 'white'
      ctx.stroke()
      ctx.closePath()

      ctx.strokeStyle = 'white'
      ctx.strokeRect(rect.pos_x + margin + 0.5, rect.pos_y + band_height * b + (b + 1) * margin + 0.5, rect.size_x - margin * 2, band_height)
    }
  }
}
