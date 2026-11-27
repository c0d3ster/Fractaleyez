/** A complex number. The fractal families do their CPU-side math (fixed points, the zoom coordinate, the shape pad's map) with these. */
export type Complex = { re: number; im: number }

export const complex = (re: number, im = 0): Complex => ({ re, im })

export const cAdd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im })
export const cSub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im })
export const cMul = (a: Complex, b: Complex): Complex => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
export const cScale = (a: Complex, s: number): Complex => ({ re: a.re * s, im: a.im * s })
export const cDiv = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }
}
export const cAbs = (a: Complex): number => Math.hypot(a.re, a.im)
export const cArg = (a: Complex): number => Math.atan2(a.im, a.re)
export const cExp = (a: Complex): Complex => {
  const magnitude = Math.exp(a.re)
  return { re: magnitude * Math.cos(a.im), im: magnitude * Math.sin(a.im) }
}

/** a to a whole power (0 and up), by repeated squaring. */
export const cPow = (a: Complex, power: number): Complex => {
  let result = complex(1)
  let base = a
  let remaining = power
  while (remaining > 0) {
    if (remaining % 2 === 1) result = cMul(result, base)
    base = cMul(base, base)
    remaining = Math.floor(remaining / 2)
  }
  return result
}
