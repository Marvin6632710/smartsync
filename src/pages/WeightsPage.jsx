import React from 'react'
import { RotateCcw, Sparkles } from 'lucide-react'
import BackButton from '../components/BackButton'
import { useApp } from '../context/AppContext'
import { recommendationWeights, signalLabels } from '../services/recommendationService'

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
  const { weights, setWeights, resetWeights, recommendations } = useApp()

  const total = SIGNALS.reduce((sum, key) => sum + (weights[key] ?? 0), 0)
  const isDefault = SIGNALS.every((key) => weights[key] === recommendationWeights[key])

  const set = (key, value) => setWeights((current) => ({ ...current, [key]: Number(value) }))

  return (
    <div className="page-content">
      <BackButton />
      <section className="headline-block">
        <span className="eyebrow">How matching works</span>
        <h2>Signal weights</h2>
        <p className="helper-text">
          Every activity is scored out of 100 against these six signals. Move a slider and the
          ranking below reorders immediately.
        </p>
      </section>

      <div className="form-card">
        {SIGNALS.map((key) => {
          const value = weights[key] ?? 0
          const share = total > 0 ? Math.round((value / total) * 100) : 0
          return (
            <label key={key} className="weight-row">
              <span className="weight-head">
                <strong>{signalLabels[key]}</strong>
                {/* The share matters more than the raw number: scores are
                    normalised by the total, so 20 out of 60 and 40 out of 120
                    rank identically. */}
                <span className="tiny-chip">{share}%</span>
              </span>
              <input
                type="range"
                min="0"
                max={MAX}
                value={value}
                onChange={(event) => set(key, event.target.value)}
                aria-label={signalLabels[key]}
              />
            </label>
          )
        })}

        {total === 0 && (
          <p className="form-error" role="alert">
            Every signal is at zero, so nothing can be ranked. Raise at least one.
          </p>
        )}

        <button className="secondary-button wide" onClick={resetWeights} disabled={isDefault}>
          <RotateCcw size={16} /> Reset to defaults
        </button>
      </div>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Live preview</span>
            <h2>Your top matches</h2>
          </div>
          <Sparkles size={18} />
        </div>
        <div className="stack list-stack">
          {recommendations.slice(0, 5).map((activity, index) => (
            <div className="weight-preview-row" key={activity.id}>
              <span className="rank">{index + 1}</span>
              <div>
                <strong>{activity.title}</strong>
                <p>{activity.category}</p>
              </div>
              <span className="match-pill">{activity.matchScore}%</span>
            </div>
          ))}
          {recommendations.length === 0 && (
            <div className="empty-state small">
              <p>No upcoming activities to rank yet.</p>
            </div>
          )}
        </div>
      </section>

      <p className="helper-text">
        These weights are stored on this device only and change what you see, not what anyone else
        sees. EVALUATION.md in the repository measures what each signal is worth.
      </p>
    </div>
  )
}
