import React from 'react'
import './ConfirmModal.css'

type ConfirmModalOption = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

type ConfirmModalProps = {
  title: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  // Optional checkbox under the body, e.g. "Don't show this again".
  option?: ConfirmModalOption
  children: React.ReactNode
}

// Cancel takes focus so a stray Enter or Space never confirms the risky choice.
export const ConfirmModal = ({ title, confirmLabel, cancelLabel, onConfirm, onCancel, option, children }: ConfirmModalProps): React.ReactElement => {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') onCancel()
  }

  return (
    <div className='confirm-modal-overlay' onKeyDown={handleKeyDown}>
      <div className='confirm-modal-card' role='dialog' aria-modal='true' aria-label={title}>
        <h2 className='confirm-modal-title'>{title}</h2>
        <div className='confirm-modal-body'>{children}</div>
        {option && (
          <label className='confirm-modal-option'>
            <input type='checkbox' checked={option.checked} onChange={(event) => option.onChange(event.target.checked)} />
            {option.label}
          </label>
        )}
        <div className='confirm-modal-actions'>
          <button type='button' className='confirm-modal-cancel' onClick={onCancel} autoFocus>{cancelLabel}</button>
          <button type='button' className='confirm-modal-confirm' onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
