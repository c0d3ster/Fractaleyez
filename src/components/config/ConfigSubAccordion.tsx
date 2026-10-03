import React, { useState } from 'react'
import classNames from 'classnames'
import './ConfigSubAccordion.css'

type ConfigSubAccordionProps = {
  title: string
  children: React.ReactNode
}

/** A collapsed-by-default section nested inside a layer body. */
export const ConfigSubAccordion = ({ title, children }: ConfigSubAccordionProps): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className='config-sub-accordion'>
      <button type='button' className='config-sub-accordion__title' aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
        <span>{title}</span>
        <span className='config-sub-accordion__chevron'>{isOpen ? '▾' : '▸'}</span>
      </button>
      <div className={classNames('config-sub-accordion__body', { 'hide-content': !isOpen })}>{children}</div>
    </div>
  )
}
