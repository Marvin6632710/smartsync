/**
 * Does SmartSync's ranking actually work?
 *
 * "We built a weighted scorer" is a description, not evidence. This measures
 * the ranking against baselines on a synthetic population whose true
 * preferences are known, and then removes each signal in turn to see what it
 * was contributing.
 *
 *   npm run evaluate
 *
 * ── How the ground truth avoids being circular ────────────────────────────
 *
 * The obvious trap is to define "relevant" using the same function being
 * tested, which guarantees a perfect score and proves nothing. Three things
 * keep this honest:
 *
 *   1. Ground truth is computed from CONTINUOUS latent traits (an affinity in
 *      [0,1] for every one of the twelve categories, a home coordinate, a
 *      distance tolerance). The ranker never sees these. It sees the profile
 *      the real app stores: a list of three interest strings, one preferred
 *      time band, and a history list. That is a deliberately lossy view.
 *
 *   2. Every simulated person weighs the factors DIFFERENTLY. One will travel
 *      an hour for the right activity; another will not cross the road. There
 *      is no single correct weighting to tune towards, so a fixed set of
 *      weights cannot be right for everyone by construction.
 *
 *   3. Noise, and imperfect self-report. People list interests they rarely
 *      act on and omit ones they do; a quarter never set a preferred time;
 *      a third refuse location entirely.
 *
 * What this does NOT test: whether interest, distance, time, history,
 * popularity and similarity are the right six signals in the first place.
 * The generator assumes they matter, so the experiment measures whether the
 * model combines and weights them well — not whether the choice of signals
 * is correct. Establishing that needs real users, which a synthetic study
 * cannot substitute for. Said plainly here so nobody has to discover it.
 */
import { rankActivities, recommendationWeights } from '../src/services/recommendationService.js'
import { distanceBetween } from '../src/utils/geo.js'

