import React, { useCallback, useEffect, useRef } from 'react'
import classNames from 'classnames'
import './LayerHeader.css'

import { connectConfig } from './context/ConfigProvider'
import { AppConfig, LayerKey } from '../../config/configDefaults'
import { LAYER_CAP } from '../../config/layers'
import { getParticleCrossfadeDurationMs } from '../../config/visualizer.config'
import { stepOpacity } from '../../visualization/layers/fade'

const DRAG_THRESHOLD_PX = 4
const KEY_STEP = 0.05

type LayerHeaderProps = {
  layerKey: LayerKey
  title: string
  config: AppConfig
  setLayerEnabled: (key: LayerKey, enabled: boolean) => boolean
  setLayerOpacity: (key: LayerKey, opacity: number) => void
  moveLayer: (key: LayerKey, toIndex: number) => void
  /** Sidebar only: shows the chevron and makes a plain click toggle the body. */
  collapsible?: boolean
  isOpen?: boolean
  onToggleOpen?: () => void
}

type DragState = {
  pointerId: number
  startX: number
  left: number
  width: number
  active: boolean
  aborted: boolean
}

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1)

const LayerHeaderInner = ({
  layerKey,
  title,
  config,
  setLayerEnabled,
  setLayerOpacity,
  moveLayer,
  collapsible = false,
  isOpen = false,
  onToggleOpen,
}: LayerHeaderProps): React.ReactElement => {
  const fillRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const frameRef = useRef<number | null>(null)

  const { meta, order } = config.layers
  const enabled = meta[layerKey].enabled.value
  const opacity = meta[layerKey].opacity.value
  const enabledCount = Object.values(meta).filter(m => m.enabled.value).length
  const atCap = !enabled && enabledCount >= LAYER_CAP
  const index = order.indexOf(layerKey)

  // What the layer is actually showing: its opacity while on, nothing while off. The fill follows this, so toggling the
  // power button sweeps it right to left (or back) instead of jumping, at the same rate the compositor fades the layer.
  const effective = enabled ? opacity : 0
  const displayedRef = useRef(effective)
  const initialFill = useRef(effective).current

  // Transform only: no layout reads or writes while dragging.
  const paintFill = useCallback((value: number): void => {
    displayedRef.current = value
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${value})`
  }, [])

  useEffect((): (() => void) | undefined => {
    // A drag or arrow key paints the fill itself; only a change it did not paint (the power button) animates.
    if (dragRef.current?.active || displayedRef.current === effective) return undefined
    let frame = 0
    let last = performance.now()
    const tick = (now: number): void => {
      paintFill(stepOpacity(displayedRef.current, effective, now - last, getParticleCrossfadeDurationMs()))
      last = now
      if (displayedRef.current !== effective) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [effective, paintFill])

  const commitOpacity = useCallback((value: number): void => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      setLayerOpacity(layerKey, value)
    })
  }, [layerKey, setLayerOpacity])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    // The one layout read, once per drag.
    const rect = event.currentTarget.getBoundingClientRect()
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, left: rect.left, width: rect.width, active: false, aborted: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.aborted || drag.pointerId !== event.pointerId || drag.width <= 0) return
    if (!drag.active) {
      if (Math.abs(event.clientX - drag.startX) < DRAG_THRESHOLD_PX) return
      // Dragging an off layer turns it on, unless the cap says no.
      if (!enabled && !setLayerEnabled(layerKey, true)) {
        drag.aborted = true
        return
      }
      drag.active = true
    }
    const value = clamp01((event.clientX - drag.left) / drag.width)
    paintFill(value)
    commitOpacity(value)
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (!drag.active && !drag.aborted && collapsible) onToggleOpen?.()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return
    // Only handle what the slider owns; everything else bubbles so forwarded hotkeys keep working.
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const next = clamp01(Math.round((opacity + (event.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP)) * 100) / 100)
      if (enabled) paintFill(next)
      setLayerOpacity(layerKey, next)
      return
    }
    if (collapsible && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      onToggleOpen?.()
    }
  }

  // Buttons inside the header must not start a drag or toggle the body.
  const stop = (event: React.SyntheticEvent): void => event.stopPropagation()

  const move = (toIndex: number): void => moveLayer(layerKey, toIndex)
  const cycle = (): void => move(index + 1 >= order.length ? 0 : index + 1)

  const percent = Math.round(opacity * 100)

  return (
    <div
      className={classNames('category-title', 'layer-header', { 'layer-header--off': !enabled })}
      role='slider'
      tabIndex={0}
      aria-label={`${title} opacity`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}%${enabled ? '' : ', off'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <div className='layer-header__fill' ref={fillRef} style={{ transform: `scaleX(${initialFill})` }} />
      <button
        type='button'
        className={classNames('layer-header__power', { 'layer-header__power--on': enabled })}
        aria-label={`${enabled ? 'Disable' : 'Enable'} ${title}`}
        aria-pressed={enabled}
        disabled={atCap}
        title={atCap ? `Layer limit reached (${LAYER_CAP}). Turn another layer off first.` : undefined}
        onPointerDown={stop}
        onPointerUp={stop}
        onClick={(event) => {
          stop(event)
          setLayerEnabled(layerKey, !enabled)
        }}
      >
        <svg viewBox='0 -0.5 16 16' width='18' height='18' aria-hidden='true' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round'>
          <path d='M8 1.5v6' />
          <path d='M4.4 3.8a5.5 5.5 0 1 0 7.2 0' />
        </svg>
      </button>
      <span className='layer-header__name'>{title}</span>
      <span className='layer-header__percent'>{percent}%</span>
      <span className='layer-header__stepper' onPointerDown={stop} onPointerUp={stop}>
        <button type='button' aria-label={`Move ${title} back`} disabled={index <= 0} onClick={() => move(index - 1)}>-</button>
        <button type='button' className='layer-header__badge' aria-label={`${title} is layer ${index}; click to move it forward`} title='Layer order' onClick={cycle}>
          {index}
        </button>
        <button type='button' aria-label={`Move ${title} forward`} disabled={index >= order.length - 1} onClick={() => move(index + 1)}>+</button>
      </span>
      {collapsible && <span className={classNames('layer-header__chevron', { 'layer-header__chevron--open': isOpen })} aria-hidden='true'>&#9662;</span>}
    </div>
  )
}

export const LayerHeader = connectConfig(LayerHeaderInner)
