import React from 'react'
import { BrainCircuit, Check } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { useApp } from '../context/AppContext'
import { recommendationWeights } from '../services/recommendationService'

export default function RecommendationDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { recommendations } = useApp()
  const a = recommendations.find((x) => x.id === id)
  if (!a)
    return (
      <div className="page-content">
        <BackButton />
        <div className="empty-state">
          <h3>Recommendation not found</h3>
        </div>
      </div>
    )
  return (
    <div className="page-content">
      <BackButton />
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
          {Object.entries(recommendationWeights).map(([k, v]) => (
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
