# SmartSync — development roadmap

Target: SP1 final defence, **Wednesday 23 September 2026**. Written
2026-09-09, so roughly two weeks.

The system is functionally complete and runs end to end today. What remains
is: getting it live, producing the evidence that it works, and being ready to
defend it. Those are three different jobs and only the first is code.

---

## The one thing that blocks everything

**Deploy on day one, before anything else.** Not when it's finished — now,
while it's boring to fix.

Every failure mode of a deployment is a surprise: a region you can't change
later, an auth provider you forgot to enable, rules that behave differently
against a real project, a domain that takes a day to propagate. Finding those
on day 1 costs an hour. Finding them the night before the defence costs the
defence.

The steps are in README section 3. They need a human with a Google account,
so they cannot be automated. Budget one hour.

Once it is live, redeploy after every meaningful change. `npm run deploy`.

---

## Phases

### Phase 0 — Go live · Days 0–1 (Wed 9 – Thu 10 Sep)

| #   | Task                                                                                      | Who     |
| --- | ----------------------------------------------------------------------------------------- | ------- |
| 0.1 | Create the Firebase project; enable Email/Password; create Firestore in `asia-southeast1` | **You** |
| 0.2 | Fill `.env.local`, `firebase use --add`, `npm run deploy:rules`                           | **You** |
| 0.3 | `npm run deploy`, confirm the live URL works                                              | **You** |
| 0.4 | Create 2–3 real accounts on the live site and check they see each other                   | **You** |
| 0.5 | Open the live URL on your actual iPhone, in Safari                                        | **You** |

**Done when:** two phones, on mobile data, can see each other's activities.

> 0.5 matters more than it looks. Everything so far is verified on Chromium
> only. Safari differs on `100dvh`, date and time inputs, and geolocation
> prompts. This is the single largest untested surface in the project.

---

### Phase 1 — The graded core · Days 2–7 (Fri 11 – Wed 16 Sep)

This is where the marks are. A working app is the _baseline_; what
distinguishes a senior project is evidence that its central idea works and
the ability to reason about it.

**1.1 — Algorithm evaluation (FIXLIST L-05) — the single highest-value item.**
Right now the honest answer to "how do you know your recommendations are any
good?" is "we don't, we just built them." Fix that:

- Generate a synthetic population (say 200 users, 100 activities) with known
  ground-truth preferences.
- Score three rankers: **random**, **interest-only**, and **SmartSync's full
  weighted model**.
- Measure precision@5 and mean reciprocal rank against the ground truth.
- Report the numbers, including where the model _loses_.

An ablation — rerun with each signal's weight zeroed — tells you which of the
six signals is actually earning its 35 or its 5. If one contributes nothing,
saying so is a stronger result than pretending all six matter.

Write the results into `EVALUATION.md`. Two or three tables and honest prose.

**1.2 — Tunable weights panel (L-02).** A settings screen with six sliders
that rewrite `recommendationWeights` live, with the ranking updating
underneath. This is a two-hour build that turns an invisible algorithm into
something a panel can _watch respond_. It also makes the ablation
demonstrable live rather than only in a table.

**1.3 — Seed a realistic dataset on the live project.** Fifteen to twenty
activities across all categories, spread over the next fortnight, at real
Bangkok locations. An app demoed with three activities looks like a
prototype no matter how good the engineering is.

---

### Phase 2 — Robustness · Days 8–11 (Thu 17 – Sun 20 Sep)

Assume the panel will click the wrong thing on purpose.

- **Real-device pass.** iPhone Safari and one Android. Geolocation prompt,
  date/time pickers, keyboard covering inputs, landscape, and what happens
  with location denied.
- **Network failure states.** Turn wifi off mid-session. Firestore queues
  writes offline, which mostly works — verify it _looks_ deliberate rather
  than broken, and that nothing shows a spinner forever.
- **Empty and hostile states.** A brand-new account with zero activities
  nearby. An activity at capacity. Someone opening a chat for an activity
  they left.
- **Chat retention (L-03).** The Privacy page used to promise expiry and no
  longer does. Either implement a retention rule or state the position
  plainly — do not leave it ambiguous, because a panel will ask.
- **Accessibility sweep.** Keyboard-only navigation through the main flow,
  and a contrast check. Cheap to do, easy marks, and frequently on rubrics.

---

### Phase 3 — Defence preparation · Days 12–14 (Mon 21 – Wed 23 Sep)

Code freeze at the start of this phase. Nothing new goes in; only crash fixes.

- **A written demo script**, timed. Which account, which activity, which two
  browser windows, in what order. Rehearse it three times. The single most
  common way a good project demos badly is improvising the click path.
- **The multi-user moment.** Two windows side by side: join in one, watch the
  count and the notification appear in the other. That is the whole thesis of
  the project in ten seconds — build the demo around it.
- **A recorded backup video** of the full demo. If the venue's wifi fails,
  you present anyway.
- **Prepare for the questions you know are coming.** `DECISIONS.md` is
  written for exactly this; read it before you walk in:
  - Why Firebase and not your own backend? (ADR-001 — and own the trade-off)
  - How do you stop someone joining an activity 50 times? (ADR-003 — you
    found and fixed a real hole here, which is a better story than never
    having had one)
  - Is anonymous mode real or just hidden? (ADR-005)
  - How do you know the recommendations work? (Phase 1.1)
  - What doesn't it do? (README section 10 — say it first, unprompted)
- **Report and slides** to your university's template. I don't know your
  department's specific requirements — check the brief for required
  artefacts, since some programmes want an SRS, UML diagrams, or a test
  matrix that are worth pulling directly out of this repo.

---

## What is deliberately not being built

Saying no is part of the plan. Each of these was considered and cut:

| Not doing                  | Why                                                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Push notifications (FCM)   | Needs a service worker, a VAPID key, and has no emulator, so it can only be developed against production. High risk, low marginal marks — in-app notifications already demonstrate the concept. |
| Photo uploads              | Firebase Storage plus image resizing plus moderation questions. Generated initials look deliberate.                                                                                             |
| Address search / geocoding | Nominatim would work, but tapping a map already produces a real coordinate. Nice-to-have, not a gap.                                                                                            |
| Social sign-in             | More auth providers, same demonstrated capability.                                                                                                                                              |
| A custom backend           | See ADR-001. Rewriting the data layer now would risk everything for breadth that is better _argued_ than half-built.                                                                            |

If Phase 1 finishes early, geocoding is the best of these to pick up. Do not
start push notifications after day 9.

---

## Risks

| Risk                                                  | Mitigation                                                                                                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Safari behaves differently and it is found late       | Phase 0.5 — test on the real phone on day 1, not day 13                                                                                                     |
| Demo venue wifi fails                                 | Recorded backup video; emulators run fully offline as a fallback                                                                                            |
| Firestore free-tier quota trips mid-demo              | Spark limits are 50k reads/day; a demo uses a tiny fraction, but avoid leaving many tabs open on listeners overnight                                        |
| Evaluation shows the model barely beats interest-only | This is a _finding_, not a failure. Report it, explain why, and propose what would fix it. Panels reward honesty far more than a suspiciously perfect graph |
| Scope creep in the last week                          | Code freeze at day 12, no exceptions                                                                                                                        |

---

## Tracking

- **`FIXLIST.md`** — the task backlog, now covering backend and operations,
  not just UI.
- **`DECISIONS.md`** — why the architecture is the way it is. Read before the
  defence.
- **`EVALUATION.md`** — to be written in Phase 1.1. Results, not plans.
- **`README.md`** — how to run, deploy, and what it does not do.
