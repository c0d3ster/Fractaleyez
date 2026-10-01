// The Shape slider walks a tour of Julia-set c values, smoothly interpolated between points. The path
// was generated offline: it passes through famous shapes (airplane, basilica, galaxy, Siegel disk,
// rabbit, dendrite, then back along the main cardioid's boundary through the San Marco / seahorse
// area), each stretch snapped onto the Mandelbrot set and resampled evenly, so neighbors look related
// and almost every position is a connected, detailed shape instead of dust. Near-cusp c values
// (close to 0.25) are avoided: the fixed point's multiplier approaches 1 there, so the zoom crawls.
// Every point has a repelling-fixed-point multiplier of at least 1.89.
export const JULIA_TOUR: readonly (readonly [number, number])[] = [
  [-1.7549, 0], [-1.628, 0], [-1.484, 0], [-1.384, 0.012],
  [-1.2647, 0.0283], [-1.1409, 0.025], [-1.0188, 0.0059], [-0.9121, -0.0546],
  [-0.8377, -0.153], [-0.732, -0.208], [-0.704, -0.288], [-0.644, -0.416],
  [-0.568, -0.48], [-0.521, -0.5895], [-0.404, -0.588], [-0.3778, -0.4834],
  [-0.3772, -0.3595], [-0.3815, -0.2357], [-0.3877, -0.112], [-0.3947, 0.0117],
  [-0.4016, 0.1354], [-0.4074, 0.2591], [-0.4111, 0.3829], [-0.4097, 0.5068],
  [-0.3759, 0.6201], [-0.284, 0.644], [-0.22, 0.732], [-0.1202, 0.7476],
  [-0.092, 0.8616], [-0.044, 0.984], [-0.092, 0.872], [-0.024, 0.784],
  [0.068, 0.648], [0.148, 0.612], [0.2558, 0.5541], [0.3081, 0.4438],
  [0.3638, 0.338], [0.3625, 0.301], [0.3026, 0.4094], [0.233, 0.5116],
  [0.1331, 0.583], [0.017, 0.6258], [-0.1048, 0.6474], [-0.2273, 0.6399],
  [-0.3432, 0.5969], [-0.4504, 0.535], [-0.55, 0.4615], [-0.6354, 0.3736],
  [-0.6929, 0.2657], [-0.732, 0.1481], [-0.7984, 0.1381], [-0.7269, 0.1889],
]

export type JuliaFamousShape = {
  name: string
  re: number
  im: number
}

// Exact c values for well-known Julia sets. The tour only passes near most of these.
export const JULIA_FAMOUS_SHAPES: readonly JuliaFamousShape[] = [
  { name: 'San Marco', re: -0.75, im: 0 },
  { name: 'Rabbit', re: -0.1226, im: 0.7449 },
  { name: 'Airplane', re: -1.7549, im: 0 },
  { name: 'Dendrite', re: 0, im: 1 },
  { name: 'Siegel disk', re: -0.390541, im: -0.586788 },
  { name: 'Basilica', re: -1, im: 0 },
]

// The part of the c plane the shape pad shows and accepts.
export const JULIA_MAP_VIEW = { reMin: -2.2, reMax: 0.8, imMin: -1, imMax: 1 } as const
