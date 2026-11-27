# The Learn Page

## Context

Fractaleyez keeps its controls simple on purpose: Type thumbnails instead of formulas, a Shape pad instead of Re and Im sliders, one switch per effect. A lot of real math and engineering sits behind that, and some users want all of it: the fractal communities this will be shared with, creative coders, VJs. The Learn page is where it lives, so the controls never have to explain themselves.

It covers the **whole app**, not only the fractals. Each topic has two depths:

- **How it works**: a short plain-words version anyone can follow, with a picture or a live demo.
- **Under the hood**: the deep dive for the true nerds, with the actual formulas, algorithms and the reasons behind the design choices, close to how the code does it.

Not started. Where the page lives (a route in the app, or the marketing site) is an open question.

## Sections

### 1. The big picture

What you see is a stack of layers (Video, Fractal, Orbit, Logo), each drawn on its own and then blended together, with global effects on top, all driven by an analysis of the music.

- **Under the hood:** the frame loop (`main.ts`): audio frame in, analysis, each layer renders to its own target, the compositor blends them, post effects run, and the whole thing is paced by the quality tier's frame cap. The config UI runs on the same thread, which is why it never re-renders as a whole.

### 2. The fractal layer

- **How it works:** every pixel is a starting point, the same rule is applied over and over, and the color is how many steps it took to escape. The border between escaping and trapped is infinitely detailed and contains turned copies of itself, so the zoom dives until the picture matches where it started and jumps back without a seam.
- **The Shape pad is the parameter plane.** This is the key idea behind the simple controls. Each type's rule has one complex number `c`, which is one point on a 2D plane: its real part is how far right, its imaginary part how far up. So the whole shape is set by one point, and the pad is that plane (the dot is `c`, the Re and Im readouts are its coordinates). The colored map shows what every `c` gives; for Classic it is the Mandelbrot set, where dark points give connected, detailed shapes and colored points give dust. The good shapes sit along the thin edge, which is where the Tour runs. Two sliders for Re and Im would control the same two numbers, but moving one at a time mostly lands in a plain blob or in dust, because that edge is thin and curved. So the controls are three levels of one idea: the Tour (one slider, always a good shape), the named shapes (jump to a famous one), and the pad (go anywhere, with the map as a guide).
- **The types:** one short part per type (Classic, Triad, Quad, Rings, Bouquet, Ribbon): its rule, its math name, what makes its look, and its named shapes.
- **Under the hood:**
  - Julia sets and the parameter plane: J(f_c) is the boundary between bounded and escaping orbits, and the parameter plane colors each `c` by its critical orbit (the Mandelbrot and Multibrot sets, and the McMullen and transcendental analogues).
  - The endless zoom is Koenigs linearization. The zoom sits on a repelling fixed point z₀ (multiplier λ = f′(z₀), |λ| > 1), where f acts like multiplication by λ in the Koenigs coordinate φ (φ(f(z)) = λφ(z)). Zooming by |λ| and turning by arg λ is one loop period. The shader samples through φ⁻¹ to third order, z = z₀ + w + k₂w² + k₃w³, with k₂ and k₃ from f″ and f‴, which keeps the wrap seamless up to each type's seam-safe radius; wider views breathe instead.
  - Smooth coloring: the log-log escape count (log base d for degree d), and a double log for the exponential and sine types, which grow like eᶻ.
  - Finding fixed points: closed form for z² + c, Durand-Kerner for the polynomial types, Newton seeded on Lambert W branches (Bouquet) or along the real axis (Ribbon), tracked frame to frame so the dive never jumps.
  - Orientation: the set's mass direction is estimated by escape counts on rings around the fixed point and turned to face down.
  - Credit: the Julia zoom with a Mandelbrot inset comes from Mandelbrot Maps by jmaio.

### 3. The orbit layer (Hopalong)

- **How it works:** one simple rule moves a point around the plane, and the trail of where it lands draws the pattern. Thousands of points make each particle layer, several layers stack in depth, and the camera flies through them forever.
- **Under the hood:**
  - Barry Martin's Hopalong attractor (popularized in Scientific American's Computer Recreations, 1986). Martin's original: x′ = y − sign(x)·√|b·x − c|, y′ = a − x.
  - The app's variant (`generateOrbit` in `hopalong-visualizer.ts`): z = d + |b·x − c|^¼ (a fourth root, which softens the arms), x′ = y − sign(x)·z + e, y′ = a − x. So A sets the radius, B the spread, C where the fold bends (sharpness), D shifts the fold up (pulls particles inward), and E drifts which branch gets applied (breaks the symmetry).
  - Each particle layer starts its orbit from a slightly different random point, so the layers differ; the bounds are measured and scaled to the screen.
  - The tunnel: levels are spaced 500 units apart in depth, the camera moves forward at the Speed (times the music multiplier), and a level that passes the camera is moved to the back, so the flight never ends. Each level spins, and Cyclone alternates the spin direction between groups.
  - Effects in the orbit: Switcheroo regenerates every other layer's orbit on a beat, Wob Wob pushes particles back along z on a beat, Color Shift re-applies each layer's hue.
  - Credit: the original WebGL Hopalong visualizer by Iacopo Sassarini.

