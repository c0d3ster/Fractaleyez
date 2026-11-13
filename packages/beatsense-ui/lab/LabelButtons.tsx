import React from 'react'

import { LABEL_INFO, type LabelKind } from './recording/labels'
import type { RecordingControls } from './useRecording'

type LabelButtonsProps = {
  controls: RecordingControls
  kinds: readonly LabelKind[]
  /** What the group is, for screen readers. */
  name: string
}

/** A row of label buttons, each with its hotkey and its count so far; live only while recording. */
export const LabelButtons = ({ controls, kinds, name }: LabelButtonsProps): React.ReactElement => {
  const { status, recording, addLabel } = controls
  return (
    <div className='lab-labels' role='group' aria-label={name}>
      {kinds.map((kind) => {
        const { name: text, key, color } = LABEL_INFO[kind]
        const count = status.labelCounts[kind]
        return (
          <button
            key={kind}
            type='button'
            className='lab-label-button'
            style={{ borderColor: color }}
            onClick={(): void => addLabel(kind)}
            disabled={!recording}
            title={`Add a ${text.toLowerCase()} label (key ${key.toUpperCase()})`}
          >
            {text} <kbd>{key.toUpperCase()}</kbd>
            {count > 0 && <span className='lab-label-count'>{count}</span>}
          </button>
        )
      })}
    </div>
  )
}
