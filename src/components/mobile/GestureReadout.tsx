import React, { useEffect, useRef, useState } from 'react'

import { userHeading } from '../../config/heading'
import type { ActiveGestureKind } from '../../input/touchController'
import { subscribeUiTick } from '../../utils/uiTicker'
import { CameraTouchpad } from '../config/CameraTouchpad'
import { useInfoText } from '../config/info/infoText'
import { SpinDial } from '../config/SpinDial'
import { fillFraction, formatReadoutValue } from './gestureReadout'
import { useGestureReadout } from './gestureReadoutStore'
import { useControlsVisibility } from './useControlsVisibility'
import './GestureReadout.css'

type ValueKind = 'speed' | 'scale' | 'rotation'
const ITEM: Record<ValueKind, 'speed' | 'scaleFactor' | 'rotationSpeed'> = { speed: 'speed', scale: 'scaleFactor', rotation: 'rotationSpeed' }
const LABEL: Record<ActiveGestureKind, string> = { steer: 'Steering', speed: 'Speed', scale: 'Scale', rotation: 'Rotation', reset: 'Reset' }

type Live = { value: number; min: number; max: number; step: number }

const readLive = (kind: ValueKind): Live => {
  const item = window.config?.user[ITEM[kind]]
  return { value: item?.value ?? 0, min: item?.min ?? 0, max: item?.max ?? 1, step: item?.step ?? 1 }
}

/** The setting `kind` drives, read from window.config on the shared UI tick (not per frame, and not through the config state). */
const useLiveValue = (kind: ValueKind): Live => {
  const [live, setLive] = useState(() => readLive(kind))
  useEffect(() => {
    const poll = (): void => {
      const next = readLive(kind)
      setLive((previous) => (previous.value === next.value && previous.min === next.min && previous.max === next.max ? previous : next))
    }
    poll()
    return subscribeUiTick(poll)
  }, [kind])
  return live
}

const Caption = ({ label, value, hint }: { label: string; value: string; hint: string }): React.ReactElement => (
  <div className='gesture-panel__text'>
    <div className='gesture-panel__label'>{label}</div>
    <div className='gesture-panel__value'>{value}</div>
    <div className='gesture-panel__hint'>{hint}</div>
  </div>
)

const SpeedPanel = (): React.ReactElement => {
  const { value, min, max } = useLiveValue('speed')
  return (
    <>
      <div className='gesture-panel__vbar' aria-hidden='true'>
        <div className='gesture-panel__vbar-fill' style={{ height: `${fillFraction(value, min, max) * 100}%` }} />
      </div>
      <Caption label={LABEL.speed} value={formatReadoutValue('speed', value)} hint='Drag up to go faster' />
    </>
  )
}

const ScalePanel = (): React.ReactElement => {
  const { value, min, max } = useLiveValue('scale')
  return (
    <div className='gesture-panel__slider'>
      <div className='gesture-panel__slider-head'>
        <span className='gesture-panel__label'>{LABEL.scale}</span>
        <span className='gesture-panel__value gesture-panel__value--small'>{formatReadoutValue('scale', value)}</span>
      </div>
      <div className='gesture-panel__hbar' aria-hidden='true'>
        <div className='gesture-panel__hbar-fill' style={{ width: `${fillFraction(value, min, max) * 100}%` }} />
      </div>
      <div className='gesture-panel__hint'>Spread to zoom in</div>
    </div>
  )
}

const noop = (): void => undefined

const RotationPanel = (): React.ReactElement => {
  const { value, min, max, step } = useLiveValue('rotation')
  return (
    <>
      <div className='gesture-panel__dial'>
        <SpinDial label={LABEL.rotation} value={value} min={min} max={max} step={step} heading={userHeading} onChange={noop} onReset={noop} readOnly />
      </div>
      <Caption label={LABEL.rotation} value={formatReadoutValue('rotation', value)} hint='Arc is speed, arrow is bearing' />
    </>
  )
}

const SteerPanel = (): React.ReactElement => (
  <>
    <div className='gesture-panel__pad'><CameraTouchpad /></div>
    <div className='gesture-panel__text'>
      <div className='gesture-panel__label'>{LABEL.steer}</div>
      <div className='gesture-panel__line'>Heading to target</div>
      <div className='gesture-panel__hint'>Crosshair is the target, ring is the camera</div>
    </div>
  </>
)

const ResetPanel = (): React.ReactElement => (
  <>
    <svg aria-hidden='true' width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='#FFA032' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
      <path d='M3 12a9 9 0 1 0 3-6.7' />
      <path d='M3 4v5h5' />
    </svg>
    <div className='gesture-panel__line'>Speed and rotation reset</div>
  </>
)

const PANELS: Record<ActiveGestureKind, () => React.ReactElement> = {
  steer: SteerPanel,
  speed: SpeedPanel,
  scale: ScalePanel,
  rotation: RotationPanel,
  reset: ResetPanel,
}

const ChipValue = ({ kind }: { kind: ValueKind }): React.ReactElement => {
  const { value } = useLiveValue(kind)
  return <span className='gesture-chip__value'>{formatReadoutValue(kind, value)}</span>
}

const isValueKind = (kind: ActiveGestureKind): kind is ValueKind => kind in ITEM

type FadingProps = { className: string; visible: boolean; data: Record<string, string>; children: React.ReactNode }

/**
 * Fades out with CSS once `visible` goes false, then unmounts its content, so a readout nobody sees stops polling (the camera pad,
 * the live values). Shown again, it is back at once.
 */
const Fading = ({ className, visible, data, children }: FadingProps): React.ReactElement | null => {
  const [gone, setGone] = useState(false)
  if (visible && gone) setGone(false)
  if (gone) return null
  return (
    <div
      className={`${className}${visible ? '' : ' gesture-readout--hidden'}`}
      {...data}
      aria-hidden={!visible}
      onTransitionEnd={(event) => { if (!visible && event.target === event.currentTarget) setGone(true) }}
    >
      {children}
    </div>
  )
}

/** Full's one line at the bottom, from the programmatic info text. It keeps the last line while it fades out. */
const GestureInfoLine = (): React.ReactElement | null => {
  const text = useInfoText()
  const last = useRef(text)
  if (text) last.current = text
  if (!last.current) return null
  return (
    <div className={`gesture-info${text ? '' : ' gesture-readout--hidden'}`} data-gesture-info={text ? 'on' : 'off'} role='status'>
      {last.current}
    </div>
  )
}

/**
 * What shows while a gesture is active, per On-screen controls mode (mounted only in the mobile shell): in Full the desktop control
 * in a panel near the top and a one-line description at the bottom, in Limited a label and number chip in the top-right corner,
 * in None nothing. Values are read live from window.config on the UI tick. It sits under the menu sheet in the z-order.
 */
export const GestureReadout = (): React.ReactElement | null => {
  const { readout } = useControlsVisibility()
  const { style, kind, visible } = useGestureReadout()
  if (readout === 'none') return null
  const data = { 'data-gesture-readout': style ?? 'none', 'data-kind': kind ?? '', 'data-visible': visible ? 'on' : 'off' }

  if (style === 'chip' && kind) {
    return (
      <Fading className='gesture-chip' visible={visible} data={data}>
        <span className='gesture-chip__label'>{LABEL[kind]}</span>
        {isValueKind(kind) ? <ChipValue kind={kind} /> : null}
      </Fading>
    )
  }
  const Panel = style === 'full' && kind ? PANELS[kind] : null
  return (
    <>
      {Panel ? <Fading className='gesture-panel' visible={visible} data={data}><Panel /></Fading> : null}
      <GestureInfoLine />
    </>
  )
}
