# Mobile design screens

These are the chosen screens from the "Fractaleyez Mobile Gestures" design canvas, copied here so the agents building the mobile issues can read the exact markup: sizes, colors, spacing and the icon SVG paths. Each file is one phone artboard (375 wide) as plain HTML with inline styles. The `support.js` script and `/_blob/...` images only resolve on the canvas, so the files are a spec to read, not pages to open.

Values on the screens are sample defaults. Where a screen and the code disagree on a setting's name, range or default, the code is right.

| File | Screen | Issue |
| --- | --- | --- |
| `TopC.html` | Resting: account badge, bottom bar with layer and effect buttons | #363 |
| `EffectIcons.html` | The effect icons, on and off | #363, #366 |
| `Steer.html`, `Speed.html`, `Pinch.html`, `Spin.html`, `Reset.html` | Gestures and the Full mode readouts | #360, #362 |
| `TopCGesture.html` | The bar during a gesture, info line in its place | #362, #363 |
| `UIMode.html` | On-screen controls picker | #361, #367 |
| `LimitedSpeed.html`, `LimitedSpin.html` | Limited mode chip | #362 |
| `NoneResting.html`, `NoneSwipe.html` | None mode, long-press to open the menu | #361 |
| `MenuHalf.html` | Menu sheet, Layers tab | #364 |
| `MenuLimited.html` | Menu opened in Limited or None mode | #361, #364 |
| `MenuLayerDetail.html`, `FractalShape.html` | Fractal page: Type and Shape | #365 |
| `OrbitShape.html`, `OrbitParticles.html`, `OrbitSprites.html` | Orbit page: Shape, Particles, Sprites | #365 |
| `LogoLook.html` | Logo page: Look | #365 |
| `ColorTab.html` | Color tab | #366 |
| `MenuFull.html` | Effects tab | #366 |
| `CameraTab.html` | Camera tab | #366 |
| `AccountSheet.html`, `AccountGuest.html` | Account sheet, signed in and signed out | #367 |

The menu sheet is a fixed `min(374px, 60dvh)` tall, not a share of the screen, so it fits phones of any height.
