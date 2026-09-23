import React from 'react'
import { CalendarClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useAuth } from '../context/AuthContext'
import { MIN_AGE } from '../utils/age'

/**
 * What an account below the minimum sees, in place of the app.
 *
 * It says the number, says when they can come back, and offers the way
 * out. Being refused without being told the rule is the thing that makes
 * people certain a decision was arbitrary, and a minimum age is not a
 * judgement about anybody — it is one line in the terms, so it can be
 * stated plainly.
 *
 * There is deliberately no "change my date of birth" here. Offering it
 * would make the gate a guessing game with unlimited tries, which is
 * worse than useless: it would still stop nobody, and it would pretend
 * to. What this is honestly worth is written down in README §12.
 */
export default function TooYoungScreen({ age }) {
  const { t } = useTranslation()
  const { user, signOut } = useAuth()
  // Their age from whichever place knows it: the date they have just
  // typed, when this is the answer to the sign-up question, or the one
  // already on their profile when the account was let in under an older
  // minimum than the one that stands now.
  const known = age ?? user?.age ?? null
  // How long until they are old enough — the one genuinely useful thing
  // this screen can offer, and better than "come back another time".
  const years = known === null ? null : MIN_AGE - known

  return (
    <div className="page-content boot-screen">
      <div className="empty-state">
        <CalendarClock size={30} />
        <h3>{t('age.tooYoungTitle')}</h3>
        <p>{t('age.tooYoungBody', { count: MIN_AGE })}</p>
        {years !== null && years > 0 && (
          <p className="helper-text">{t('age.comeBack', { count: years })}</p>
        )}
        <button className="primary-button" onClick={signOut}>
          {t('common.signOut')}
        </button>
      </div>
    </div>
  )
}
