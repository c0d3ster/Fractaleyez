import type { AudioSnapshot } from '../audioanalysis/audio-snapshot'

/** How much the music speeds motion up: 1 when quiet, growing with the average and the current energy. */
export const getMusicSpeedMultiplier = ({ energyAverage, energy }: AudioSnapshot): number =>
  1 + (energyAverage + energy) / 10
