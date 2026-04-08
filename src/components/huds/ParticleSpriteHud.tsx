import React, { useCallback, useEffect, useRef } from 'react'
import './ParticleSpriteHud.css'

import { connectConfig } from '../config/context/ConfigProvider'
import { AppConfig } from '../../config/configDefaults'
import { BUILTIN_PARTICLE_SPRITES, particleConfig } from '../../config/particle.config'

const MAX_DATA_URL_BYTES = 2 * 1024 * 1024
const SPRITE_MAX_SIDE_PX = 512

function prepareSpriteDataUrl(dataUrl: string, maxSide: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      const maxDim = Math.max(w, h)
      if (maxDim <= maxSide || maxDim === 0) {
        resolve(dataUrl)
        return
      }
      const scale = maxSide / maxDim
      const newW = Math.max(1, Math.round(w * scale))
      const newH = Math.max(1, Math.round(h * scale))
      const canvas = document.createElement('canvas')
      canvas.width = newW
      canvas.height = newH
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, newW, newH)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('decode'))
    img.src = dataUrl
  })
}

async function dataUrlByteSize(dataUrl: string): Promise<number> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return blob.size
}

const spriteLabel = (src: string): string => {
  if (src.startsWith('data:')) return 'Custom'
  const base = src.split('/').pop() ?? src
  return base.replace(/\.[^.]+$/, '') || base
}

type ParticleSpriteHudProps = {
  config: AppConfig
  updateParticleSprites: (sprites: string[]) => void
}

const ParticleSpriteHudInner = ({ config, updateParticleSprites }: ParticleSpriteHudProps): React.ReactElement => {
  const sprites = config.particle.sprites.value
  const spritesRef = useRef(sprites)
  useEffect(() => {
    spritesRef.current = sprites
  }, [sprites])
  const { sprites_MIN: minN, sprites_MAX: maxN } = particleConfig
  const atCapacity = sprites.length >= maxN

  const setSprites = useCallback(
    (next: string[]) => {
      updateParticleSprites(next)
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
      if (file.size > MAX_DATA_URL_BYTES) {
        window.alert(`Image is too large (max ${MAX_DATA_URL_BYTES / (1024 * 1024)} MB per file).`)
        e.target.value = ''
        return
      }
      if (sprites.length >= maxN) {
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
            const bytes = await dataUrlByteSize(processed)
            if (bytes > MAX_DATA_URL_BYTES) {
              window.alert(
                `After scaling, the image is still over ${MAX_DATA_URL_BYTES / (1024 * 1024)} MB. Try a smaller or simpler image.`,
              )
              return
            }
            setSprites([...spritesRef.current, processed])
          } catch {
            window.alert('Could not process this image.')
          }
        })()
      }
      reader.readAsDataURL(file)
      e.target.value = ''
    },
    [sprites, maxN, setSprites],
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
                <img src={src.startsWith('data:') ? src : `/${src}`} alt='' />
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
            className={`particle-sprite-hud__upload-label${atCapacity ? ' particle-sprite-hud__upload-label--disabled' : ''}`}
          >
            + Add image
            <input
              type='file'
              accept='image/*'
              disabled={atCapacity}
              onChange={onFiles}
            />
          </label>
        </div>
      </div>
    </div>
  )
}

export const ParticleSpriteHud = connectConfig(ParticleSpriteHudInner)
