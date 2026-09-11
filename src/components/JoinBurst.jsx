import React, { useEffect, useMemo, useState } from 'react'

const SHARDS = 12

function makeShards() {
  return Array.from({ length: SHARDS }, (_, i) => {
    const angle = (i / SHARDS) * Math.PI * 2 + Math.random() * 0.4
    const distance = 70 + Math.random() * 70
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance - 20,
      rotate: Math.random() * 320 - 160,
      delay: Math.random() * 70,
      size: 7 + Math.random() * 7,
    }
  })
}

/**
 * The half second after you join something.
 *
 * Joining is the only moment in this app where a person has committed to being
 * somewhere, with strangers, at a time. Everything before it is browsing. It
 * was marked by the same small toast as "couldn't save changes" — which is to
 * say it was not marked at all.
 *
 * Twelve shards thrown from the middle of the screen in the activity's own
 * colour, gone inside a second. Not confetti raining down the page: that
 * belongs to something you won, and this is something you agreed to.
 *
 * Plain divs on transforms, so it composites on the GPU and never touches
 * layout. Nothing for a screen reader — the toast beside it already says what
 * happened — and nothing at all for anyone who asked for less motion.
 */
export default function JoinBurst({ token, color }) {
  // Reset during render rather than in an effect: this is state derived from a
  // prop changing, which is React's own recommendation for exactly this, and
  // it avoids the extra render an effect would cost.
  //
  // `seen` starts at null, NOT at `token`. Seeding it with the current token
  // meant the very first render saw no change and never fired — and since the
  // parent only mounts this component at the moment of a celebration, the
  // first render is the only one that matters. The burst was dead code that
  // looked correct. A DOM observer during a real join is what caught it;
  // nothing about the source reads as wrong.
  const [seen, setSeen] = useState(null)
  const [live, setLive] = useState(false)
  if (token !== seen) {
    setSeen(token)
    setLive(Boolean(token))
  }

  useEffect(() => {
    if (!live) return undefined
    const timer = window.setTimeout(() => setLive(false), 1000)
    return () => window.clearTimeout(timer)
  }, [live])

  const reduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const shards = useMemo(() => (live && !reduced ? makeShards() : null), [live, reduced])

  if (!shards) return null

  return (
    <div className="join-burst" aria-hidden="true">
      {shards.map((s) => (
        <span
          key={s.id}
          style={{
            '--x': `${s.x}px`,
            '--y': `${s.y}px`,
            '--r': `${s.rotate}deg`,
            '--d': `${s.delay}ms`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            background: color || 'var(--accent)',
          }}
        />
      ))}
    </div>
  )
}
