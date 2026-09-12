import React from 'react'
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

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
const STEPS = [
  {
    title: 'Pick what you like',
    body: 'Football, coffee, study, gaming — whatever you would actually turn up for.',
  },
  {
    title: 'See what is on near you',
    body: 'Real activities with real times and places, as a list or on a map.',
  },
  {
    title: 'Join, and go',
    body: 'One tap to join, then chat with everyone going before you turn up.',
  },
]

export default function SplashPage() {
  const navigate = useNavigate()
  return (
    <div className="standalone-page splash-page premium-entry">
      <div className="brand-orb">
        <Sparkles size={38} />
      </div>

      <div className="entry-copy">
        <span className="eyebrow">SmartSync</span>
        <h1>Meet people by doing things.</h1>
        <p>Activities happening near you in Bangkok — and who is going to them.</p>
      </div>

      {/* Numbered because it genuinely is a sequence: you cannot see what is
          on until you have said what you like. */}
      <ol className="splash-steps">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <span className="splash-step-number" aria-hidden="true">
              {index + 1}
            </span>
            <span className="splash-step-copy">
              <strong>{step.title}</strong>
              <small>{step.body}</small>
            </span>
          </li>
        ))}
      </ol>

      {/* Every claim here is something the app actually does — reporting and
          blocking are real, moderators really do review, and approximate
          location really does round to about a kilometre before storing. */}
      <p className="splash-trust">
        <ShieldCheck size={15} aria-hidden="true" />
        <span>
          Free to use. Block or report anyone, and a moderator reviews every report. You can share
          your location rounded to the nearest kilometre — or not at all.
        </span>
      </p>

      <div className="splash-actions">
        <button className="primary-button wide" onClick={() => navigate('/signup')}>
          Create account <ArrowRight size={17} />
        </button>
        <button className="text-button" onClick={() => navigate('/signin')}>
          I already have an account
        </button>
      </div>
    </div>
  )
}
