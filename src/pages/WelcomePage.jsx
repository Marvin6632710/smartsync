import React from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  EyeOff,
  Globe,
  LayoutGrid,
  MapPin,
  MapPinned,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'

import BrandMark from '../components/BrandMark'
import CategoryIcon from '../components/CategoryIcon'
import LanguageMenu from '../components/LanguageMenu'
import ThemeChoice from '../components/ThemeChoice'
import { categories } from '../data/categories'
import { LANGUAGES, categoryLabel, reasonText } from '../i18n'

/**
 * The front door.
 *
 * Two columns: the words on the left, and on the right the app itself —
 * not a photograph of people having a good time, but the three things a
 * person gets that no listing site gives them, drawn the way the app draws
 * them. An activity card with its match score; the reasons the score was
 * given, worded by the same function that words them inside the app; and
 * the group chat that opens the moment you join. Every figure on the card
 * is an example and says so in its wording; the counts under the buttons
 * (categories, languages) are read from the code, so they cannot drift.
 *
 * Under the fold, the three steps and three lines on safety, because those
 * are the questions a stranger actually has before signing up.
 */

// Numbered because it genuinely is a sequence: you cannot see what is on
// until you have said what you like.
const STEPS = [1, 2, 3]

// The example activity on the stage. One category, chosen for its colour.
const STAGE = { category: 'Football', match: 92, going: 4, capacity: 10, distanceKm: 1.2 }

const SAFETY = [
  { n: 1, icon: ShieldCheck },
  { n: 2, icon: EyeOff },
  { n: 3, icon: MapPinned },
]

/**
 * The composition on the right: the card, its reasons, the chat. Marked
 * decorative — the copy on the left says everything it shows.
 */
function Stage() {
  const { t } = useTranslation()
  const category = STAGE.category
  const reasons = [
    reasonText({ key: 'interest', category }),
    reasonText({ key: 'distance', distanceKm: STAGE.distanceKm }),
    reasonText({ key: 'time', band: 'Evening' }),
  ]
  const spots = STAGE.capacity - STAGE.going
  return (
    <div className="welcome-stage" aria-hidden="true">
      <div className="activity-card welcome-stage-card" data-category={category.toLowerCase()}>
        <div className="activity-visual">
          <div className="card-topline">
            <span className="category-chip">
              <CategoryIcon category={category} size={12} />
              {categoryLabel(category)}
            </span>
            <span className="match-pill">{t('common.match', { value: STAGE.match })}</span>
          </div>
          <div className="activity-title-block">
            <h3>{t('welcome.stage.cardTitle')}</h3>
          </div>
        </div>
        <div className="activity-body">
          <div className="meta-line">
            <span>
              <Clock3 size={13} /> {t('welcome.stage.cardWhen')}
            </span>
            <span>
              <MapPin size={13} /> {t('distance.km', { value: STAGE.distanceKm })} ·{' '}
              {t('welcome.stage.cardWhere')}
            </span>
          </div>
          <div className="activity-foot welcome-stage-foot">
            <span className="going-line">
              <span className="going-stack">
                <span className="going-face">MA</span>
                <span className="going-face">NK</span>
                <span className="going-face">JU</span>
              </span>
              <span className="going-count">
                {t('card.ofCapacityGoing', { count: STAGE.going, capacity: STAGE.capacity })}
              </span>
            </span>
            <span className="urgency-pill tone-last">
              {t('urgency.spotsLeft', { count: spots })}
            </span>
          </div>
        </div>
        <div className="capacity-meter">
          <span style={{ width: `${(STAGE.going / STAGE.capacity) * 100}%` }} />
        </div>
      </div>

      <div className="welcome-stage-why">
        <span className="eyebrow">{t('welcome.stage.why')}</span>
        <ul className="reason-list">
          {reasons.map((reason) => (
            <li key={reason}>
              <CheckCircle2 size={15} />
              {reason}
            </li>
          ))}
        </ul>
      </div>

      <div className="welcome-stage-chat">
        <div className="message-bubble">
          <strong>{t('welcome.stage.chatName')}</strong>
          <p>{t('welcome.stage.chatA')}</p>
        </div>
        <div className="message-bubble mine">
          <strong>{t('common.you')}</strong>
          <p>{t('welcome.stage.chatB')}</p>
        </div>
        <span className="welcome-stage-caption">
          <MessageCircle size={13} />
          {t('welcome.stage.chatCaption')}
        </span>
      </div>
    </div>
  )
}

