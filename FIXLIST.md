# SmartSync — Fix List

Working checklist for the SP1 final defence (Wed 23 Sep 2026).
Work one item at a time, verify the app still runs, commit, then move on.

Four tiers now. **Quick / Medium / Large** are application work — UI, logic
and the recommendation engine. **Backend & operations (B)** and **Evaluation
& deliverables (D)** cover everything that is not code you write in `src/`,
which the original list had nowhere to track.

Phasing and dates live in [ROADMAP.md](ROADMAP.md). Why the architecture is
the way it is lives in [DECISIONS.md](DECISIONS.md).

## Status

**The tables below carry the per-item status — check there first.**
Summary: Quick (Q-01 … Q-15) and Medium (M-01 … M-11) are complete.
Large: L-01, L-04 and L-06 are done; L-02, L-03 and L-05 remain.

> **Scope change, 2026-09-09.** This list was written against a prototype.
> The project is now a real multi-user application on Firebase — accounts,
> a shared database, live chat, real maps and GPS. Several items were
> resolved by that migration rather than as standalone fixes; those say so.
> See the "Backend migration" section below, and README.md for how to run it.

The list below is a changelog of _what_ each fix actually changed, not a
second status list — it exists so you can see the shape of a fix without
digging through git.

- Q-01 DONE — crash guards in recommendationService.js
- Q-02 DONE — unguarded .slice() in MessagesPage / NotificationsPage
- Q-03 DONE — ErrorBoundary wired into main.jsx, wrapping BrowserRouter
- Q-04 DONE — hosts get Cancel activity instead of Leave
- Q-05 DONE — Edit Profile enforces the same 3-interest minimum as onboarding
- Q-06 DONE — capacity floored at current participants, both in the form and updateActivity
- Q-07 DONE — timeBand added to EditActivityPage
- Q-08 DONE — SCHEMA_VERSION added to storage.js; mismatch wipes and re-seeds
- Q-09 DONE — whole project formatted with Prettier (own commit)
- Q-10 DONE — ChatPage auto-scrolls to newest message
- Q-11 DONE — Mark all read added to Notifications
- Q-12 DONE — Share/Privacy icons wired up; dead promo card removed
- Q-13 DONE — onKeyDown added to the 3 role="button" divs
- Q-14 DONE — notifications capped at 50 via shared pushNotification helper
- Q-15 DONE — role="switch" + aria-checked added to all 8 toggle rows
- M-10 DONE — one colour system; inline `<style>` blocks removed from
  MapPage / UserMatchingPage / RecommendationsPage, all colour now from tokens
- M-11 DONE — empty state when filters match nothing, with a one-tap
  Clear filters recovery; filter defaults now defined once in AppContext
- M-01 DONE — joining records the activity category in historyCategories,
  so the 15% history signal finally learns (verified: 49% -> 57% on join)
- M-02 DONE — Jaccard index for interests and history against named
  compatibilityWeights (70/15/15); the arbitrary floors are gone
- M-03 DONE — the notification preference is honoured. **Regressed during the
  Firebase migration and re-fixed on 2026-09-09 with a different design.**
  Notifications are now written into the *recipient's* inbox by the *sender*,
  so a preference living in the recipient's private profile had nowhere to
  run — nobody but its owner could read it. `notificationsEnabled` therefore
  sits on the public profile, is checked by the sender, and is enforced by the
  security rules, so "off" means the notification is never written rather than
  merely hidden. Toasts stay ungated as immediate feedback for your own action.
- M-04 DONE — notifications store createdAt and render relative ages that
  update each minute; SCHEMA_VERSION bumped to 2 for the shape change
- M-05 DONE — Search, Map and AI Picks now read filteredActivities, each with
  a shared FiltersEmptyState offering a one-tap Clear filters
- M-06 DONE — distance field on create and edit; updateActivity coerces it to
  a number (verified 9.5km -> 74%, 0.5km -> 88%)
- M-07 DONE — similarUsersJoined derived from Jaccard compatibility over the
  peers who joined, threshold 50; hand-typed booleans removed from mockData
- M-08 DONE — window.confirm replaced with an in-app ConfirmDialog
  (Escape/backdrop/cancel dismiss, focus trap and restore)

