import { userConfig as UserConfig } from '../config/user.config'
import { analyserConfig as AnalyserConfig } from '../config/analyser.config'
import { configDefaults } from '../config/configDefaults'

import { AudioData } from '../audiostream/audio-data'
import { AudioAnalysedData, AudioAnalysedDataForVisualization, Peak } from './audio-analysed-data'
import { EASINGS, EasingFn } from '../tools/easings'

export class AudioAnalyser {
  private data: AudioAnalysedData
  private iterations: number

  constructor(bufferSize: number) {
    this.data = new AudioAnalysedData(bufferSize)
    this.iterations = 0

    if (UserConfig.showloginfos) console.info('Analyser initialized\n------------')
  }

  analyse(audioData: AudioData, deltaTime: number, currentTimer: Date): void {
    this.iterations++

    this.data.setTimedomainData(audioData.timedomainData)
    this.data.setFrequenciesData(audioData.frequencyData)

    const returns = AnalyserConfig.options.returns

    if (returns.energy || returns.energyAverage || returns.energyHistory || returns.peak || returns.peakHistory) {
      this.data.pushNewEnergy(this.computeEnergy(this.data.getTimedomainData()), deltaTime)

      if (returns.energyAverage || returns.peak || returns.peakHistory) {
        this.data.setEnergyAverage(this.computeLocalEnergyAverage(this.data.getEnergyHistory()))

        if (returns.peak || returns.peakHistory) {
          this.computePeakDetection(
            this.data.getEnergy(), this.data.getEnergyAverage(), this.data.peak, this.data.peakHistory, currentTimer,
            configDefaults.audio.soundThreshold.value, AnalyserConfig.options.peakDetection.options.peakPersistency,
            configDefaults.audio.ignoreTime.value, EASINGS.linear!
          )
        }
      }
    }

    if (returns.multibandEnergy || returns.multibandEnergyAverage || returns.multibandEnergyHistory || returns.multibandPeak || returns.multibandPeakHistory) {
      this.data.pushNewMultibandEnergy(
        this.computeMultibandEnergy(audioData.frequencyData, AnalyserConfig.options.multibandPeakDetection.options.bands), deltaTime
      )

      if (returns.multibandEnergyAverage || returns.multibandPeak || returns.multibandPeakHistory) {
        this.data.setMultibandEnergyAverage(this.computeMultibandLocalEnergyAverage(this.data.getMultibandEnergyHistory()))

        if (returns.multibandPeakHistory || returns.multibandPeak) {
          this.computeMultibandPeakDetection(
            this.data.getMultibandEnergy(), this.data.getMultibandEnergyAverage(),
            this.data.multibandPeak, this.data.multibandPeakHistory, currentTimer,
            configDefaults.audio.soundThreshold.value, AnalyserConfig.options.multibandPeakDetection.options.peakPersistency,
            configDefaults.audio.ignoreTime.value, EASINGS.linear!
          )
        }
      }
    }
  }

  checkOptions(config: typeof AnalyserConfig): void {
    if (UserConfig.showloginfos) console.info('Checking if the analyser configuration is correct')

    if (config.options.multibandPeakDetection.enabled) {
      // eslint-disable-next-line no-bitwise
      if (!(config.options.multibandPeakDetection.options.bands && (config.options.multibandPeakDetection.options.bands & (config.options.multibandPeakDetection.options.bands - 1)) === 0))
        if (UserConfig.showerrors) console.error('The number of bands for the multiband detection algorithm must be a pow of 2.')
    }

    if (config.options.returns.peakHistory !== config.options.returns.multibandPeakHistory) {
      if (UserConfig.showerrors) {
        console.error(
          'peakHistory and multibandPeakHistory must match in the analyser config (both enabled or both disabled).'
        )
      }
    }

    if (!config.options.multibandPeakDetection.enabled) {
      if (config.options.returns.multibandPeak)
        if (UserConfig.showerrors) console.error('The multiband peak can\'t be computed if the multiband peak detection algorithm is disabled.')
      if (config.options.returns.multibandPeakHistory)
        if (UserConfig.showerrors) console.error('The multiband peak history can\'t be computed if the multiband peak detection algorithm is disabled.')
    }
    if (!config.options.peakDetection.enabled) {
      if (config.options.returns.peak)
        if (UserConfig.showerrors) console.error('The peak can\'t be computed if the peak detection algorithm is disabled.')
      if (config.options.returns.peakHistory)
        if (UserConfig.showerrors) console.error('The peak history can\'t be computed if the peak detection algorithm is disabled.')
    }

    if (UserConfig.showloginfos) console.info('Config checked.\n------------')
  }

