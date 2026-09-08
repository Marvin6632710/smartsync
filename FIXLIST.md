# SmartSync — Fix List

Working checklist for the SP1 final defence. ~2 weeks.
Work one item at a time, verify the app still runs, commit, then move on.

## Status
- Q-01 DONE — crash guards in recommendationService.js
- Q-02 DONE — unguarded .slice() in MessagesPage / NotificationsPage
- Q-03 IN PROGRESS — ErrorBoundary.jsx created, styles.css appended.
  REMAINING: wire ErrorBoundary into main.jsx (must wrap BrowserRouter,
  outside it, so routing errors are caught too).

---

## Quick — under 20 min each

| # | Fix | Time |
|---|---|---|
| Q-04 | **Host can leave own activity** — orphans it; your name stays as host. Hide Leave when `createdBy === 'me'`; offer Cancel/Delete instead. | 10 min |
| Q-05 | **Edit Profile lets you remove every interest** — onboarding demands 3, the editor allows 0. Wrecks scoring. Add the same minimum. | 10 min |
| Q-06 | **Capacity can drop below participants** — edit an 8-person activity to capacity 2 and it reads "Full" at 8/2. Floor capacity at current participants. | 10 min |
| Q-07 | **`timeBand` not editable** — missing from EditActivityPage, though it's 15% of the score. | 15 min |
| Q-08 | **Storage versioning** — changes to mockData.js are invisible to anyone with old localStorage. Add SCHEMA_VERSION; discard and re-seed on mismatch. | 15 min |
| Q-09 | **Prettier across the project** — 8 files are single-line, 3 are hugely spread out. Do in its own commit, before other logic changes. | 15 min |
| Q-10 | **Chat doesn't scroll to newest message** — add ref + scrollIntoView in ChatPage. | 15 min |
| Q-11 | **Mark-all-read missing** — bell badge only clears by opening every item. | 15 min |
| Q-12 | **Dead Profile controls** — promo card + 2 icon buttons with no handlers. Wire or delete. | 10 min |
| Q-13 | **No keyboard handlers** — 3 `role="button"` divs, zero onKeyDown in the project. | 15 min |
| Q-14 | **Notification list grows forever** — never trimmed. | 15 min |
| Q-15 | **Switches have no ARIA** — 6 toggles, none with role="switch" or aria-checked. | 15 min |

## Medium — 30–90 min each

| # | Fix | Time |
|---|---|---|
| M-01 | **Close the learning loop** — joining never updates `historyCategories`, which drives 15% of the score. Push category on join. | 30 min |
| M-02 | **Jaccard similarity** — replace magic numbers (`shared.length * 22`, caps at 70/98) in `calculateUserCompatibility`. | 30 min |
| M-03 | **Enforce `privacy.notifications`** — saved, never read. Gate every setNotifications push. | 30 min |
| M-04 | **Static timestamps** — notifications say "Now" forever. | 45 min |
| M-05 | **Filters only affect one section of one page** — wire `filteredActivities` into Search, Map, AI Picks. | 45 min |
| M-06 | **Distance field on create** — every created activity is hardcoded 1.5 km, and 20% of the score is distance. | 45 min |
| M-07 | **Compute `similarUsersJoined`** — currently a hand-typed boolean; the collaborative signal is fake. Derive from calculateUserCompatibility over joinedUserIds. | 60 min |
| M-08 | **Replace `window.confirm`** — native dialog breaks the phone illusion. | 60 min |
| M-09 | **Wire Messages/Notifications filter chips** — currently inert spans. | 60 min |
| M-10 | **Consolidate the two colour systems** — styles.css vars vs hardcoded hex in MapPage / UserMatchingPage / RecommendationsPage. | 90 min |
| M-11 | **Empty state when filters match nothing** | 20 min |

## Large — 2+ hrs each

| # | Fix | Time |
|---|---|---|
| L-01 | **Enforce location permission + approximate location** — the privacy differentiator, currently decorative. | 2 hrs |
| L-02 | **Tunable weights panel** — makes the algorithm inspectable and demoable. | 2 hrs |
| L-03 | **Timestamps + chat expiry** — the Privacy page already promises this in writing. | 3 hrs |
| L-04 | **Tests over the recommendation service** — pure functions, easiest possible thing to test. | 3 hrs |
| L-05 | **Evaluation vs random and interest-only baselines** — the answer to "how do you know it works". | 4 hrs |
| L-06 | **README rewrite to match reality** — currently claims configurable weights (constants) and a behaviour signal that never updates. | 1 hr |

---

## Notes for the defence

- The recommendation engine is where the marks are. Priority: M-01, M-07, M-02, L-04, L-05, L-02.
- Privacy is the stated differentiator but the controls are decorative. M-03, L-01, L-03 fix that.
- Score floor is ~40% because every signal has a non-zero fallback. Observed range on seed data is 49–96. Be ready to justify the fallbacks as priors, or lower them.
- Known limitations are a strength if disclosed first, a weakness if discovered.