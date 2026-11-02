# Particle sprite upload pipeline

Background removal and resize run **client-side** before upload, via the `sprite-strip` package's `prepareSprite` (`src/components/huds/useSpriteUpload.ts`).

| Stage | Size contract | Where |
| --- | --- | --- |
| Source/input | Any image, max 2 MB file (`MAX_DATA_URL_BYTES`). No pixel-dimension limit client-side. | `useSpriteUpload.ts` |
| Processed/stored | Downscaled so the longest side is at most **512 px** (`SPRITE_MAX_SIDE_PX`), never upscaled, then centered on a **square** transparent-padded canvas. Output is a PNG, still max 2 MB. Flat neutral edge background is flood-fill stripped to alpha. A 100x60 upload is stored as 100x100. | `prepareSprite(raw, 512)` |
| Server boundary | Raw bytes, max 2 MB, png/jpg/webp/gif, decoded dimensions at most **4096 px** per side (a decompression-bomb ceiling; the server does not resize or strip). Stored in R2 at `particles/<userId>/<uuid>.<ext>`. | `server/routes/uploadParticleHandler.ts` |
| Render time | The stored image is loaded as-is by `THREE.TextureLoader` (`src/utils/textureCache.ts`). On-screen size comes from the Size slider (`particle.config.ts`, `size_*`), and the GPU samples the texture at that scale. | `textureCache.ts` |

Notes:
- Uploads made through the app are processed to a 512 px maximum before they are sent. Logo uploads (`LOGO_MAX_SIDE_PX`) use the same 512 px cap.
- The server trusts the client for resize and background removal. A direct API upload up to 4096 px and 2 MB is stored as sent.
- Built-in text sprites (`userReference.ts`) are drawn at a fixed 512x512.
