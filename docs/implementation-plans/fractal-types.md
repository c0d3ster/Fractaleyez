# Fractal Types

## Context

The fractal layer started as one Julia set, z² + c, with an endless zoom. PR #355 turned it into a set of **types** the user picks from a row of thumbnails above the Shape pad, each with its own tour, named shapes and parameter map. The mode can grow much further, and the people who love the math behind it (the fractal communities this will be shared with) deserve a place that explains it. This plan covers which types to add next. The math behind them is explained on the app-wide Learn page (`learn-page.md`), so the fractal controls themselves stay simple.

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
- **Tangent**: c·tan z. Tangent never escapes to infinity, so points are colored by how fast they settle into a cycle: soft color fields with eye-like spirals strung along one line, a stained-glass look unlike the others. Its Julia set is a thin dusty line, so the dive is calmer than the other types; pick tour values where the settling cycle shows clearly (some `c` never settle and draw black). It uses the same "settled" coloring as Nova, so it is cheap to add once Nova is in.
- Not worth adding: **cosine**, c·cos z. cos z = sin(z + π/2), so it draws the same scalloped band as Ribbon from different `c` values.
- Others worth a look later: higher Multibrot degrees (z⁵, z⁶) and rational maps with more symmetry.
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

How the fractals work, for anyone who wants the math, is part of the app-wide Learn page: see `learn-page.md`. It covers the fractal layer (including why the Shape pad is the parameter plane and why it beats two sliders) alongside the orbit, the logo zoom, layer blending, the audio analysis and the rest.

## Open questions

- Where the Learn page lives: a route in the app, or a page on the marketing site that the app links to.
- Whether types beyond the first few are free or part of a paid tier.
