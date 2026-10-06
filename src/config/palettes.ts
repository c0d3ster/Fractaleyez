/**
 * Named palettes for the Color config. Each is an ordered list of hex stops that plays as a loop: the ones that do not
 * come back to their first color on their own are written out and back (`loop`), so none of them has a seam where the
 * fractal's color cycle wraps.
 */

export type PaletteDefinition = {
  id: string
  label: string
  stops: readonly string[]
}

/** The unrestricted rainbow, drawn from the hue range ring. Not a stop list: Orbit and Fractal compute it directly. */
export const RAINBOW_PALETTE = 'rainbow'
/** The user's own stops, edited in the Color config. */
export const CUSTOM_PALETTE = 'custom'

/** Plays a one-way ramp out and back to its first stop. */
const loop = (stops: readonly string[]): string[] => [...stops, ...stops.slice(0, -1).reverse()]

export const PALETTES: readonly PaletteDefinition[] = [
  { id: 'twilight', label: 'Twilight', stops: ['#2f1437', '#701f57', '#b43e55', '#d9805f', '#dcae9e', '#e2d9e2', '#a9c2d0', '#6f95b8', '#5f68ad', '#5a3b8c', '#2f1437'] },
  { id: 'rosewood', label: 'Rosewood', stops: ['#3b1561', '#5a4fa8', '#8fa6d9', '#e9e2dc', '#e0a38f', '#c0607a', '#3b1561'] },
  { id: 'neon', label: 'Neon', stops: ['#ff00c8', '#7a00ff', '#00e5ff', '#00ff9c', '#ff00c8'] },
  { id: 'pastel', label: 'Pastel', stops: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff', '#ffadad'] },
  { id: 'viridis', label: 'Viridis', stops: loop(['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725']) },
  { id: 'magma', label: 'Magma', stops: loop(['#000004', '#180f3e', '#451077', '#721f81', '#9f2f7f', '#cd4071', '#f1605d', '#fd9567', '#fec98d', '#fcfdbf']) },
  { id: 'inferno', label: 'Inferno', stops: loop(['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4']) },
  { id: 'turbo', label: 'Turbo', stops: loop(['#30123b', '#4145ab', '#4675ed', '#39a2fc', '#1bcfd4', '#24eca6', '#61fc6c', '#a4fc3b', '#d1e834', '#f3c63a', '#fe9b2d', '#f36315', '#d93806', '#b11901', '#7a0403']) },
  { id: 'ocean', label: 'Ocean', stops: loop(['#03045e', '#0077b6', '#00b4d8', '#90e0ef', '#caf0f8']) },
  { id: 'ember', label: 'Ember', stops: loop(['#000000', '#3b0a0a', '#9b1c0a', '#e8590c', '#ffb703', '#fff3b0']) },
  { id: 'ice', label: 'Ice', stops: loop(['#0b132b', '#1c2541', '#3a6ea5', '#5bc0eb', '#e8f7ff']) },
  { id: 'sunset', label: 'Sunset', stops: loop(['#1a0b3b', '#5b2a86', '#c13584', '#fd5949', '#feda75', '#fff6d5']) },
  { id: 'forest', label: 'Forest', stops: loop(['#0b2b1a', '#1b5e20', '#4c9a2a', '#a3c853', '#f4e8a0']) },
  { id: 'gold', label: 'Black Gold', stops: loop(['#000000', '#3d2c00', '#a67c00', '#ffd700', '#fff8dc']) },
  { id: 'mono', label: 'Mono', stops: loop(['#000000', '#ffffff']) },
]

export const PALETTE_BY_ID: Readonly<Record<string, PaletteDefinition | undefined>> = Object.fromEntries(
  PALETTES.map((palette) => [palette.id, palette])
)