- M-09 DONE — Messages and Notifications chips filter for real. Chips that
  nothing could back ("Unread", with no per-thread read state) were dropped
  rather than left as controls that could never tell the truth.
- L-01 DONE — location permission is the browser's own prompt, and the
  position is really stored. "Approximate location" rounds to ~1 km _before_
  storing, so the precise fix never leaves the device.
- L-04 DONE — 41 tests over the recommendation service, including fuzzing.
- L-06 DONE — README rewritten against the real application.

Remaining: L-02 (tunable weights panel), L-03 (chat expiry — the timestamp
half is done, retention is not), L-05 (evaluation against baselines).

---

## Backend migration

The prototype had no server, no accounts and no shared data. It now has all
three. Details in README.md; the parts worth knowing here:

- **Firebase Auth + Cloud Firestore**, with the full emulator suite so the
  backend runs locally with no Firebase account, credentials or billing.
- **firestore.rules** enforces every constraint the UI implies, and **61
  tests attack those rules as a hostile client**. Two real holes were found
  and fixed by redesign:
  - Membership was a subcollection plus a counter. Rules evaluate each write
    independently and cannot see sibling writes in a batch, so "increment
    because I joined" and "increment because I felt like it" were
    indistinguishable — anyone could fill any activity and lock others out.
    Membership is now one array on the activity document, which makes each
    change atomically checkable.
  - Hard-deleting an activity stranded its messages as unreachable orphans
    and erased the chat history of everyone who joined. Hosts cancel now.
- **Real distance.** Computed from the device's GPS position to the
  activity's coordinate. Distance was previously typed into a form by the
  host, which is not a property of an activity at all — it differs for
  everyone looking at it. This supersedes M-06.
- **Real dates**, so they sort and compare. Time band is derived from the
  start time rather than being a second field that could contradict it.
- **Anonymous mode is enforced, not cosmetic.** The name leaves the public
  profile document; it is not merely hidden at render time.
- **Three bugs found only by walking through the app**: sign-in bounced
  established users back into onboarding (the private profile arrives after
  the public one, and the redirect used `replace`); every chat thread was
  stuck on "No messages yet" (subscribe and unsubscribe were split across two
  effects sharing a ref, which StrictMode tore down without rebuilding); and
  every new account was named "New user" (the auth observer built the profile
  before `updateProfile` had set the display name).

### Also done, not on the original list

- **react-router-dom v6 → v7** — fixes 2 moderate CVEs (open redirect via
  backslash in Link/useNavigate; constructor injection in SSR hydration).
  `npm audit` now reports 0 vulnerabilities.
- **ESLint + Prettier tooling** — `npm run lint`, `format`, `format:check`;
  `eslint.config.js` with react + react-hooks rules. Project is lint-clean.
- **Visual design rebuilt onto one token system** — neutral palette with a
  single indigo accent, semantic + per-category colours, 4-step radius and
  7-step type scales. Emoji replaced with lucide icons throughout (map markers,
  toasts) via a shared `CategoryIcon`. Map redrawn as a legible schematic.
  ~200 lines of dead CSS removed.
- **Responsive frame** — holds real phone proportions (~1:2.14) on desktop and
  tablet, fills the screen on phones, and handles landscape phones and short
  windows (which previously pushed the bottom nav off screen and made onboarding
  unfinishable). `100dvh` so mobile browser chrome doesn't hide the nav.

---

## Quick — under 20 min each

Q-01 to Q-03 predate this table (see the changelog above); they are done too.
All Quick items are complete.

