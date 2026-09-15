import React from 'react'
import { RotateCcw, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useApp } from '../context/AppContext'
import { categoryLabel, signalLabel } from '../i18n'
import { recommendationWeights } from '../services/recommendationService'

const SIGNALS = Object.keys(recommendationWeights)
const MAX = 50

/**
 * Makes the ranking adjustable, and therefore inspectable.
 *
 * The scoring is the part of SmartSync worth defending and the part nobody
 * can see. Six sliders with the ranking reordering underneath turn "there is
 * an algorithm" into something a person can interrogate in ten seconds — and
 * it is the same mechanism the evaluation harness uses to measure what each
 * signal contributes, so what you can try here is exactly what was measured.
 */
export default function WeightsPage() {
  const { t } = useTranslation()
  const { weights, setWeights, resetWeights, recommendations } = useApp()

  const total = SIGNALS.reduce((sum, key) => sum + (weights[key] ?? 0), 0)
  const isDefault = SIGNALS.every((key) => weights[key] === recommendationWeights[key])

  const set = (key, value) => setWeights((current) => ({ ...current, [key]: Number(value) }))

  return (
    <div className="page-content">
      <section className="headline-block">
        <span className="eyebrow">{t('weights.eyebrow')}</span>
        <h2>{t('weights.title')}</h2>
        <p className="helper-text">{t('weights.lead')}</p>
      </section>

      <div className="form-card">
        {SIGNALS.map((key) => {
          const value = weights[key] ?? 0
          const share = total > 0 ? Math.round((value / total) * 100) : 0
          return (
            <label key={key} className="weight-row">
              <span className="weight-head">
                <strong>{signalLabel(key)}</strong>
                {/* The share matters more than the raw number: scores are
                    normalised by the total, so 20 out of 60 and 40 out of 120
                    rank identically. */}
                <span className="tiny-chip">{t('common.percent', { value: share })}</span>
              </span>
              <input
                type="range"
                min="0"
                max={MAX}
                value={value}
                onChange={(event) => set(key, event.target.value)}
                aria-label={signalLabel(key)}
              />
            </label>
          )
        })}

        {total === 0 && (
          <p className="form-error" role="alert">
            {t('weights.allZero')}
          </p>
        )}

        <button className="secondary-button wide" onClick={resetWeights} disabled={isDefault}>
          <RotateCcw size={16} /> {t('weights.reset')}
        </button>
      </div>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{t('weights.previewEyebrow')}</span>
            <h2>{t('weights.previewTitle')}</h2>
          </div>
          <Sparkles size={18} />
        </div>
        <div className="stack list-stack">
          {recommendations.slice(0, 5).map((activity, index) => (
            <div className="weight-preview-row" key={activity.id}>
              <span className="rank">{index + 1}</span>
              <div>
                <strong>{activity.title}</strong>
                <p>{categoryLabel(activity.category)}</p>
              </div>
              <span className="match-pill">
                {t('common.percent', { value: activity.matchScore })}
              </span>
            </div>
          ))}
          {recommendations.length === 0 && (
            <div className="empty-state small">
              <p>{t('weights.previewEmpty')}</p>
            </div>
          )}
        </div>
      </section>

      <p className="helper-text">{t('weights.note')}</p>
    </div>
  )
}
