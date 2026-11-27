import { isFeatureEnabled } from '../../config/featureFlags'
import type { FractalFamily } from './family'
import { exponentialFamily } from './exponential'
import { mcmullenFamily } from './mcmullen'
import { cubicFamily, quarticFamily } from './multibrot'
import { quadraticFamily } from './quadratic'
import { sineFamily } from './sine'

export * from './complex'
export * from './family'
export * from './koenigs'
export { exponentialFamily } from './exponential'
export { mcmullenFamily } from './mcmullen'
export { cubicFamily, quarticFamily } from './multibrot'
export { quadraticFamily } from './quadratic'
export { sineFamily } from './sine'

/** Every family the Type picker offers, in its order. A preset stores the index, so only ever append. */
export const FRACTAL_FAMILIES: readonly FractalFamily[] = [quadraticFamily, cubicFamily, quarticFamily, mcmullenFamily, exponentialFamily, sineFamily]

/** The family a stored `fractal.family` value names; anything unknown is the classic one. */
export const getFractalFamily = (index: number): FractalFamily => FRACTAL_FAMILIES[Math.round(index)] ?? quadraticFamily

/** Whether the Types beyond the classic one are released (the `fractalTypes` feature flag). */
export const fractalTypesEnabled = (): boolean => isFeatureEnabled('fractalTypes')

/** The family drawn for a stored `fractal.family` value: the classic one while the other Types are not released, whatever a preset says. */
export const activeFractalFamily = (index: number): FractalFamily => (fractalTypesEnabled() ? getFractalFamily(index) : quadraticFamily)
