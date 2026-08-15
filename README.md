# sprite-strip

Edge-seeded flood-fill background removal and square-pad resize for sprite images,
built on the browser Canvas 2D API. No dependencies.

It exists because point-sprite/particle renderers (`THREE.Points` and similar) always
billboard a sprite texture as a square — a rectangular upload gets stretched to fill
that square unless you pad it first. `prepareSprite` handles the resize/pad and, by
default, also strips a flat-colored background so the sprite reads as a clean cutout
instead of a colored square.

## Install

```sh
npm install sprite-strip
```

## Usage

The common case — take a user-uploaded image, cap it at a max side length, strip a
neutral background, get back a PNG data URL:

```ts
import { prepareSprite } from 'sprite-strip'

const processed = await prepareSprite(rawDataUrl, 512)
```

Skip the background strip and only resize/pad:

```ts
const processed = await prepareSprite(rawDataUrl, 512, { stripBackground: false })
```

Run the strip directly against a canvas you already control:

```ts
import { stripEdgeBackground } from 'sprite-strip'

const ctx = canvas.getContext('2d')
stripEdgeBackground(ctx, canvas.width, canvas.height)
```

## How it works

`stripEdgeBackground` flood-fills inward from the canvas border, seeding only from
near-neutral (black/gray/white) edge pixels so colored backgrounds are left untouched.
Propagation compares each pixel to the already-filled neighbor that reached it (not
the original seed), so gradual gradients/noise get absorbed but a hard-edge outline
stops the fill. If the whole image is flat, bilevel line-art (few distinct colors —
logos, signatures), fully-enclosed background-colored holes (e.g. the loop of a
cursive letter) are also removed, since color alone can't safely make that call on a
photo where a same-toned subject region might exist. Background pixels near the
resulting cut boundary get a short alpha falloff instead of a hard 0/255 edge.

If the stripped area comes out too small relative to the original opaque content, the
whole strip is abandoned and the image is returned untouched — this guards against
textured photo backgrounds (a brick wall, grout lines) nibbling a small, irregular
bite out of one edge instead of matching cleanly or not at all.

## API

### `prepareSprite(dataUrl: string, maxSide: number, options?: PrepareSpriteOptions): Promise<string>`

Decodes `dataUrl`, downscales to fit `maxSide` if needed, centers the result on a
square transparent-padded canvas, strips the background (unless
`options.stripBackground` is `false`), and resolves to a PNG data URL.

### `stripEdgeBackground(ctx: CanvasRenderingContext2D, width: number, height: number, options?: StripBackgroundOptions): void`

Runs the background strip in place against an existing canvas context.

### `StripBackgroundOptions`

All fields optional; every default below was tuned against real uploaded sprites.

| Option | Default | Purpose |
| --- | --- | --- |
| `neutralChannelSpread` | `20` | Max channel spread for an edge pixel to seed the fill (near-neutral gate) |
| `floodFillStepTolerance` | `10` | Max color drift allowed for a single hop to a neighboring pixel |
| `floodFillMaxDrift` | `24` | Max *cumulative* drift allowed over the whole chain back to the border seed |
| `falloffRadiusPx` | `3` | Width of the soft alpha ramp at the stripped edge |
| `flatImageColorCoverage` | `0.92` | Coverage threshold for treating an image as flat/bilevel line-art |
| `flatImageColorQuantLevels` | `32` | Color quantization granularity used for the flat-image check |
| `interiorBackgroundMatchTolerance` | `16` | Color distance from the learned background color for seeding an interior hole |
| `minStripAreaFraction` | `0.03` | Minimum stripped fraction of original opaque content, below which the strip is abandoned |

`PrepareSpriteOptions` extends `StripBackgroundOptions` with:

| Option | Default | Purpose |
| --- | --- | --- |
| `stripBackground` | `true` | Set `false` to only resize/pad and skip the background strip |

## Scope

Browser only — `prepareSprite` uses `Image`, `document.createElement('canvas')`, and
`canvas.toDataURL`. `stripEdgeBackground` itself only calls `getImageData`/
`putImageData` on the context you pass it, so it could work with a non-DOM canvas
implementation, but that's untested and unsupported for now.