| #    | Status   | Fix                                                                                                                                                    | Time   |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Q-04 | **DONE** | **Host can leave own activity** — orphans it; your name stays as host. Hide Leave when `createdBy === 'me'`; offer Cancel/Delete instead.              | 10 min |
| Q-05 | **DONE** | **Edit Profile lets you remove every interest** — onboarding demands 3, the editor allows 0. Wrecks scoring. Add the same minimum.                     | 10 min |
| Q-06 | **DONE** | **Capacity can drop below participants** — edit an 8-person activity to capacity 2 and it reads "Full" at 8/2. Floor capacity at current participants. | 10 min |
| Q-07 | **DONE** | **`timeBand` not editable** — missing from EditActivityPage, though it's 15% of the score.                                                             | 15 min |
| Q-08 | **DONE** | **Storage versioning** — changes to mockData.js are invisible to anyone with old localStorage. Add SCHEMA_VERSION; discard and re-seed on mismatch.    | 15 min |
| Q-09 | **DONE** | **Prettier across the project** — 8 files are single-line, 3 are hugely spread out. Do in its own commit, before other logic changes.                  | 15 min |
| Q-10 | **DONE** | **Chat doesn't scroll to newest message** — add ref + scrollIntoView in ChatPage.                                                                      | 15 min |
| Q-11 | **DONE** | **Mark-all-read missing** — bell badge only clears by opening every item.                                                                              | 15 min |
| Q-12 | **DONE** | **Dead Profile controls** — promo card + 2 icon buttons with no handlers. Wire or delete.                                                              | 10 min |
| Q-13 | **DONE** | **No keyboard handlers** — 3 `role="button"` divs, zero onKeyDown in the project.                                                                      | 15 min |
| Q-14 | **DONE** | **Notification list grows forever** — never trimmed.                                                                                                   | 15 min |
| Q-15 | **DONE** | **Switches have no ARIA** — 6 toggles, none with role="switch" or aria-checked.                                                                        | 15 min |

## Medium — 30–90 min each

| #    | Status   | Fix                                                                                                                                                             | Time   |
| ---- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| M-01 | **DONE** | **Close the learning loop** — joining never updates `historyCategories`, which drives 15% of the score. Push category on join.                                  | 30 min |
| M-02 | **DONE** | **Jaccard similarity** — replace magic numbers (`shared.length * 22`, caps at 70/98) in `calculateUserCompatibility`.                                           | 30 min |
| M-03 | **DONE** | **Enforce `privacy.notifications`** — saved, never read. Gate every setNotifications push.                                                                      | 30 min |
| M-04 | **DONE** | **Static timestamps** — notifications say "Now" forever.                                                                                                        | 45 min |
| M-05 | **DONE** | **Filters only affect one section of one page** — wire `filteredActivities` into Search, Map, AI Picks.                                                         | 45 min |
| M-06 | **DONE** | **Distance field on create** — every created activity is hardcoded 1.5 km, and 20% of the score is distance.                                                    | 45 min |
| M-07 | **DONE** | **Compute `similarUsersJoined`** — currently a hand-typed boolean; the collaborative signal is fake. Derive from calculateUserCompatibility over joinedUserIds. | 60 min |
| M-08 | **DONE** | **Replace `window.confirm`** — native dialog breaks the phone illusion.                                                                                         | 60 min |
| M-09 | **DONE** | **Wire Messages/Notifications filter chips** — currently inert spans.                                                                                           | 60 min |
| M-10 | **DONE** | **Consolidate the two colour systems** — styles.css vars vs hardcoded hex in MapPage / UserMatchingPage / RecommendationsPage.                                  | 90 min |
| M-11 | **DONE** | **Empty state when filters match nothing**                                                                                                                      | 20 min |

## Large — 2+ hrs each

| #    | Status   | Fix                                                                                                                                                    | Time  |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| L-01 | **DONE** | **Enforce location permission + approximate location** — real browser permission prompt; approximate rounds to ~1 km before storing.                   | 2 hrs |
| L-02 | todo     | **Tunable weights panel** — makes the algorithm inspectable and demoable.                                                                              | 2 hrs |
| L-03 | partial  | **Timestamps + chat expiry** — timestamps are real server timestamps; retention/expiry is not implemented, and the Privacy page no longer promises it. | 3 hrs |
| L-04 | **DONE** | **Tests over the recommendation service** — 41 tests including a fuzzer, which found a real crash on non-string category data.                         | 3 hrs |
| L-05 | todo     | **Evaluation vs random and interest-only baselines** — the answer to "how do you know it works".                                                       | 4 hrs |
| L-06 | **DONE** | **README rewrite to match reality** — now documents the real architecture, the data and security models, and how to run it.                            | 1 hr  |

## Backend & operations