### 4. The logo zoom (Droste)

- **How it works:** the logo contains a smaller copy of itself at the zoom focus, which contains another, forever. The zoom grows the picture until the inner copy is the size the outer one was, then quietly swaps back. With Spin, each copy is turned a bit more than the one around it, so the dive spirals like Escher's Print Gallery.
- **Under the hood:**
  - A chain of 4 copies, each 16 times smaller (`ZOOM_RATIO`), every copy's focus point lined up with the one it sits in. Copy j sits `phase − j` levels from full size; the phase grows with Speed and wraps after one level, where each copy takes the next one's place, so the loop has no seam. Copies fade out between 0 and half a level past full size.
  - The spiral (`logo-spiral.ts`): each copy is turned about the focus by its level times a twist, so the copy transforms compose (scales multiply, turns add) and the wrap still lands on an identical picture. The visible spin is split into the twist's part (twist × levels per second) and a rigid turn, so the picture always turns at the Spin rate. The copies' matrices are built by hand in the image's own proportions, since a plain rotation inside the logo group's aspect scale would shear them.
  - The 3D logo: the walls are traced from the image's outline and join the front and back faces, each wall in the color of the edge it stands on.

### 5. Layer blending

- **How it works:** each layer is drawn on its own, then the layers are combined back to front. Mask lets the dark parts of a layer show what is behind it, Over covers, Screen adds light, Difference inverts where layers cross.
- **Under the hood** (`layers/composite.glsl.ts`): every layer renders into its own render target. The compositor walks the layers front to back. `mask` is a luminance key: a layer shows only where the layers in front of it are dark (the brightest channel through a smoothstep up to `MASK_EDGE`), which is how the fractal and the video reveal each other. `over` also covers by the layer's own alpha (premultiplied), so a dark logo still hides what is behind it. `screen` is 1 − (1 − a)(1 − b) on the result and never feeds the key, so it lands the same wherever it sits. `difference` is |a − b| against the finished result. Layer fades use the crossfade duration, and up to 5 layers can be on at once.

### 6. Listening to the music

- **How it works:** the app listens through the microphone, finds the beats and the tempo, and works out which part of the song it is in (intro, groove, buildup, drop, break), so the visuals can react to more than just loudness.
- **Under the hood** (the `beatsense` package):
  - An FFT of each audio frame, split into five onset bands, feeds an onset detector, and the beat monitor turns onsets into beats (Threshold and Ignore Time are its controls).
  - A tempo tracker and a bar grid find the BPM and where the bars start; a drum-hit classifier (a small trained model) names kicks, snares, claps and hats; a riser and sweep detector catches buildups.
  - A section model (trained on labeled songs) classifies the song's part every frame: intro, quiet, groove, buildup, turnaround, break, drop, outro. How often each label is right is measured against expert labels.
  - The music speed multiplier speeds the fractal zoom, the orbit flight and the logo zoom with the energy.

### 7. Effects and Auto

- **How it works:** global effects (kaleidoscope, glow, shockwave, cyclone, wob wob, switcheroo, color shift) react to beats and peaks. Auto runs the show with nobody touching it, following the song's parts.
- **Under the hood:** the kaleidoscope folds screen coordinates into mirrored wedges; glow is a bloom pass scaled by peak energy; shockwave is a radial distortion from the center on big peaks. Auto mode adds kaleidoscope mirrors through a buildup as the snare roll speeds up (quarters, eighths, sixteenths), lands changes on the next beat, and is built to survive wrong section labels with a hold and a dwell time.

### 8. Color

- **How it works:** one palette colors everything, and its hue drifts with the music.
- **Under the hood:** palettes are sampled from a lookup table, with saturation, phase and cycles; changes ease over the crossfade time with an exponential follower so a new palette never snaps.

### 9. Performance

- **How it works:** the app picks a quality level that keeps it smooth on your device and adjusts it as the scene changes.
- **Under the hood:** quality tiers (Saver, Balanced, Quality, Ultra) set the fractal's resolution and iterations, bloom resolution, video upload rate and the frame cap. Auto quality steps down after about 3 seconds of slow frames and probes back up when the scene's estimated cost falls; tier changes ramp over a few tenths of a second instead of jumping.

## Interactive demos (ideas)

- Fractal: a dot hopping step by step until it escapes, a Steps slider that sharpens the edge, a slow zoom with a ghost outline of the frame it is about to match, and the Shape pad next to a live Julia thumbnail.
- Hopalong: draw one orbit point by point with the A to E sliders live, then add layers and depth.
- Droste: the chain of copies drawn as outlines, with a slider for the zoom phase and one for the twist.
- Blending: two simple layers with a blend mode picker and the layer order swappable.
- Audio: a live view of the onset bands, beats and the current section label from the mic.

## Open questions

- Where the page lives: a route in the app, or the marketing site that the app links to.
- How much to show live (running the real renderers on the page) versus pictures and short clips.