export default function WelcomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="welcome-page">
      <header className="welcome-bar">
        <Link to="/" className="welcome-brand" aria-label={t('common.appName')}>
          <BrandMark tile size={36} />
          <span>{t('common.appName')}</span>
        </Link>
        <div className="welcome-tools">
          <LanguageMenu compact />
          <ThemeChoice />
          <Link to="/signin" className="text-button welcome-bar-login">
            {t('welcome.logIn')}
          </Link>
          <Link to="/signup" className="primary-button welcome-bar-signup">
            {t('welcome.signUp')}
          </Link>
        </div>
      </header>

      <main className="welcome-main">
        <section className="welcome-hero">
          <div className="welcome-copy">
            <span className="welcome-eyebrow">
              <MapPin size={13} aria-hidden="true" />
              {t('welcome.eyebrow')}
            </span>
            <h1 className="welcome-headline">
              <Trans
                i18nKey="welcome.headline"
                components={[<span key="accent" className="welcome-accent" />]}
              />
            </h1>
            <p className="welcome-lead">{t('welcome.lead')}</p>
            <div className="welcome-actions">
              <button className="primary-button welcome-cta" onClick={() => navigate('/signup')}>
                {t('welcome.signUp')} <ArrowRight size={18} />
              </button>
              <button className="secondary-button welcome-cta" onClick={() => navigate('/signin')}>
                {t('welcome.logIn')}
              </button>
            </div>
            {/* Read from the code, not typed: the counts are whatever the
                app currently offers. */}
            <ul className="welcome-facts">
              <li>
                <LayoutGrid size={14} aria-hidden="true" />
                {t('welcome.facts.categories', { count: categories.length })}
              </li>
              <li>
                <Globe size={14} aria-hidden="true" />
                {t('welcome.facts.languages', { count: LANGUAGES.length })}
              </li>
              <li>
                <CheckCircle2 size={14} aria-hidden="true" />
                {t('welcome.facts.free')}
              </li>
            </ul>
          </div>

          <Stage />
        </section>

        <section className="welcome-how" aria-labelledby="welcome-how-title">
          <div className="welcome-section-head">
            <span className="eyebrow">{t('welcome.howEyebrow')}</span>
            <h2 id="welcome-how-title">{t('welcome.howTitle')}</h2>
          </div>
          <ol className="splash-steps welcome-steps">
            {STEPS.map((step) => (
              <li key={step}>
                <span className="splash-step-number" aria-hidden="true">
                  {step}
                </span>
                <span className="splash-step-copy">
                  <strong>{t(`welcome.step${step}Title`)}</strong>
                  <small>{t(`welcome.step${step}Body`)}</small>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Every line here is something the app actually does — reporting
            and blocking are real, an admin really does review, anonymous
            mode really swaps the name, and approximate location really
            rounds to about a kilometre before storing. */}
        <section className="welcome-safe" aria-labelledby="welcome-safe-title">
          <div className="welcome-section-head">
            <span className="eyebrow">{t('welcome.safeEyebrow')}</span>
            <h2 id="welcome-safe-title">{t('welcome.safeTitle')}</h2>
          </div>
          <ul className="welcome-safe-list">
            {SAFETY.map(({ n, icon: Icon }) => (
              <li key={n}>
                <span className="welcome-safe-icon" aria-hidden="true">
                  <Icon size={17} />
                </span>
                <strong>{t(`welcome.safe${n}Title`)}</strong>
                <small>{t(`welcome.safe${n}Body`)}</small>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="welcome-footer">
        <span>{t('welcome.footer')}</span>
        <Link to="/terms">{t('welcome.termsLink')}</Link>
      </footer>
    </div>
  )
}
