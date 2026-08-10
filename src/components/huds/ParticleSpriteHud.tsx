import React, { useCallback, useRef, useState } from 'react'
import axios from 'axios'
import './ParticleSpriteHud.css'

import { connectConfig } from '../config/context/ConfigProvider'
import { AppConfig } from '../../config/configDefaults'
import { BUILTIN_PARTICLE_SPRITES, particleConfig } from '../../config/particle.config'
import { presetSpriteSrc } from '../../utils/presetSpriteSrc'

// Mirrors the server's MAX_UPLOAD_BYTES / MAX_DECODED_DIMENSION_PX in uploadParticleHandler.ts —
// these client-side checks only save a round trip, the server enforces its own limits independently.
const MAX_DATA_URL_BYTES = 2 * 1024 * 1024
const SPRITE_MAX_SIDE_PX = 512
const UPLOAD_ERROR_DISPLAY_MS = 4000

// Background-strip tuning: NEUTRAL_CHANNEL_SPREAD gates which edge pixels can seed the fill
// (near-black/gray/white only, so colored backgrounds are left alone); FLOOD_FILL_STEP_TOLERANCE
// bounds how far a pixel's color may drift from the already-filled neighbor that reached it,
// so a single anti-aliased/noisy step gets absorbed but a hard-edge outline stops the fill cold.
// FLOOD_FILL_MAX_DRIFT bounds the *total* drift accumulated over the whole chain of hops back to
// the border seed — without it, many small sub-tolerance steps can chain together and worm past
// a real outline into an interior region that happens to share a similar tone. FALLOFF_RADIUS_PX
// is how many background pixels near the stopping edge get a soft alpha ramp instead of a hard
// 0/255 cutoff.
const NEUTRAL_CHANNEL_SPREAD = 20
const FLOOD_FILL_STEP_TOLERANCE = 10
const FLOOD_FILL_MAX_DRIFT = 24
const FALLOFF_RADIUS_PX = 3

// Interior-hole tuning: border-only seeding can't remove a background-colored pocket that's fully
// enclosed by foreground (e.g. the loop of a cursive letter) without risking a same-colored subject
// region (an eye on a black background, a gray shirt on a gray background) — color distance alone
// can't tell those apart. FLAT_IMAGE_COLOR_COVERAGE gates this: it's only safe to also seed interior
// pixels when the whole image is essentially bilevel line-art/logo (few distinct colors), since that
// rules out a same-toned subject existing in the first place. FLAT_IMAGE_COLOR_QUANT_LEVELS controls
// how finely colors are bucketed when checking that. INTERIOR_BACKGROUND_MATCH_TOLERANCE is how close
// an interior pixel must be to the *learned* border-background color (not just "near-neutral") to be
// seeded directly, so a flat image's foreground color (also near-neutral, e.g. black ink) isn't swept
// up just for being grayscale.
const FLAT_IMAGE_COLOR_COVERAGE = 0.92
const FLAT_IMAGE_COLOR_QUANT_LEVELS = 32
const INTERIOR_BACKGROUND_MATCH_TOLERANCE = 16

// Textured photo backgrounds (e.g. a brick wall) can have local patches — grout lines, lighting
// variation — that pass the near-neutral/tolerance gates just enough to nibble a small, irregular
// bite out of one edge, instead of either cleanly clearing the background or matching nothing. A
// stripped region that small is more likely that kind of noise than a real background, so below
// this fraction of the image the whole strip is abandoned and the sprite is left untouched.
const MIN_STRIP_AREA_FRACTION = 0.03

const isNearNeutral = (r: number, g: number, b: number): boolean => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max - min <= NEUTRAL_CHANNEL_SPREAD
}

