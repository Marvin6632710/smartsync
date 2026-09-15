import i18n from './index'

/**
 * Why a queued write did not land, in the language in force.
 *
 * The registry (see `unsent` in AppContext) stores a code and an English
 * message with each failed row, and the rows outlive the page in storage.
 * The code is what is worded here; the stored message is the fallback for
 * a refusal whose reason came from the server rather than from the app.
 */
export function unsentErrorText(error, kind) {
  const code = error?.code
  if (code === 'permission-denied') return i18n.t('unsent.refusedNoLongerAllowed')
  if (code === 'refused') return i18n.t('unsent.refusedOnReconnect')
  if (code === 'superseded') {
    return i18n.t(kind === 'profile' ? 'unsent.supersededProfile' : 'unsent.supersededActivity')
  }
  return error?.message ? String(error.message) : ''
}