// ── deterministic randomness ────────────────────────────────────────────────
// Seeded so the reported numbers can be reproduced exactly, rather than
// being whatever the run happened to produce.
function mulberry32(a) {
  return function rng() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Overridable so a result can be checked against several populations rather
// than trusted from one. A half-point difference on a single seed is noise
// until it survives a few.
const SEED = Number(process.env.EVAL_SEED) || 20260909
const QUICK = process.env.EVAL_QUICK === '1'
const N_USERS = 400
const N_ACTIVITIES = 200
const CATEGORIES = [
  'Football',
  'Basketball',
  'Running',
  'Gym',
  'Study',
  'Coffee',
  'Gaming',
  'Hangouts',
  'Cycling',
  'Movies',
  'Food',
  'Events',
]
const BANDS = ['Morning', 'Afternoon', 'Evening']
// Bangkok-ish box, so distances land in a realistic range.
const CITY = { lat: 13.7563, lng: 100.5018, spread: 0.18 }

const rng = mulberry32(SEED)
const pick = (list) => list[Math.floor(rng() * list.length)]
const gauss = () => {
  const u = 1 - rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}

// ── the world ───────────────────────────────────────────────────────────────

function makePerson(id) {
  // A few categories the person genuinely likes, the rest near zero.
  const affinity = {}
  CATEGORIES.forEach((c) => {
    affinity[c] = rng() < 0.25 ? 0.55 + rng() * 0.45 : rng() * 0.3
  })
  const home = {
    lat: CITY.lat + (rng() - 0.5) * CITY.spread,
    lng: CITY.lng + (rng() - 0.5) * CITY.spread,
  }
  const latent = {
    id,
    affinity,
    home,
    band: pick(BANDS),
    bandStrength: rng(), // how much the time band actually matters to them
    tolerance: 1 + rng() * 9, // km at which appeal has decayed appreciably
    crowdLove: rng(), // some people want a full room, some an empty one
    // Per-person weighting of the factors. No single fixed weighting can be
    // correct for everybody, which is the point.
    w: {
      interest: 0.3 + rng() * 0.5,
      distance: 0.1 + rng() * 0.4,
      time: rng() * 0.3,
      crowd: rng() * 0.2,
    },
  }

  // The lossy, self-reported profile the app actually stores.
  const ranked = [...CATEGORIES].sort((a, b) => affinity[b] - affinity[a])
  const interests = ranked.slice(0, 3).filter(() => rng() > 0.2) // people omit things
  if (rng() < 0.25) interests.push(pick(CATEGORIES)) // and list things they rarely do
  const history = ranked.slice(0, 4).filter(() => rng() > 0.45)

  return {
    latent,
    profile: {
      uid: id,
      interests: [...new Set(interests)],
      preferredTime: rng() < 0.75 ? latent.band : '', // a quarter never set one
      historyCategories: [...new Set(history)],
      location: rng() < 0.67 ? home : null, // a third deny location
    },
  }
}

function makeActivity(id) {
  return {
    id,
    category: pick(CATEGORIES),
    tags: [],
    timeBand: pick(BANDS),
    lat: CITY.lat + (rng() - 0.5) * CITY.spread,
    lng: CITY.lng + (rng() - 0.5) * CITY.spread,
    capacity: 6 + Math.floor(rng() * 20),
    participants: 0,
    participantUids: [],
  }
}

/**
 * Who actually turns up.
 *
 * An earlier version of this harness assigned participants uniformly at
 * random, which quietly made two of the six signals untestable: with random
 * attendance there is no homophily for the collaborative signal to find, and
 * how full a room is carries no information about whether it is any good. The
 * ablation duly reported both as useless, which was a fact about the
 * simulation rather than about the model.
 *
 * People now attend the activities they would genuinely most want, so similar
 * people end up in the same rooms and popular activities are popular for a
 * reason — exactly the structure those signals claim to exploit.
 */
function assignAttendance(population, activities, utility) {
  for (const person of population) {
    const preferred = [...activities]
      .sort((a, b) => utility[person.latent.id][b.id] - utility[person.latent.id][a.id])
      .slice(0, 1 + Math.floor(rng() * 4))
    for (const activity of preferred) {
      if (activity.participantUids.length < activity.capacity) {
        activity.participantUids.push(person.profile.uid)
      }
    }
  }
  activities.forEach((a) => {
    a.participants = Math.max(1, a.participantUids.length)
  })
}

/** Hidden from every ranker: how much this person would really want to go. */
function trueUtility(latent, activity) {
  const km = distanceBetween(latent.home, { lat: activity.lat, lng: activity.lng }) ?? 8
  const interest = latent.affinity[activity.category]
  const near = Math.exp(-km / latent.tolerance)
  const time = activity.timeBand === latent.band ? latent.bandStrength : 0
  const fill = activity.participants / Math.max(activity.capacity, 1)
  const crowd = 1 - Math.abs(fill - latent.crowdLove)
  const w = latent.w
  return (
    w.interest * interest + w.distance * near + w.time * time + w.crowd * crowd + gauss() * 0.06
  )
}

// ── metrics ─────────────────────────────────────────────────────────────────

const precisionAtK = (ranked, relevant, k) =>
  ranked.slice(0, k).filter((id) => relevant.has(id)).length / k

const recallAtK = (ranked, relevant, k) =>
  relevant.size === 0
    ? 0
    : ranked.slice(0, k).filter((id) => relevant.has(id)).length / relevant.size

const reciprocalRank = (ranked, relevant) => {
  const i = ranked.findIndex((id) => relevant.has(id))
  return i === -1 ? 0 : 1 / (i + 1)
}

const ndcgAtK = (ranked, gains, k) => {
  const dcg = ranked
    .slice(0, k)
    .reduce((sum, id, i) => sum + (gains[id] || 0) / Math.log2(i + 2), 0)
  const ideal = Object.values(gains)
    .sort((a, b) => b - a)
    .slice(0, k)
    .reduce((sum, g, i) => sum + g / Math.log2(i + 2), 0)
  return ideal === 0 ? 0 : dcg / ideal
}

// ── rankers ─────────────────────────────────────────────────────────────────

const RELEVANT_TOP = 10 // an activity is "relevant" if it is in a person's true top 10 of 200

function evaluate(label, rankFn, population, activities, utility) {
  const scores = { p5: 0, p10: 0, r10: 0, mrr: 0, ndcg: 0 }
  for (const person of population) {
    const utilities = activities.map((a) => ({ id: a.id, u: utility[person.latent.id][a.id] }))
    const byTruth = [...utilities].sort((x, y) => y.u - x.u)
    const relevant = new Set(byTruth.slice(0, RELEVANT_TOP).map((x) => x.id))
    const gains = {}
    byTruth.forEach((x, i) => {
      gains[x.id] = i < RELEVANT_TOP ? RELEVANT_TOP - i : 0
    })

    const ranked = rankFn(person, activities)
    scores.p5 += precisionAtK(ranked, relevant, 5)
    scores.p10 += precisionAtK(ranked, relevant, 10)
    scores.r10 += recallAtK(ranked, relevant, 10)
    scores.mrr += reciprocalRank(ranked, relevant)
    scores.ndcg += ndcgAtK(ranked, gains, 10)
  }
  const n = population.length
  return {
    label,
    p5: scores.p5 / n,
    p10: scores.p10 / n,
    r10: scores.r10 / n,
    mrr: scores.mrr / n,
    ndcg: scores.ndcg / n,
  }
}

// Activities as the app would present them to this particular user: distance
// resolved from their own position, exactly as AppContext does.
function localise(person, activities) {
  const from = person.profile.location
  return activities.map((a) => ({
    ...a,
    distanceKm: from ? distanceBetween(from, { lat: a.lat, lng: a.lng }) : null,
  }))
}

function main() {
  const population = Array.from({ length: N_USERS }, (_, i) => makePerson(`u${i}`))
  const activities = Array.from({ length: N_ACTIVITIES }, (_, i) => makeActivity(`a${i}`))

  // One utility draw per person-activity pair, reused everywhere. Recomputing
  // it would redraw the noise, so attendance and the ground truth it is scored
  // against would silently describe two different worlds.
  const utility = {}
  for (const person of population) {
    utility[person.latent.id] = {}
    for (const activity of activities) {
      utility[person.latent.id][activity.id] = trueUtility(person.latent, activity)
    }
  }
  assignAttendance(population, activities, utility)

  const peers = population.map((p) => p.profile)

  const smartsync = (weights) => (person, acts) =>
    rankActivities(person.profile, localise(person, acts), peers, weights).map((a) => a.id)

  const baselines = [
    ['Random', (person, acts) => [...acts].map((a) => a.id).sort(() => rng() - 0.5)],
    [
      'Most popular first',
      (person, acts) =>
        [...acts]
          .sort((a, b) => b.participants / b.capacity - a.participants / a.capacity)
          .map((a) => a.id),
    ],
    [
      'Nearest first',
      (person, acts) => {
        const local = localise(person, acts)
        return [...local]
          .sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99))
          .map((a) => a.id)
      },
    ],
    [
      'Interest match only',
      (person, acts) => {
        const set = new Set(person.profile.interests.map((i) => i.toLowerCase()))
        return [...acts]
          .sort(
            (a, b) =>
              (set.has(b.category.toLowerCase()) ? 1 : 0) -
              (set.has(a.category.toLowerCase()) ? 1 : 0),
          )
          .map((a) => a.id)
      },
    ],
    ['SmartSync (full model)', smartsync(undefined)],
  ]

  const pct = (x) => (x * 100).toFixed(1).padStart(5)
  const row = (r) =>
    `| ${r.label.padEnd(24)} | ${pct(r.p5)}% | ${pct(r.p10)}% | ${pct(r.r10)}% | ${r.mrr.toFixed(3)} | ${r.ndcg.toFixed(3)} |`

  console.log(`\nSynthetic population: ${N_USERS} people, ${N_ACTIVITIES} activities, seed ${SEED}`)
  console.log(`"Relevant" = an activity in that person's true top ${RELEVANT_TOP}.\n`)
  console.log('| Ranker                   |  P@5   |  P@10  |  R@10  |  MRR  | NDCG@10 |')
  console.log('| ------------------------ | ------ | ------ | ------ | ----- | ------- |')
  const results = baselines.map(([label, fn]) =>
    evaluate(label, fn, population, activities, utility),
  )
  results.forEach((r) => console.log(row(r)))

  const full = results[results.length - 1]

  console.log('\n\nPer-signal ablation — each signal removed in turn (weight set to 0)\n')
  console.log('| Signal removed           |  P@5   | NDCG@10 | change in P@5 |')
  console.log('| ------------------------ | ------ | ------- | ------------- |')
  for (const signal of Object.keys(recommendationWeights)) {
    const ablated = evaluate(
      signal,
      smartsync({ ...recommendationWeights, [signal]: 0 }),
      population,
      activities,
      utility,
    )
    const delta = (ablated.p5 - full.p5) * 100
    const arrow = delta < -0.05 ? 'worse' : delta > 0.05 ? 'BETTER' : 'no change'
    console.log(
      `| ${signal.padEnd(24)} | ${pct(ablated.p5)}% | ${ablated.ndcg.toFixed(3)}   | ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pts (${arrow}) |`,
    )
  }
  if (QUICK) {
    console.log()
    return
  }

  // ── why the weak signals are weak ────────────────────────────────────────
  // "This signal does not help" is a result; "this signal cannot help, and
  // here is the reason" is a finding. Both are cheap to measure.
  let saturated = 0
  let historyRedundant = 0
  for (const person of population) {
    const ranked = rankActivities(person.profile, localise(person, activities), peers)
    saturated += ranked.filter((a) => a.similarUsersJoined).length / ranked.length
    const interests = new Set(person.profile.interests.map((i) => i.toLowerCase()))
    const history = person.profile.historyCategories.map((h) => h.toLowerCase())
    historyRedundant += history.length
      ? history.filter((h) => interests.has(h)).length / history.length
      : 0
  }
  console.log('\nDiagnostics\n')
  console.log(
    `  "similar users are going" is true for ${((saturated / population.length) * 100).toFixed(0)}% of activities`,
  )
  console.log(
    `  ${((historyRedundant / population.length) * 100).toFixed(0)}% of a person's history categories are already in their stated interests`,
  )

  // ── can the weights be tuned? ────────────────────────────────────────────
  // Searched on one half of the population and reported on the other, so the
  // improvement is not just the search memorising the people it tuned against.
  const half = Math.floor(population.length / 2)
  const tune = population.slice(0, half)
  const holdout = population.slice(half)
  const KEYS = Object.keys(recommendationWeights)

  let best = { weights: recommendationWeights, p5: 0 }
  for (let trial = 0; trial < 150; trial += 1) {
    const candidate = {}
    KEYS.forEach((k) => {
      candidate[k] = Math.round(rng() * 40)
    })
    if (Object.values(candidate).reduce((a, b) => a + b, 0) === 0) continue
    const r = evaluate('t', smartsync(candidate), tune, activities, utility)
    if (r.p5 > best.p5) best = { weights: candidate, p5: r.p5 }
  }

  const defaultOnHoldout = evaluate('default', smartsync(undefined), holdout, activities, utility)
  const tunedOnHoldout = evaluate('tuned', smartsync(best.weights), holdout, activities, utility)

  console.log('\n\nWeight tuning — searched on half the population, scored on the other half\n')
  console.log('| Weights                  |  P@5   | NDCG@10 |')
  console.log('| ------------------------ | ------ | ------- |')
  console.log(
    `| Shipped defaults         | ${pct(defaultOnHoldout.p5)}% | ${defaultOnHoldout.ndcg.toFixed(3)}   |`,
  )
  console.log(
    `| Best found by search     | ${pct(tunedOnHoldout.p5)}% | ${tunedOnHoldout.ndcg.toFixed(3)}   |`,
  )
  console.log(`\n  shipped : ${KEYS.map((k) => `${k} ${recommendationWeights[k]}`).join(', ')}`)
  console.log(`  tuned   : ${KEYS.map((k) => `${k} ${best.weights[k]}`).join(', ')}`)
  console.log()
}

main()
