# Fractal Types and the Learn Page

## Context

The fractal layer started as one Julia set, z² + c, with an endless zoom. PR #355 turned it into a set of **types** the user picks from a row of thumbnails above the Shape pad, each with its own tour, named shapes and parameter map. The mode can grow much further, and the people who love the math behind it (the fractal communities this will be shared with) deserve a place that explains it. This plan covers both: which types to add next, and a separate **Learn page** for the math, so the fractal controls themselves stay simple.

## Status

Six types are in (`src/visualization/fractal-families/`, PR #355):

| Type | Map | Look |
| --- | --- | --- |
| Classic | z² + c | spirals, seahorses, lightning; mapped by the Mandelbrot set |
| Triad | z³ + c | three-fold trefoils, pinwheels |
| Quad | z⁴ + c | four-fold crosses, snowflakes, vortices |
| Rings | z³ + c/z³ (McMullen) | rings and carpets of round holes |
| Bouquet | c·eᶻ | plumes, feathers and hairs (a Cantor bouquet) |
| Ribbon | c·sin z | a band of ferns and spiral flowers repeating forever |

Switching types crossfades over the Crossfade Duration. Every type loops its zoom seamlessly, has named shapes that sit exactly on Tour stops, and is checked by `fractal-families.test.ts` (a repelling fixed point at every stop, the zoom coordinate matching the map, shapes on the pad).

## Next types

Candidates that work with the seamless zoom loop. Previews were rendered while picking the sixth type; all of them looked good, so they are worth adding.

- **Nova**: z − (z³ − 1)/(3z²) + c, Newton's root-finding method with `+ c`. Colors by how fast a point *settles* onto a root instead of how fast it escapes, which gives smooth stained-glass bands with spirals and small Mandelbrot-like islands. The most different look from the current six.
  - Needs a "settled" test (|z_{n+1} − z_n| small) in place of the escape test, and a smooth count from how small that step got.
  - The roots attract, so the zoom has to sit on a repelling fixed point elsewhere on the Julia set: fixed points of the map solve z³ − 1 = 3c·z², with multiplier 2c/z. Check that the tour keeps it above about 1.3.
  - Its parameter map is the orbit of a critical point (the free one, z = 1 for the plain Nova).
- **Magnet**: ((z² + c − 1)/(2z + c − 2))², from magnetism models in physics. Bubbles and blobs packed in a disc with lightning-like seams. Close to Rings in feel but softer.
  - Two exit tests: escaping to infinity, or settling at the attracting fixed point 1. Color by whichever comes first.
  - A rational map, so its fixed points are polynomial roots (Durand-Kerner, as Rings does).
- Others worth a look later: higher Multibrot degrees (z⁵, z⁶), other trig maps (c·cos z, c·tan z), and rational maps with more symmetry.
- Not possible with the loop: Burning Ship and Tricorn. They are not complex-differentiable, so there is no Koenigs coordinate and the wrap would pop. They could only use the breathing zoom.

### Adding a type

The checklist the six types followed:

1. Write the family (`FractalFamily` in `family.ts`): the CPU step and escape test, the GLSL step, escape and smooth count, and `fixedPoint` returning the Koenigs coefficients from f′, f″ and f‴ (`fixedPointResult` in `koenigs.ts`).
2. Map the parameter plane offline and trace a tour just inside the edge of the interesting region. Check every stop for a fixed point with a multiplier of at least about 1.3 and render thumbnails of the zoomed view to cut repetitive stretches.
3. Pick named shapes as tour stops (`tourStop`).
4. Measure the seam: the wrap error against view radius, and set `seamSafeRadius` where it matches Classic's at 0.2. Set `parameterScale` to the size of the map next to Classic's, and `referenceMultiplier` if its multipliers run far from Classic's.
5. Rotate the parameter (use i·c) if the map is taller than wide, so it fits the 3:2 pad.
6. Append it to `FRACTAL_FAMILIES` (only ever append: presets store the index) and raise `fractal.family_MAX`.
7. Check the loop in the app for pops and take screenshots at the default zoom and at 0.30x, with Cyclone off.

## The Learn page

A separate page, linked from the fractal section, for anyone who wants to know how it works. The fractal controls stay free of math; this page holds all of it, in layers, so a curious user and a mathematician both get something.

### Sections

1. **What you are looking at.** Every pixel is a starting point. The same simple rule is applied to it over and over. Some points run off to infinity and some stay trapped; the color is how many steps it took to escape, and black means it never did. The border between the two is infinitely detailed.
2. **Why the zoom never ends.** Parts of that border contain shrunken, slightly turned copies of themselves. The zoom finds one of those spots, dives until the picture matches where it started, and jumps back without a seam.
3. **The shape is one point: what the Shape pad is.** See below. This is the key idea that makes the controls simple.
4. **The types.** One short section per type: its rule, what makes its look, and its named shapes.
5. **For the math nerds.** The real machinery, below.

### The Shape pad is the parameter plane

This is the part of the UX worth explaining, because it turns a complex idea into one simple control.

- Each type's rule has one complex number `c`. A complex number is just a point on a 2D plane: its **real part** is how far right it is, its **imaginary part** is how far up. So the whole shape of the fractal is set by **one point**.
- The Shape pad **is** that plane. The dot is `c`; the Re and Im readouts under the pad are its two coordinates. Dragging the dot changes both at once.
- The colored map on the pad is a picture of what every `c` gives. For Classic it is the Mandelbrot set: dark points give connected, detailed Julia sets, and colored points give scattered dust. The good shapes sit along the thin edge between the two, which is where the Tour runs.
- Why not two sliders, one for Re and one for Im? They would control exactly the same two numbers, but moving one at a time mostly lands in solid black (a plain blob) or in dust, because the interesting edge is thin and curved. The map shows where the good shapes are and lets you follow the edge directly. The Tour slider goes one step further: it is a curated path along that edge, so one slider walks through only good shapes.
- So the design is three levels of the same idea: the Tour (one slider, always a good shape), the named shapes (jump to a famous one), and the pad (go anywhere, with the map as a guide).

A possible later addition for precise control: a fine-tune drag on the pad (hold a key to move at a tenth of the speed), or small Re and Im number inputs in the expanded view next to the readouts. Keep the pad as the main control either way.

### For the math nerds

- **Julia sets and the parameter plane.** For a family f_c, the Julia set J(f_c) is the boundary between orbits that stay bounded and those that escape. The parameter plane colors each `c` by what its critical orbit does, which tells you whether J(f_c) is connected (Mandelbrot set for z² + c, the Multibrot sets for zᵈ + c, the McMullen and transcendental analogues for the others).
- **The endless zoom (Koenigs linearization).** The zoom sits on a repelling fixed point z₀ of f (f(z₀) = z₀, |λ| = |f′(z₀)| > 1). Near it, f acts like multiplication by λ in the Koenigs coordinate φ, with φ(f(z)) = λ·φ(z). So zooming in by |λ| and turning by arg λ shows the same picture: that is one loop period. The shader samples the plane through φ⁻¹ to third order, z = z₀ + w + k₂w² + k₃w³, with k₂ and k₃ from f″ and f‴ (`koenigs.ts`), which makes the wrap seamless to well under a pixel up to each type's seam-safe radius.
- **Smooth coloring.** The escape count is made continuous with the usual log-log formula for polynomials (log base d for degree d). The exponential and sine maps grow like e^z, so they use a double log of the escaping value instead.
- **Finding the fixed points.** Closed form for z² + c; Durand-Kerner on the polynomial for Triad, Quad and Rings; Newton's method seeded on the Lambert W branches for Bouquet and along the real axis for Ribbon. While the shape glides, the zoom tracks the same fixed point from frame to frame so the dive never jumps.
- **Credits.** The idea of a Julia zoom with a Mandelbrot inset to pick the shape comes from Mandelbrot Maps by jmaio (see README).

### Interactive demos (ideas)

- A dot hopping step by step from a starting point until it escapes or gets trapped, with the step count shown as the color.
- A Steps slider that redraws a small Julia set as the iteration limit grows, so the edge sharpens.
- A slow zoom with a ghost outline of the frame it is about to match, to show the loop.
- The Shape pad next to a live Julia thumbnail, so dragging `c` shows the shape change.

## Open questions

- Where the Learn page lives: a route in the app, or a page on the marketing site that the app links to.
- Whether types beyond the first few are free or part of a paid tier.
