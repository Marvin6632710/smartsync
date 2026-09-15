import React from 'react'
import { AlertTriangle } from 'lucide-react'

import { useApp } from '../context/AppContext'

/**
 * Content a screen let go of that the server then refused.
 *
 * A form saved offline navigates away — the local copy already shows the
 * change — and if the queued write is refused later, what was typed has
 * nowhere to be. The context keeps it (see `unsent` there); this offers it
 * back where it was typed, to restore into the form or to discard. It never
 * writes over what is in the form already: restoring is the person's tap.
 */
export default function UnsentDraft({ row, what, onRestore }) {
  const { discardUnsent } = useApp()
  if (!row) return null
  // Superseded: the document was changed elsewhere after this was saved, so
  // the current version is somebody's deliberate edit. The draft is still
  // offered — it is what the person typed — but restoring it is put to them
  // as a choice over that version, not as a retry of a failed save.
  const superseded = row.error?.code === 'superseded'
  return (
    <div className="unsent-draft" role="alert">
      <AlertTriangle size={16} />
      <div className="unsent-copy">
        <strong>
          {what} {superseded ? 'is not what it shows now' : "couldn't be saved"}
        </strong>
        <p>
          {row.error?.message || 'It was refused.'}{' '}
          {superseded
            ? 'Restore it to put your version in the form, or discard it.'
            : 'Restore it to try again, or discard it.'}
        </p>
        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              onRestore(row.payload)
              discardUnsent(row.id)
            }}
          >
            Restore
          </button>
          <button type="button" className="text-button" onClick={() => discardUnsent(row.id)}>
            Discard
          </button>
        </div>
      </div>
    </div>
  )
}
