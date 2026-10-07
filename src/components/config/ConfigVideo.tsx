import React from 'react'
import './ConfigCategory.css'

import { LayerHeader } from './LayerHeader'
import { ConfigVideoBody } from './ConfigVideoBody'
import { PerfHud } from '../huds'
import { ResetIcon } from './ResetIcon'
import { connectConfig, ConfigContextValue } from './context/ConfigProvider'

type ConfigVideoProps = {
  isOpen: boolean
  toggleOpen: (name: string) => void
  /** Popup column: always open; the reset button sits above the header, as on the other columns. */
  popup?: boolean
  resetVideoClips: ConfigContextValue['resetVideoClips']
}

const ConfigVideoInner = ({ isOpen, toggleOpen, popup = false, resetVideoClips }: ConfigVideoProps): React.ReactElement => (
  <div className='category-container category-container--video'>
    <LayerHeader
      layerKey='video'
      title='video'
      collapsible={!popup}
      onToggleOpen={() => toggleOpen('video')}
      onReset={popup ? undefined : resetVideoClips}
    />
    {popup && (
      <button
        type='button'
        className='category-reset'
        title='Reset this section to the preset'
        aria-label='Reset video config'
        onClick={resetVideoClips}
      >
        <ResetIcon />
      </button>
    )}
    <div className={`category-content${isOpen ? '' : ' hide-content'}`}>
      <ConfigVideoBody />
      {popup && <PerfHud />}
    </div>
  </div>
)

export const ConfigVideo = connectConfig(ConfigVideoInner)
