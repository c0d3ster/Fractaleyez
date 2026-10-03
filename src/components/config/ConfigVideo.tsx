import React from 'react'
import './ConfigCategory.css'

import { LayerHeader } from './LayerHeader'
import { ConfigVideoBody } from './ConfigVideoBody'

type ConfigVideoProps = {
  isOpen: boolean
  toggleOpen: (name: string) => void
  /** Popup column: always open, no chevron. */
  popup?: boolean
}

export const ConfigVideo = ({ isOpen, toggleOpen, popup = false }: ConfigVideoProps): React.ReactElement => (
  <div className='category-container category-container--video'>
    <LayerHeader
      layerKey='video'
      title='video'
      collapsible={!popup}
      isOpen={isOpen}
      onToggleOpen={() => toggleOpen('video')}
    />
    <div className={`category-content${isOpen ? '' : ' hide-content'}`}>
      <ConfigVideoBody />
    </div>
  </div>
)
