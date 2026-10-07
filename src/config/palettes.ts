/**
 * Named palettes for the Color config. Each is an ordered list of hex stops. A `cyclic` palette already ends where it
 * starts, so the fractal's color cycle wraps without a seam. The others are one-way ramps: picking one turns Mirror on,
 * which plays the ramp out and back to close the loop, and Reverse flips which end it starts from. Black reads as
 * see-through under the mask blend mode, so only a few (Ice, Black Gold, Mono) start from it.
 */

export type PaletteDefinition = {
  id: string
  label: string
  stops: readonly string[]
  /** Ends where it starts. One-way ramps (false) get Mirror switched on when they are picked. */
  cyclic: boolean
}

/** The unrestricted rainbow, drawn from the hue range ring. Not a stop list: Orbit and Fractal compute it directly. */
export const RAINBOW_PALETTE = 'rainbow'
/** The user's own stops, edited in the Color config. */
export const CUSTOM_PALETTE = 'custom'

export const PALETTES: readonly PaletteDefinition[] = [
  { id: 'twilight', label: 'Twilight', stops: ['#2f1437', '#701f57', '#b43e55', '#d9805f', '#dcae9e', '#e2d9e2', '#a9c2d0', '#6f95b8', '#5f68ad', '#5a3b8c', '#2f1437'], cyclic: true },
  { id: 'rosewood', label: 'Rosewood', stops: ['#3b1561', '#5a4fa8', '#8fa6d9', '#e9e2dc', '#e0a38f', '#c0607a', '#3b1561'], cyclic: true },
  { id: 'neon', label: 'Neon', stops: ['#ff00c8', '#7a00ff', '#00e5ff', '#00ff9c', '#ff00c8'], cyclic: true },
  { id: 'pastel', label: 'Pastel', stops: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff', '#ffadad'], cyclic: true },
  { id: 'viridis', label: 'Viridis', stops: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'], cyclic: false },
  { id: 'inferno', label: 'Inferno', stops: ['#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4'], cyclic: false },
  { id: 'turbo', label: 'Turbo', stops: ['#30123b', '#4145ab', '#4675ed', '#39a2fc', '#1bcfd4', '#24eca6', '#61fc6c', '#a4fc3b', '#d1e834', '#f3c63a', '#fe9b2d', '#f36315', '#d93806', '#b11901', '#7a0403'], cyclic: false },
  { id: 'ocean', label: 'Ocean', stops: ['#03045e', '#0077b6', '#00b4d8', '#90e0ef', '#caf0f8'], cyclic: false },
  { id: 'ember', label: 'Ember', stops: ['#4a0d0d', '#9b1c0a', '#e8590c', '#ffb703', '#fff3b0'], cyclic: false },
  { id: 'ice', label: 'Ice', stops: ['#0b132b', '#1c2541', '#3a6ea5', '#5bc0eb', '#e8f7ff'], cyclic: false },
  { id: 'sunset', label: 'Sunset', stops: ['#1a0b3b', '#5b2a86', '#c13584', '#fd5949', '#feda75', '#fff6d5'], cyclic: false },
  { id: 'forest', label: 'Forest', stops: ['#0f3d1e', '#1b5e20', '#4c9a2a', '#a3c853', '#f1f8e9'], cyclic: false },
  { id: 'gold', label: 'Black Gold', stops: ['#000000', '#3d2c00', '#a67c00', '#ffd700', '#fff8dc'], cyclic: false },
  { id: 'mono', label: 'Mono', stops: ['#000000', '#ffffff'], cyclic: false },
]

export const PALETTE_BY_ID: Readonly<Record<string, PaletteDefinition | undefined>> = Object.fromEntries(
  PALETTES.map((palette) => [palette.id, palette])
)
