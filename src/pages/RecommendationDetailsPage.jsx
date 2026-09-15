import React from 'react'
import { BrainCircuit, Check } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BootScreen from '../components/BootScreen'
import { useApp } from '../context/AppContext'
import { reasonLines, signalLabel } from '../i18n'
import { weightShares } from '../services/recommendationService'

export default function RecommendationDetailsPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { activities, recommendations, weights, loading, syncing } = useApp()
  // Every activity is scored, not only the ones still being suggested: the
  // details page offers "More" on things you joined that have since
  // happened, been cancelled, or whose host you blocked, and those live in
  // `activities`. Reading only `recommendations` sent each of them here to
  // a dead end.
  const a = activities.find((x) => x.id === id) || recommendations.find((x) => x.id === id)
  if (!a && (loading || syncing)) return <BootScreen />
  if (!a)
    return (
      <div className="page-content">
        <div className="empty-state">
          <h3>{t('pickDetails.notFound')}</h3>
        </div>
      </div>
    )
  return (
    <div className="page-content">
      <section className="score-card">
        <BrainCircuit size={32} />
        <span className="eyebrow">{t('pickDetails.score')}</span>
        <strong>{t('common.percent', { value: a.matchScore })}</strong>
        <h2>{a.title}</h2>
        <p>{t('pickDetails.lead')}</p>
      </section>

      <section className="panel">
        <h3>{t('pickDetails.reasons')}</h3>
        <ul className="reason-list">
          {reasonLines(a).map((r) => (
            <li key={r}>
              <Check size={15} />
              {r}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h3>{t('pickDetails.signals')}</h3>
        <div className="weight-grid">
          {/* The weights this score was computed with, as shares of the
              total — the same numbers the sliders screen shows. */}
          {Object.entries(weightShares(weights)).map(([k, v]) => (
            <div key={k}>
              <span>{signalLabel(k)}</span>
              <strong>{t('common.percent', { value: v })}</strong>
            </div>
          ))}
        </div>
        <p className="helper-text">{t('pickDetails.note')}</p>
        <button className="secondary-button wide" onClick={() => navigate('/weights')}>
          {t('pickDetails.adjust')}
        </button>
      </section>
    </div>
  )
}
