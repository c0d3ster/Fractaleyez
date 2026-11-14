import React from 'react'

import { ACTION_KEYS, LABEL_INFO, type LabelAction } from './recording/labels'
import type { RecordingStatus } from './labSession'
import type { RecordingControls } from './useRecording'

type LabelButtonsProps = {
  controls: RecordingControls
  actions: readonly LabelAction[]
  /** What the group is, for screen readers. */
  name: string
}

type ButtonFace = { text: string; color: string; count: number; title: string; active?: boolean }

/** A label's button, or the riser's, which starts a riser or ends the open one and says which it does next. */
const face = (action: LabelAction, { labelCounts, riserOpen }: RecordingStatus): ButtonFace => {
  const key = ACTION_KEYS[action].toUpperCase()
  if (action === 'riser') {
    return {
      text: riserOpen ? 'End riser' : 'Riser',
      color: LABEL_INFO[riserOpen ? 'riserEnd' : 'riserStart'].color,
      count: labelCounts.riserStart,
      title: `${riserOpen ? 'End the riser' : 'Start a riser'} (key ${key}, which starts one and ends it on the next press)`,
      active: riserOpen,
    }
  }
  const { name, color } = LABEL_INFO[action]
  return { text: name, color, count: labelCounts[action], title: `Add a ${name.toLowerCase()} label (key ${key})` }
}

/** A row of label buttons, each with its hotkey and its count so far; live only while recording. */
export const LabelButtons = ({ controls, actions, name }: LabelButtonsProps): React.ReactElement => {
  const { status, recording, addLabel } = controls
  return (
    <div className='lab-labels' role='group' aria-label={name}>
      {actions.map((action) => {
        const { text, color, count, title, active } = face(action, status)
        return (
          <button
            key={action}
            type='button'
            className={`lab-label-button${active ? ' lab-label-active' : ''}`}
            style={{ borderColor: color }}
            onClick={(): void => addLabel(action)}
            disabled={!recording}
            title={title}
          >
            {text} <kbd>{ACTION_KEYS[action].toUpperCase()}</kbd>
            {count > 0 && <span className='lab-label-count'>{count}</span>}
          </button>
        )
      })}
    </div>
  )
}