// Quantizes every opaque pixel's color and checks whether the two most common buckets cover nearly
// the whole image — true for bilevel line art/logos/signatures, false for photos and other
// continuous-tone images where a same-colored subject region could plausibly exist.
const isFlatImage = (data: Uint8ClampedArray, pixelCount: number): boolean => {
  const bucketCounts = new Map<number, number>()
  let opaqueCount = 0
  for (let idx = 0; idx < pixelCount; idx++) {
    const p = idx * 4
    if ((data[p + 3] ?? 0) === 0) continue
    opaqueCount += 1
    const rBucket = Math.floor(((data[p] ?? 0) / 256) * FLAT_IMAGE_COLOR_QUANT_LEVELS)
    const gBucket = Math.floor(((data[p + 1] ?? 0) / 256) * FLAT_IMAGE_COLOR_QUANT_LEVELS)
    const bBucket = Math.floor(((data[p + 2] ?? 0) / 256) * FLAT_IMAGE_COLOR_QUANT_LEVELS)
    const key = (rBucket * FLAT_IMAGE_COLOR_QUANT_LEVELS + gBucket) * FLAT_IMAGE_COLOR_QUANT_LEVELS + bBucket
    bucketCounts.set(key, (bucketCounts.get(key) ?? 0) + 1)
  }
  if (opaqueCount === 0) return false
  let top1 = 0
  let top2 = 0
  for (const count of bucketCounts.values()) {
    if (count > top1) {
      top2 = top1
      top1 = count
    } else if (count > top2) {
      top2 = count
    }
  }
  return (top1 + top2) / opaqueCount >= FLAT_IMAGE_COLOR_COVERAGE
}

