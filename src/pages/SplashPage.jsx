import React from 'react'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BrandMark from '../components/BrandMark'
import LanguageMenu from '../components/LanguageMenu'

/**
 * The first screen anybody sees, and the only chance to say what this is.
 *
 * It used to say "Meet by doing" over three one-word chips — Nearby, Smart
 * matches, Privacy first — which sound like features but answer none of the
 * questions a stranger actually has: what is an activity, who is hosting it,
 * what do I do, and is it safe to turn up. A tester signed up, got all the
 * way in, and still could not say what the app was for.
 *
 * So: one sentence on what it is, three steps on how it works, one line on
 * safety, then the two ways in. Short on purpose — this is a signpost, not a
 * brochure, and everything on it is a thing the app genuinely does.
 */
// Numbered steps; the words for each live with the translations.
const STEPS = [1, 2, 3]

export default function SplashPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div className="standalone-page splash-page premium-entry">
      <div className="entry-language">
        <LanguageMenu />
      </div>
      <div className="brand-orb">
        <BrandMark tile size={72} className="orb-mark" />
      </div>

      <div className="entry-copy">
        <span className="eyebrow">{t('common.appName')}</span>
        <h1>{t('splash.headline')}</h1>
        <p>{t('splash.lead')}</p>
      </div>

      {/* Numbered because it genuinely is a sequence: you cannot see what is
          on until you have said what you like. */}
      <ol className="splash-steps">
        {STEPS.map((step) => (
          <li key={step}>
            <span className="splash-step-number" aria-hidden="true">
              {step}
            </span>
            <span className="splash-step-copy">
              <strong>{t(`splash.step${step}Title`)}</strong>
              <small>{t(`splash.step${step}Body`)}</small>
            </span>
          </li>
        ))}
      </ol>

      {/* Every claim here is something the app actually does — reporting and
          blocking are real, moderators really do review, and approximate
          location really does round to about a kilometre before storing. */}
      <p className="splash-trust">
        <ShieldCheck size={15} aria-hidden="true" />
        <span>{t('splash.trust')}</span>
      </p>

      <div className="splash-actions">
        <button className="primary-button wide" onClick={() => navigate('/signup')}>
          {t('splash.createAccount')} <ArrowRight size={17} />
        </button>
        <button className="text-button" onClick={() => navigate('/signin')}>
          {t('splash.haveAccount')}
        </button>
      </div>
    </div>
  )
}
