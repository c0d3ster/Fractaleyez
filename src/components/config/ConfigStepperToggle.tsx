import React, { useCallback } from 'react'
import './StepperToggle.css'

type ConfigStepperToggleProps = {
  name: string
  label: string
  checked: boolean
  amount: number
  min: number
  max: number
  step: number
  onToggle: (checked: boolean) => void
  onAmountChange: (amount: number) => void
  onAmountReset: () => void
}

/** An effect switch with an amount: the name on top toggles it, a - / + stepper below sets how much. */
export const ConfigStepperToggle = React.memo(({ name, label, checked, amount, min, max, step, onToggle, onAmountChange, onAmountReset }: ConfigStepperToggleProps): React.ReactElement => {
  const handleToggle = useCallback((): void => onToggle(!checked), [onToggle, checked])
  const handleDecrease = useCallback((): void => onAmountChange(Math.max(min, amount - step)), [onAmountChange, min, step, amount])
  const handleIncrease = useCallback((): void => onAmountChange(Math.min(max, amount + step)), [onAmountChange, max, step, amount])

  return (
    <div className={`stepper-toggle${checked ? ' stepper-toggle--on' : ''}`}>
      <button type='button' className='stepper-toggle-label' id={name} aria-pressed={checked} onClick={handleToggle}>
        {label}
      </button>
      <div className='stepper-toggle-amount'>
        <button type='button' aria-label={`Decrease ${label}`} disabled={amount <= min} onClick={handleDecrease}>−</button>
        <span className='stepper-toggle-value' title='Double-click to reset' onDoubleClick={onAmountReset}>{amount}</span>
        <button type='button' aria-label={`Increase ${label}`} disabled={amount >= max} onClick={handleIncrease}>+</button>
      </div>
    </div>
  )
})
