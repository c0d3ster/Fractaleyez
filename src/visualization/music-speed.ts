import { AudioAnalysedDataForVisualization } from '../audioanalysis/audio-analysed-data'

/** How much the music speeds motion up: 1 when quiet, growing with the average and the current energy. */
export const getMusicSpeedMultiplier = ({ energyAverage, energy }: AudioAnalysedDataForVisualization): number =>
  1 + ((energyAverage ?? 0) + (energy ?? 0)) / 10