  getAnalysedData(): AudioAnalysedData {
    return this.data
  }

  getAnalysedDataForVisualization(): AudioAnalysedDataForVisualization {
    return new AudioAnalysedDataForVisualization(this.data)
  }

  computeEnergy(timedomainData: Uint8Array): number {
    let energy = 0
    for (let i = 0; i < timedomainData.length; i++) {
      energy += Math.abs((timedomainData[i] ?? 0) - 128)
    }
    return energy / timedomainData.length
  }

  computeLocalEnergyAverage(energyHistory: number[]): number {
    return energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length
  }

  computePeakDetection(
    energy: number, energyAverage: number, peak: Peak, peakHistory: Peak[],
    currentTimer: Date, threshold: number, peakPersistency: number,
    ignoreTime: number, interpolationFunction: EasingFn
  ): void {
    if (peak.timer !== null) {
      if (currentTimer.getTime() - peak.timer.getTime() <= ignoreTime) {
        if (peak.value > 0.0) {
          peak.value = this.peakInterpolation(currentTimer, peak.timer, peakPersistency, interpolationFunction)
        }
      } else {
        if (energy / energyAverage > threshold) {
          const detectedPeak = new Peak(1.0, currentTimer, energy)
          if (AnalyserConfig.options.returns.peakHistory)
            peakHistory.push(detectedPeak)
          peak.copy(detectedPeak)
        } else if (peak.value > 0.0) {
          peak.value = this.peakInterpolation(currentTimer, peak.timer, peakPersistency, interpolationFunction)
        }
      }
    } else if (energy / energyAverage > threshold) {
      const detectedPeak = new Peak(1.0, currentTimer, energy)
      if (AnalyserConfig.options.returns.peakHistory)
        peakHistory.push(detectedPeak)
      peak.copy(detectedPeak)
    }
  }

  computeMultibandEnergy(frequencyData: Uint8Array, nbBands: number): number[] {
    const fSize = frequencyData.length
    const bandsEnergy: number[] = new Array(nbBands)

    for (let band = 0; band < nbBands; band++) {
      const firstIndex = this.bandInterpolation(band / nbBands) * fSize
      const lastIndex = this.bandInterpolation((band + 1) / nbBands) * fSize
      let bandEnergy = 0

      for (let f = firstIndex; f < lastIndex; f++) {
        bandEnergy += frequencyData[f] ?? 0
      }

      bandsEnergy[band] = bandEnergy / (lastIndex - firstIndex)
    }

    return bandsEnergy
  }

  computeMultibandLocalEnergyAverage(energiesHistory: number[][]): number[] {
    const bands = AnalyserConfig.options.multibandPeakDetection.options.bands
    const energiesAverage: number[] = new Array(bands)

    for (let i = 0; i < bands; i++) {
      energiesAverage[i] = 0
    }

    for (let i = 0; i < energiesHistory.length; i++) {
      const row = energiesHistory[i]!
      for (let b = 0; b < row.length; b++) {
        energiesAverage[b] = (energiesAverage[b] ?? 0) + (row[b] ?? 0)
      }
    }

    for (let i = 0; i < bands; i++) {
      energiesAverage[i] = (energiesAverage[i] ?? 0) / energiesHistory.length
    }

    return energiesAverage
  }

  computeMultibandPeakDetection(
    multibandEnergy: number[], multibandEnergyAverage: number[],
    multibandPeak: Peak[], multibandPeakHistory: Peak[][],
    currentTimer: Date, threshold: number, peakPersistency: number,
    ignoreTime: number, interpolationFunction: EasingFn
  ): void {
    const bandsNb = multibandPeak.length
    for (let band = 0; band < bandsNb; band++) {
      this.computePeakDetection(
        multibandEnergy[band]!, multibandEnergyAverage[band]!,
        multibandPeak[band]!, multibandPeakHistory[band]!,
        currentTimer, threshold, peakPersistency, ignoreTime, interpolationFunction
      )
    }
  }

  bandInterpolation(bandposition: number): number {
    return bandposition * bandposition
  }

  peakInterpolation(currentTimer: Date, peakTimer: Date, peakPersistency: number, easingFunction: EasingFn): number {
    return Math.max(0.0, easingFunction(1.0 - (currentTimer.getTime() - peakTimer.getTime()) / peakPersistency))
  }
}
