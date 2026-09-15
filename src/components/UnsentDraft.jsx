import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useApp } from '../context/AppContext'
import { unsentErrorText } from '../i18n/unsent'

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
  const { t } = useTranslation()
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
          {superseded
            ? t('unsent.notWhatItShows', { what })
            : t('unsent.couldNotBeSaved', { what })}
        </strong>
        <p>
          {unsentErrorText(row.error, row.kind) || t('unsent.refused')}{' '}
          {superseded ? t('unsent.restoreSuperseded') : t('unsent.restoreRetry')}
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
            {t('common.restore')}
          </button>
          <button type="button" className="text-button" onClick={() => discardUnsent(row.id)}>
            {t('common.discard')}
          </button>
        </div>
      </div>
    </div>
  )
}