// Flood-fills inward from the canvas edges, removing only pixels reachable from a near-neutral
// border through a chain of locally-similar neighbors, then feathers the resulting cut edge
// with a short alpha falloff instead of leaving a hard binary mask.
const stripEdgeBackground = (ctx: CanvasRenderingContext2D, width: number, height: number): void => {
  const imageData = ctx.getImageData(0, 0, width, height)
  const { data } = imageData
  const pixelCount = width * height
  const isBackground = new Uint8Array(pixelCount)
  const seeded = new Uint8Array(pixelCount)
  const drift = new Uint16Array(pixelCount)
  const queue: number[] = []

  let bgColorSumR = 0
  let bgColorSumG = 0
  let bgColorSumB = 0
  let bgColorSeedCount = 0

  const enqueueIfBackground = (idx: number): void => {
    if (seeded[idx]) return
    const p = idx * 4
    const r = data[p] ?? 0
    const g = data[p + 1] ?? 0
    const b = data[p + 2] ?? 0
    const isTransparent = (data[p + 3] ?? 0) === 0
    if (!isTransparent && !isNearNeutral(r, g, b)) return
    seeded[idx] = 1
    isBackground[idx] = 1
    drift[idx] = 0
    if (!isTransparent) {
      bgColorSumR += r
      bgColorSumG += g
      bgColorSumB += b
      bgColorSeedCount += 1
    }
    queue.push(idx)
  }

  for (let x = 0; x < width; x++) {
    enqueueIfBackground(x)
    enqueueIfBackground((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    enqueueIfBackground(y * width)
    enqueueIfBackground(y * width + (width - 1))
  }

  // Flat/line-art images (few distinct colors, so no same-toned subject can plausibly exist) also
  // get interior pixels seeded directly whenever they closely match the learned border-background
  // color — this is what lets a fully-enclosed hole (e.g. the loop of a cursive letter) get removed
  // even though it never touches the canvas edge. Photographic images skip this and keep the
  // conservative border-only behavior, since color alone can't tell a hole from a same-colored
  // subject region (an eye, a shirt) once ML-level semantics are needed.
  if (bgColorSeedCount > 0 && isFlatImage(data, pixelCount)) {
    const bgAvgR = bgColorSumR / bgColorSeedCount
    const bgAvgG = bgColorSumG / bgColorSeedCount
    const bgAvgB = bgColorSumB / bgColorSeedCount
    for (let idx = 0; idx < pixelCount; idx++) {
      if (seeded[idx]) continue
      const p = idx * 4
      if ((data[p + 3] ?? 0) === 0) continue
      const r = data[p] ?? 0
      const g = data[p + 1] ?? 0
      const b = data[p + 2] ?? 0
      const distance = Math.max(Math.abs(r - bgAvgR), Math.abs(g - bgAvgG), Math.abs(b - bgAvgB))
      if (distance > INTERIOR_BACKGROUND_MATCH_TOLERANCE) continue
      seeded[idx] = 1
      isBackground[idx] = 1
      drift[idx] = 0
      queue.push(idx)
    }
  }

  let head = 0
  while (head < queue.length) {
    const idx = queue[head] ?? -1
    head += 1
    const x = idx % width
    const y = Math.floor(idx / width)
    const p = idx * 4
    const r0 = data[p] ?? 0
    const g0 = data[p + 1] ?? 0
    const b0 = data[p + 2] ?? 0

    const neighbors: number[] = []
    if (x > 0) neighbors.push(idx - 1)
    if (x < width - 1) neighbors.push(idx + 1)
    if (y > 0) neighbors.push(idx - width)
    if (y < height - 1) neighbors.push(idx + width)

    const currentDrift = drift[idx] ?? 0

    for (const nIdx of neighbors) {
      if (seeded[nIdx]) continue
      const np = nIdx * 4
      if ((data[np + 3] ?? 0) === 0) {
        seeded[nIdx] = 1
        isBackground[nIdx] = 1
        drift[nIdx] = currentDrift
        queue.push(nIdx)
        continue
      }
      const nr = data[np] ?? 0
      const ng = data[np + 1] ?? 0
      const nb = data[np + 2] ?? 0
      const step = Math.max(Math.abs(nr - r0), Math.abs(ng - g0), Math.abs(nb - b0))
      if (step > FLOOD_FILL_STEP_TOLERANCE) continue
      const newDrift = currentDrift + step
      if (newDrift > FLOOD_FILL_MAX_DRIFT) continue
      seeded[nIdx] = 1
      isBackground[nIdx] = 1
      drift[nIdx] = newDrift
      queue.push(nIdx)
    }
  }

  let backgroundCount = 0
  for (let idx = 0; idx < pixelCount; idx++) {
    if (isBackground[idx]) backgroundCount += 1
  }
  if (backgroundCount / pixelCount < MIN_STRIP_AREA_FRACTION) return

  const distanceFromForeground = new Int16Array(pixelCount).fill(-1)
  const falloffQueue: number[] = []
  for (let idx = 0; idx < pixelCount; idx++) {
    if (!isBackground[idx]) continue
    const x = idx % width
    const y = Math.floor(idx / width)
    const touchesForeground =
      (x > 0 && !isBackground[idx - 1]) ||
      (x < width - 1 && !isBackground[idx + 1]) ||
      (y > 0 && !isBackground[idx - width]) ||
      (y < height - 1 && !isBackground[idx + width])
    if (touchesForeground) {
      distanceFromForeground[idx] = 0
      falloffQueue.push(idx)
    }
  }
  let fHead = 0
  while (fHead < falloffQueue.length) {
    const idx = falloffQueue[fHead] ?? -1
    fHead += 1
    const d = distanceFromForeground[idx] ?? -1
    if (d >= FALLOFF_RADIUS_PX - 1) continue
    const x = idx % width
    const y = Math.floor(idx / width)
    const neighbors: number[] = []
    if (x > 0) neighbors.push(idx - 1)
    if (x < width - 1) neighbors.push(idx + 1)
    if (y > 0) neighbors.push(idx - width)
    if (y < height - 1) neighbors.push(idx + width)
    for (const nIdx of neighbors) {
      if (!isBackground[nIdx]) continue
      if ((distanceFromForeground[nIdx] ?? -1) !== -1) continue
      distanceFromForeground[nIdx] = d + 1
      falloffQueue.push(nIdx)
    }
  }

  for (let idx = 0; idx < pixelCount; idx++) {
    if (!isBackground[idx]) continue
    const p = idx * 4
    const d = distanceFromForeground[idx] ?? -1
    const origAlpha = data[p + 3] ?? 0
    data[p + 3] = d === -1 ? 0 : Math.round((origAlpha * (FALLOFF_RADIUS_PX - d)) / (FALLOFF_RADIUS_PX + 1))
  }

  ctx.putImageData(imageData, 0, 0)
}

const prepareSpriteDataUrl = (dataUrl: string, maxSide: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (w === 0 || h === 0) {
        resolve(dataUrl)
        return
      }
      const maxDim = Math.max(w, h)
      const scale = maxDim > maxSide ? maxSide / maxDim : 1
      const newW = Math.max(1, Math.round(w * scale))
      const newH = Math.max(1, Math.round(h * scale))
      // The particle renderer draws sprites as THREE.Points, which always billboards each
      // particle as a square (gl_PointSize is a single scalar and gl_PointCoord samples
      // [0,1]x[0,1]) — a non-square texture gets stretched to fill that square. So rectangular
      // uploads are centered on a square, transparent-padded canvas here rather than stretched:
      // the padding absorbs the square billboard, and the content keeps its original proportions.
      const side = Math.max(newW, newH)
      const offsetX = Math.floor((side - newW) / 2)
      const offsetY = Math.floor((side - newH) / 2)
      const canvas = document.createElement('canvas')
      canvas.width = side
      canvas.height = side
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, offsetX, offsetY, newW, newH)
      stripEdgeBackground(ctx, side, side)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('decode'))
    img.src = dataUrl
  })
}

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const res = await fetch(dataUrl)
  return res.blob()
}

