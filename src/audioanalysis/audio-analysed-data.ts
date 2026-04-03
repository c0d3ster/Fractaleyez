/* eslint-disable max-classes-per-file */
import { analyserConfig as AnalyserConfig } from '../config/analyser.config'

export class Peak {
  value: number
  timer: Date | null
  energy: number

  constructor(value: number, timer: Date | null, energy: number) {
    this.value = value
    this.timer = timer
    this.energy = energy
  }

  copy(peak: Peak): void {
    this.value = peak.value
    this.timer = peak.timer
    this.energy = peak.energy
  }
}

export class AudioAnalysedData {
  bufferSize: number
  frequenciesData: Uint8Array
  timedomainData: Uint8Array
  energy: number
  energyHistory: number[]
  energyHistoryDeltaTime: number[]
  energyAverage: number
  peak: Peak
  peakHistory: Peak[]
  multibandEnergy: number[]
  multibandEnergyHistory: number[][]
  multibandEnergyHistoryDeltaTime: number[]
  multibandEnergyAverage: number[]
  multibandPeak: Peak[]
  multibandPeakHistory: Peak[][]

  constructor(bufferSize: number) {
    this.bufferSize = bufferSize

    this.frequenciesData = new Uint8Array(bufferSize)
    this.timedomainData = new Uint8Array(bufferSize)

    this.energy = 0
    this.energyHistory = []
    this.energyHistoryDeltaTime = []
    this.energyAverage = 0

    this.peak = new Peak(0.0, null, 0)
    this.peakHistory = []

    const bands = AnalyserConfig.options.multibandPeakDetection.options.bands
    this.multibandEnergy = new Array(bands)
    this.multibandEnergyHistory = []
    this.multibandEnergyHistoryDeltaTime = []
    this.multibandEnergyAverage = new Array(bands)

    this.multibandPeak = new Array(bands)
    this.multibandPeakHistory = new Array(bands)
    for (let i = 0; i < bands; i++) {
      this.multibandPeak[i] = new Peak(0.0, null, 0)
      this.multibandPeakHistory[i] = []
    }
  }

  setTimedomainData(newTimedomainData: Uint8Array): void {
    this.timedomainData = newTimedomainData
  }

  getTimedomainData(): Uint8Array {
    return this.timedomainData
  }

  setFrequenciesData(newFrequenciesData: Uint8Array): void {
    this.frequenciesData = newFrequenciesData
  }

  getFrequenciesData(): Uint8Array {
    return this.frequenciesData
  }

  setEnergy(newEnergy: number): void {
    this.energy = newEnergy
  }

  getEnergy(): number {
    return this.energy
  }

  setEnergyAverage(newEnergyAverage: number): void {
    this.energyAverage = newEnergyAverage
  }

  getEnergyAverage(): number {
    return this.energyAverage
  }

  setMultibandEnergy(newEnergies: number[]): void {
    this.multibandEnergy = newEnergies
  }

  getMultibandEnergy(): number[] {
    return this.multibandEnergy
  }

  setMultibandEnergyAverage(newEnergiesAverage: number[]): void {
    this.multibandEnergyAverage = newEnergiesAverage
  }

  getMultibandEnergyAverage(): number[] {
    return this.multibandEnergyAverage
  }

  pushNewEnergy(energy: number, deltaTime: number): void {
    this.setEnergy(energy)
    this.energyHistory.push(energy)
    this.energyHistoryDeltaTime.push(deltaTime)

    let deltaTimeSum = 0
    for (let i = this.energyHistoryDeltaTime.length - 1; i >= 0; i--) {
      deltaTimeSum += this.energyHistoryDeltaTime[i] ?? 0
      if (deltaTimeSum >= AnalyserConfig.options.peakDetection.options.energyPersistence) {
        this.energyHistoryDeltaTime.splice(0, i)
        this.energyHistory.splice(0, i)
        break
      }
    }
  }

  getEnergyHistory(): number[] {
    return this.energyHistory
  }

  getMultibandEnergyHistory(): number[][] {
    return this.multibandEnergyHistory
  }

  pushNewMultibandEnergy(multibandEnergy: number[], deltaTime: number): void {
    this.setMultibandEnergy(multibandEnergy)
    this.multibandEnergyHistory.push(multibandEnergy)
    this.multibandEnergyHistoryDeltaTime.push(deltaTime)

    let deltaTimeSum = 0
    for (let i = this.multibandEnergyHistory.length - 1; i >= 0; i--) {
      deltaTimeSum += this.multibandEnergyHistoryDeltaTime[i] ?? 0
      if (deltaTimeSum >= AnalyserConfig.options.multibandPeakDetection.options.energyPersistence) {
        this.multibandEnergyHistory.splice(0, i)
        this.multibandEnergyHistoryDeltaTime.splice(0, i)
        break
      }
    }
  }
}

export class AudioAnalysedDataForVisualization {
  bufferSize: number
  frequenciesData?: Uint8Array
  timedomainData?: Uint8Array
  energy?: number
  energyHistory?: number[]
  energyHistoryDeltaTime?: number[]
  energyAverage?: number
  peak?: Peak
  peakHistory?: Peak[]
  multibandEnergy?: number[]
  multibandEnergyHistory?: number[][]
  multibandEnergyHistoryDeltaTime?: number[]
  multibandEnergyAverage?: number[]
  multibandPeak?: Peak[]
  multibandPeakHistory?: Peak[][]

  constructor(analysedData: AudioAnalysedData) {
    this.bufferSize = analysedData.bufferSize

    const returns = AnalyserConfig.options.returns
    if (returns.frequenciesData) this.frequenciesData = analysedData.frequenciesData
    if (returns.timedomainData) this.timedomainData = analysedData.timedomainData
    if (returns.energy) this.energy = analysedData.energy
    if (returns.energyHistory) {
      this.energyHistory = analysedData.energyHistory
      this.energyHistoryDeltaTime = analysedData.energyHistoryDeltaTime
    }
    if (returns.energyAverage) this.energyAverage = analysedData.energyAverage
    if (returns.peak) this.peak = analysedData.peak
    if (returns.peakHistory) this.peakHistory = analysedData.peakHistory

    if (returns.multibandEnergy) this.multibandEnergy = analysedData.multibandEnergy
    if (returns.multibandEnergyHistory) {
      this.multibandEnergyHistory = analysedData.multibandEnergyHistory
      this.multibandEnergyHistoryDeltaTime = analysedData.multibandEnergyHistoryDeltaTime
    }
    if (returns.multibandEnergyAverage) this.multibandEnergyAverage = analysedData.multibandEnergyAverage
    if (returns.multibandPeak) this.multibandPeak = analysedData.multibandPeak
    if (returns.multibandPeakHistory) this.multibandPeakHistory = analysedData.multibandPeakHistory
  }
}