**Deployed 2026-09-09 — live at <https://smartsync-c1f07.web.app>**
(Firebase project `smartsync-c1f07`, Firestore Standard in `asia-southeast1`.)
Verified in production: sign-up, onboarding, activity creation with real
coordinates, and that unauthenticated reads and writes are refused by the
security rules.

Not application code. Several of these can only be done by a human with a
Google account — marked **you**. B-01 to B-03 block everything else: deploy
on day one while a broken deployment is cheap to fix.

| #    | Status | Task                                                                                                                                                                                                                 | Owner   |
| ---- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| B-01 | **DONE** | **Create the Firebase project** — enable Email/Password auth, create Firestore in `asia-southeast1`. README §3.                                                                                                      | **you** |
| B-02 | **DONE** | **Publish security rules to production** — `npm run deploy:rules`. Rules behave differently against a real project than an emulator; verify before trusting them.                                                    | **you** |
| B-03 | **DONE** | **First production deploy** — `npm run deploy`, confirm the live URL loads and sign-up works.                                                                                                                        | **you** |
| B-04 | todo   | **Real-device verification** — iPhone Safari and one Android. `100dvh`, date/time inputs, the geolocation prompt and the keyboard covering inputs all differ from Chromium. Largest untested surface in the project. | **you** |
| B-05 | todo   | **Seed a realistic production dataset** — 15–20 activities across all categories over the coming fortnight, at real Bangkok locations. Three activities looks like a prototype however good the code is.             |         |
| B-06 | todo   | **Network failure states** — Firestore queues writes offline; confirm the UI reads as deliberate rather than broken, and that nothing spins forever.                                                                 |         |
| B-07 | todo   | **Quota sanity check** — Spark plan allows 50k reads/day. Confirm a demo session is nowhere near it, and don't leave tabs holding listeners open overnight.                                                          |         |
| B-08 | todo   | **Data export** — `firebase firestore:export` before the defence, so a bad write is recoverable.                                                                                                                     |         |
| B-09 | todo   | **Accessibility sweep** — keyboard-only run through the main flow plus a contrast check. Cheap, and often explicitly on the rubric.                                                                                  |         |

## Evaluation & deliverables

The written and demonstrated work. D-01 is the highest-value remaining item
in the entire project.

| #    | Status | Task                                                                                                                                                                                                                                                            | Time   |
| ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| D-01 | todo   | **Algorithm evaluation → `EVALUATION.md`** (same as L-05). Synthetic population with known preferences; compare random vs interest-only vs the full weighted model on precision@5 and MRR; add a per-signal ablation. The answer to "how do you know it works". | 4 hrs  |
| D-02 | todo   | **Written demo script, rehearsed three times, timed.** Which account, which activity, which two windows, in what order. Improvising the click path is the most common way a good project demos badly.                                                           | 2 hrs  |
| D-03 | todo   | **Recorded backup demo video** — so a wifi failure at the venue does not become a failed defence.                                                                                                                                                               | 1 hr   |
| D-04 | todo   | **Report and slides** to the department template. Check the brief for required artefacts (SRS, UML, test matrix) — most can be pulled straight out of this repo.                                                                                                | —      |
| D-05 | todo   | **Read `DECISIONS.md` before walking in.** It is written against the questions a panel actually asks.                                                                                                                                                           | 30 min |

---

## Notes for the defence

- The recommendation engine is where the marks are, and every signal now runs
  on real data: real distance from GPS, history that updates when you join,
  and a collaborative signal derived from actual compatibility. L-05
  (evaluation against random and interest-only baselines) is the strongest
  remaining item — it is the answer to "how do you know it works".
- Privacy is the stated differentiator and the controls are now real. Be
  ready to explain _why_ the public/private split exists: Firestore has no
  field-level read rules, so separate documents are the only way to make it
  enforceable rather than cosmetic.
- Score floor is ~40% because every signal has a non-zero fallback. Be ready
  to justify the fallbacks as priors, or lower them.
- The security rules are worth demoing. `npm test` runs 61 tests that behave
  like a hostile client; two of them describe holes that existed and were
  closed by redesign, which is a better story than "we wrote rules".
- Known limitations are a strength if disclosed first, a weakness if
  discovered. README.md ends with an honest list.