const spriteLabel = (src: string): string => {
  if (src.startsWith('data:')) return 'Custom'
  const base = src.split('/').pop() ?? src
  return base.replace(/\.[^.]+$/, '') || base
}

type ParticleSpriteHudProps = {
  config: AppConfig
  updateParticleSprites: (sprites: string[]) => Promise<void>
  isSignedIn: boolean
  getToken: () => Promise<string | null>
}

const ParticleSpriteHudInner = ({ config, updateParticleSprites, isSignedIn, getToken }: ParticleSpriteHudProps): React.ReactElement => {
  const sprites = config.particle.sprites.value
  const spritesRef = useRef(sprites)
  spritesRef.current = sprites
  const { sprites_MIN: minN, sprites_MAX: maxN } = particleConfig
  const atCapacity = sprites.length >= maxN
  const uploadDisabled = atCapacity || !isSignedIn
  const [uploadError, setUploadError] = useState<string | null>(null)

  const showUploadError = useCallback((message: string) => {
    setUploadError(message)
    setTimeout(() => setUploadError(null), UPLOAD_ERROR_DISPLAY_MS)
  }, [])

  const setSprites = useCallback(
    (next: string[]) => {
      void updateParticleSprites(next)
    },
    [updateParticleSprites],
  )

  const removeAt = useCallback(
    (index: number) => {
      if (sprites.length <= minN) return
      setSprites(sprites.filter((_, i) => i !== index))
    },
    [sprites, minN, setSprites],
  )

  const toggleBuiltin = useCallback(
    (path: string) => {
      const i = sprites.indexOf(path)
      if (i >= 0) {
        if (sprites.length <= minN) return
        setSprites(sprites.filter((_, j) => j !== i))
        return
      }
      if (sprites.length >= maxN) return
      setSprites([...sprites, path])
    },
    [sprites, minN, maxN, setSprites],
  )

  const onFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files?.length) return
      const file = files[0]
      if (!file || !file.type.startsWith('image/')) return
      if (!isSignedIn) {
        showUploadError('Sign in to upload a custom particle.')
        e.target.value = ''
        return
      }
      if (sprites.length >= maxN) {
        e.target.value = ''
        return
      }
      if (file.size > MAX_DATA_URL_BYTES) {
        showUploadError(`Image is too large (max ${MAX_DATA_URL_BYTES / (1024 * 1024)} MB per file).`)
        e.target.value = ''
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        const raw = typeof reader.result === 'string' ? reader.result : ''
        if (!raw) return
        void (async () => {
          try {
            const processed = await prepareSpriteDataUrl(raw, SPRITE_MAX_SIDE_PX)
            const blob = await dataUrlToBlob(processed)
            if (blob.size > MAX_DATA_URL_BYTES) {
              showUploadError(
                `After scaling, the image is still over ${MAX_DATA_URL_BYTES / (1024 * 1024)} MB. Try a smaller or simpler image.`,
              )
              return
            }
            const token = await getToken()
            if (!token) {
              showUploadError('Sign in to upload a custom particle.')
              return
            }
            const { data } = await axios.post<{ url: string }>('/api/uploadParticle', blob, {
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': blob.type || 'image/png' },
            })
            // setSprites -> updateParticleSprites awaits the sprite cache warming before
            // updating the live config, so the particle system rebuild it triggers resolves
            // straight to the cached blob: URL instead of racing a cold cross-origin fetch.
            setSprites([...spritesRef.current, data.url])
          } catch {
            showUploadError('Could not upload this image.')
          }
        })()
      }
      reader.readAsDataURL(file)
      e.target.value = ''
    },
    [sprites, maxN, setSprites, isSignedIn, getToken, showUploadError],
  )

  return (
    <div className='particle-sprite-hud'>
      <span className='particle-sprite-hud__label'>Particles</span>
      <div className='particle-sprite-hud__panel'>
        <div>
          <div className='particle-sprite-hud__section-heading'>
            <span className='particle-sprite-hud__section-title'>Active</span>
            <span className='particle-sprite-hud__section-count'>
              {sprites.length} / {maxN} (min {minN})
            </span>
          </div>
          <div className='particle-sprite-hud__active'>
            {sprites.map((src, index) => (
              <div
                key={`${src.slice(0, 48)}-${index}`}
                className='particle-sprite-hud__chip particle-sprite-hud__chip--on'
                title={spriteLabel(src)}
              >
                <img src={presetSpriteSrc(src)} alt='' />
                {sprites.length > minN ? (
                  <button
                    type='button'
                    className='ui-dismiss-bubble'
                    aria-label={`Remove ${spriteLabel(src)}`}
                    onClick={() => removeAt(index)}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className='particle-sprite-hud__section-title'>Built-in</div>
          <div className='particle-sprite-hud__library'>
            {BUILTIN_PARTICLE_SPRITES.map((path) => {
              const selected = sprites.includes(path)
              return (
                <button
                  key={path}
                  type='button'
                  className={`particle-sprite-hud__lib-btn${selected ? ' particle-sprite-hud__lib-btn--selected' : ''}`}
                  title={path}
                  onClick={() => toggleBuiltin(path)}
                  aria-pressed={selected}
                >
                  <img src={`/${path}`} alt='' />
                </button>
              )
            })}
          </div>
        </div>
        <div className='particle-sprite-hud__upload'>
          <label
            className={`particle-sprite-hud__upload-label${uploadDisabled ? ' particle-sprite-hud__upload-label--disabled' : ''}`}
            title={!isSignedIn ? 'Sign in to upload a custom particle' : atCapacity ? `Max ${maxN} particles reached` : undefined}
          >
            + Add image
            <input
              type='file'
              accept='image/*'
              disabled={uploadDisabled}
              onChange={onFiles}
            />
          </label>
          {uploadError ? (
            <div className='particle-sprite-hud__upload-error' role='alert'>
              {uploadError}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export const ParticleSpriteHud = connectConfig(ParticleSpriteHudInner)
