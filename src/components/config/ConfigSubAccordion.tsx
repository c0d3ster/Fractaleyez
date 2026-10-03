import React, { useState } from 'react'
import classNames from 'classnames'
import './ConfigSubAccordion.css'

type ConfigSubAccordionProps = {
  title: string
  children: React.ReactNode
  /** Controlled mode (e.g. a single-open group); omit both to self-manage, collapsed by default. */
  isOpen?: boolean
  onToggle?: () => void
}

/** A collapsed-by-default section nested inside a layer body. */
export const ConfigSubAccordion = ({ title, children, isOpen: controlledOpen, onToggle }: ConfigSubAccordionProps): React.ReactElement => {
  const [localOpen, setLocalOpen] = useState(false)
  const isOpen = controlledOpen ?? localOpen
  const handleToggle = (): void => (onToggle ? onToggle() : setLocalOpen((open) => !open))

  return (
    <div className='config-sub-accordion'>
      <button type='button' className='config-sub-accordion__title' aria-expanded={isOpen} onClick={handleToggle}>
        <span>{title}</span>
        <span className='config-sub-accordion__chevron'>{isOpen ? '▾' : '▸'}</span>
      </button>
      <div className={classNames('config-sub-accordion__body', { 'hide-content': !isOpen })}>{children}</div>
    </div>
  )
}
