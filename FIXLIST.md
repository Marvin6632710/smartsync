# SmartSync — Fix List

Working checklist for the SP1 final defence. ~2 weeks.
Work one item at a time, verify the app still runs, commit, then move on.

## Status

**The tables below carry the per-item status — check there first.**
Summary: the whole Quick tier (Q-01 … Q-15) is done, plus M-01, M-02,
M-03, M-04, M-10 and M-11. Everything else is unstarted.

The list below is a changelog of *what* each fix actually changed, not a
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
- M-03 DONE — privacy.notifications is now read, gating pushNotification;
  toasts stay ungated as immediate feedback
- M-04 DONE — notifications store createdAt and render relative ages that
  update each minute; SCHEMA_VERSION bumped to 2 for the shape change

Remaining work, re-verified 2026-09-11: distance is still hardcoded to
1.5 km on create (M-06), the Messages/Notifications filter chips are still
inert spans (M-09), `filteredActivities` is still only wired into HomePage
(M-05), `window.confirm` still appears in 2 places (M-08), and
`similarUsersJoined` is still hand-typed in mockData (M-07). All of Large
is unstarted.

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

| # | Status | Fix | Time |
|---|---|---|---|
| Q-04 | **DONE** | **Host can leave own activity** — orphans it; your name stays as host. Hide Leave when `createdBy === 'me'`; offer Cancel/Delete instead. | 10 min |
| Q-05 | **DONE** | **Edit Profile lets you remove every interest** — onboarding demands 3, the editor allows 0. Wrecks scoring. Add the same minimum. | 10 min |
| Q-06 | **DONE** | **Capacity can drop below participants** — edit an 8-person activity to capacity 2 and it reads "Full" at 8/2. Floor capacity at current participants. | 10 min |
| Q-07 | **DONE** | **`timeBand` not editable** — missing from EditActivityPage, though it's 15% of the score. | 15 min |
| Q-08 | **DONE** | **Storage versioning** — changes to mockData.js are invisible to anyone with old localStorage. Add SCHEMA_VERSION; discard and re-seed on mismatch. | 15 min |
| Q-09 | **DONE** | **Prettier across the project** — 8 files are single-line, 3 are hugely spread out. Do in its own commit, before other logic changes. | 15 min |
| Q-10 | **DONE** | **Chat doesn't scroll to newest message** — add ref + scrollIntoView in ChatPage. | 15 min |
| Q-11 | **DONE** | **Mark-all-read missing** — bell badge only clears by opening every item. | 15 min |
| Q-12 | **DONE** | **Dead Profile controls** — promo card + 2 icon buttons with no handlers. Wire or delete. | 10 min |
| Q-13 | **DONE** | **No keyboard handlers** — 3 `role="button"` divs, zero onKeyDown in the project. | 15 min |
| Q-14 | **DONE** | **Notification list grows forever** — never trimmed. | 15 min |
| Q-15 | **DONE** | **Switches have no ARIA** — 6 toggles, none with role="switch" or aria-checked. | 15 min |

## Medium — 30–90 min each

| # | Status | Fix | Time |
|---|---|---|---|
| M-01 | **DONE** | **Close the learning loop** — joining never updates `historyCategories`, which drives 15% of the score. Push category on join. | 30 min |
| M-02 | **DONE** | **Jaccard similarity** — replace magic numbers (`shared.length * 22`, caps at 70/98) in `calculateUserCompatibility`. | 30 min |
| M-03 | **DONE** | **Enforce `privacy.notifications`** — saved, never read. Gate every setNotifications push. | 30 min |
| M-04 | **DONE** | **Static timestamps** — notifications say "Now" forever. | 45 min |
| M-05 | todo | **Filters only affect one section of one page** — wire `filteredActivities` into Search, Map, AI Picks. | 45 min |
| M-06 | todo | **Distance field on create** — every created activity is hardcoded 1.5 km, and 20% of the score is distance. | 45 min |
| M-07 | todo | **Compute `similarUsersJoined`** — currently a hand-typed boolean; the collaborative signal is fake. Derive from calculateUserCompatibility over joinedUserIds. | 60 min |
| M-08 | todo | **Replace `window.confirm`** — native dialog breaks the phone illusion. | 60 min |
| M-09 | todo | **Wire Messages/Notifications filter chips** — currently inert spans. | 60 min |
| M-10 | **DONE** | **Consolidate the two colour systems** — styles.css vars vs hardcoded hex in MapPage / UserMatchingPage / RecommendationsPage. | 90 min |
| M-11 | **DONE** | **Empty state when filters match nothing** | 20 min |

## Large — 2+ hrs each

| # | Status | Fix | Time |
|---|---|---|---|
| L-01 | todo | **Enforce location permission + approximate location** — the privacy differentiator, currently decorative. | 2 hrs |
| L-02 | todo | **Tunable weights panel** — makes the algorithm inspectable and demoable. | 2 hrs |
| L-03 | todo | **Timestamps + chat expiry** — the Privacy page already promises this in writing. | 3 hrs |
| L-04 | todo | **Tests over the recommendation service** — pure functions, easiest possible thing to test. | 3 hrs |
| L-05 | todo | **Evaluation vs random and interest-only baselines** — the answer to "how do you know it works". | 4 hrs |
| L-06 | todo | **README rewrite to match reality** — currently claims configurable weights (constants) and a behaviour signal that never updates. | 1 hr |

---

## Notes for the defence

- The recommendation engine is where the marks are. Priority: M-01, M-07, M-02, L-04, L-05, L-02.
- Privacy is the stated differentiator but the controls are decorative. M-03, L-01, L-03 fix that.
- Score floor is ~40% because every signal has a non-zero fallback. Observed range on seed data is 49–96. Be ready to justify the fallbacks as priors, or lower them.
- Known limitations are a strength if disclosed first, a weakness if discovered.