import React from 'react'
import { BrainCircuit, Check } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import BootScreen from '../components/BootScreen'
import { useApp } from '../context/AppContext'
import { weightShares } from '../services/recommendationService'

export default function RecommendationDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activities, recommendations, weights, loading, syncing } = useApp()
  // Every activity is scored, not only the ones still being suggested: the
  // details page offers "More" on things you joined that have since
  // happened, been cancelled, or whose host you blocked, and those live in
  // `activities`. Reading only `recommendations` sent each of them here to
  // a dead end.
  const a = activities.find((x) => x.id === id) || recommendations.find((x) => x.id === id)
  if (!a && (loading || syncing)) return <BootScreen label="Loading…" />
  if (!a)
    return (
      <div className="page-content">
        <div className="empty-state">
          <h3>Recommendation not found</h3>
        </div>
      </div>
    )
  return (
    <div className="page-content">
      <section className="score-card">
        <BrainCircuit size={32} />
        <span className="eyebrow">Score</span>
        <strong>{a.matchScore}%</strong>
        <h2>{a.title}</h2>
        <p>How well this matches your profile.</p>
      </section>

      <section className="panel">
        <h3>Reasons</h3>
        <ul className="reason-list">
          {(a.reasons || []).map((r) => (
            <li key={r}>
              <Check size={15} />
              {r}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h3>Signals</h3>
        <div className="weight-grid">
          {/* The weights this score was computed with, as shares of the
              total — the same numbers the sliders screen shows. */}
          {Object.entries(weightShares(weights)).map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <strong>{v}%</strong>
            </div>
          ))}
        </div>
        <p className="helper-text">Every activity is scored against these six signals.</p>
        <button className="secondary-button wide" onClick={() => navigate('/weights')}>
          Adjust these weights
        </button>
      </section>
    </div>
  )
}
