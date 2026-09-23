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

- **LIVE (`481ecae`, 2026-09-23)** — activity creation and editing
  use a SmartSync-styled calendar and alarm-like time dial instead of Safari's
  native date/time popovers. Today/Tomorrow and common-time shortcuts speed up
  ordinary choices; stored values and validation are unchanged.
- **LIVE (`ad394d4`, 2026-09-23)** — People for you moved from
  the bottom of AI Picks to immediately below its introduction. Its entry card
  is more prominent, and the matching page now uses roomier, better-grouped
  person cards without changing matching, reporting, following or notification
  behaviour.
- **LIVE (`ad394d4`, 2026-09-23)** — the right-side activity
  details card uses larger time, place and attendance rows on laptops: 17 px
  type, 20 px icons, stronger colour and more breathing room. The hero and
  layouts below 1024 px are unchanged.

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
  Notifications are now written into the _recipient's_ inbox by the _sender_,
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

- L-02 DONE — six sliders over the scoring signals, ranking reorders live.
- L-03 DONE — chat closes 30 days after the activity, enforced in the rules.
  Access expiry rather than deletion, because scheduled deletion needs the
  paid plan; ADR-010 states that plainly rather than overclaiming.
- L-05 DONE — see EVALUATION.md. The model reaches 34.5% precision@5 against
  16.3% for the best single signal, and the ablation found three of the six
  signals contributing nothing.

**All of Quick, Medium and Large is now complete.** What remains is
operational (B-05 onwards) and the written deliverables (D-02 onwards).

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
  _Superseded 2026-09-16 by the web layout below: the frame is gone at every
  width; the phone rules and `100dvh` remain._
- **Failure-scenario audit, 2026-09-14** — seventeen findings, all fixed
  (ADR-015 records the design). The chat composer keeps a message the server
  refuses; a refused thread listener says so and can be retried instead of
  reading as an empty conversation; the warnings page and the moderation
  reference lists no longer fail into "nothing here"; every awaited write is
  bounded so offline saves say "will sync" instead of spinning; a stale route
  chunk after a deploy reloads once; the activity pages wait for the feed
  before declaring something missing; the create form asks for a cleared date
  instead of blaming permissions; a report can be closed once; partial
  stand-downs, search failures, location errors on the map and sign-out
  failures are all said; sign-up keeps the name through a refused first write;
  follower announcements made offline are held until the connection is back;
  turning approximation on rounds the position already stored. Toasts now
  render on the onboarding pages too. 84 tests added (82 unit/rendering, 2 rules)
  (`tests/unit/writes.test.js`, `tests/app/chatPage`, `warningsPage`,
  `activityPagesLoading`, `createActivityPage`, `moderationFailures`,
  `signUp`, `lazyRoute`, `saveProfile`, `signOutFailure`, `onboardingToast`,
  and additions to `appContext.listeners`, `activitiesData`, `mapRecentre`
  and the rules suites).
- **Follow-up, 2026-09-14** — the five items the audit's report left open:
  reports are claimed before they are acted on (ADR-016; claim lease in the
  rules, actions verify the claim inside their transaction, failed actions
  release it, stale claims expire); content queued offline and refused later
  is kept and offered back (unsent registry — chat, create, edit, profile,
  report — surviving reloads and merged across tabs); moderation actions
  refuse to start offline and are unblocked after 20 s with the real outcome
  announced later; an identity sweep started from the cache is finished from
  the server on reconnect; a slow feed on a live link is no longer called a
  dead server (`serverSeen`); the stale-chunk reload was verified on the built
  app, the sign-up retry on the emulator, and the sign-up name is capped at
  what the rules accept. 15 rules tests and ~70 unit/rendering tests added.
- **Follow-up 2, 2026-09-14** — the limitations that report left: a decision
  is now committed in the same transaction as the action it records, so a
  suspension or warning attributed to a report cannot land without its
  claim (rules tie warnings that name a report to the claim too; "already
  done" for one's own decision on a retry); sign-up profile creation is a
  create-if-missing transaction with a shared bounded retry, and the
  observer reads the typed name — verified by a new emulator-backed
  integration suite (`npm run test:integration`, real Auth + Firestore,
  forced refusals, concurrent writers, sign-out → sign-up ×3); the
  slow-first-load banner was measured against a delaying proxy (4 s/answer:
  no banner; 5.5 s: silence banner at 20.4 s, cleared at the first answer;
  held: stays until released) and is now worded as silence rather than
  "Offline"; edit rows carry what the form was seeded with, so a landed edit
  overtaken from another device is *superseded* (offered as a choice), not a
  false "couldn't be saved"; the unsent registry falls back localStorage →
  sessionStorage → memory with a leave-page guard when memory is the only
  copy. Rules and integration suites run on their own emulator ports
  (`firebase.test.json`), so they no longer collide with a running dev
  emulator.
- **Four languages, 2026-09-16** — the interface speaks English, ไทย,
  မြန်မာ and 简体中文 (i18next, bundled resources, no translation service),
  chosen from a selector on the entry screens and the first row of
  Settings and kept on the device across refresh, navigation and sign-out.
  Every stored value stays English — categories, time bands, report
  reasons, signal ids, the profile's default names — and is translated
  only when shown; notifications and report context, which the rules fix
  to plain text, are still written in English and recognised back from the
  same template table on the way to the screen, so old records read in the
  new languages too. Dates, clocks, distances, percentages and lists follow
  the language with Latin digits throughout; day and month names come from
  the translation because desktop Chrome has no Burmese calendar data.
  Recommendation reasons are worded from the scorer's facts, not its
  sentences, so ranking is untouched (evaluation harness unchanged). The
  auth forms validate in the app's language instead of the browser's.
  Design record: ADR-017. 34 tests added, including key parity across the
  four files and a stored-text round trip in each language.
- **Appearance, 2026-09-16** — Light, Dark and System, chosen in Settings
  and kept on the device (`smartsync:theme`); System follows
  `prefers-color-scheme` live. Implemented as a second token set under
  `:root[data-theme='dark']` (ADR-018) with the scrim, skeletons, urgency
  pills, category chip tints, shadows and the map ground moved onto tokens;
  `public/theme-boot.js` stamps the attribute before the first paint. Every
  dark pairing measured ≥ 4.5:1, most ≥ 7:1. 12 tests added.
- **A minimum age of fifteen, 2026-09-23** — asked at sign-up and, for
  accounts that predate the gate, on a screen above every other route
  except a closed account (interests are something somebody makes;
  whether they should be making them here is answered first). A **date
  of birth**, not an age, because an age is true for a year and would go
  stale in the one number the minimum depends on; it lives in the
  private half of the profile with the email and the real name, and is
  never public under any setting. **The rules enforce it**, not the
  form: a private-profile write carrying a date under the minimum is
  refused, so a client that skips the screen is refused the same way —
  the cut-off is built as a `YYYY-MM-DD` string from `request.time`,
  because rules have no date arithmetic and fifteen years is not a fixed
  number of days. The **age** may appear on the public profile, off by
  default, and turning it off sets the field to `null` rather than
  hiding it at render time (Firestore has no field-level read rules —
  the same argument as ADR-005 for a name under anonymous mode). The
  owner's own card shows it either way, labelled "only you" when nobody
  else can see it. The refusal screen offers no way to edit the date: a
  retry button would make the gate a guessing game with unlimited tries,
  which would stop nobody and pretend to. `src/utils/age.js` is the
  whole policy; `MIN_AGE` is the one number to change. ADR-034. 28 tests
  added (15 on the policy, 13 through App's real routing) plus 5 in the
  rules suite; verified in the emulator — the gate appears for an
  account with no date, an under-15 date is refused with nothing written
  and "come back in about 1 year", a valid one lets them through, the
  profile reads "25 years old · only you", and the consent switch moves
  the number on and off the public document. **Self-declared and
  unverified**, which README §13 says plainly rather than implying away.
- **Chat is moderated before delivery, 2026-09-23** — to the owner's
  12-point specification. The database now refuses every client-written
  message (`allow create: if false` on `activities/*/messages`, and on
  `chatPictures`), so the only writer is `sendChatMessageCall`, a
  callable that re-checks membership, suspension, closure and the 30-day
  window itself and then moderates. Text goes to OpenAI's Moderation API
  (`omni-moderation-latest`); a picture goes as an image *and* is
  transcribed by a small vision model so the words inside a meme are
  read as text, because the API applies `hate` and `harassment` to text
  only. Nine categories block, each only when the API's boolean is true
  **and** its score clears a floor kept in `functions/lib/moderation.js`
  — `violence` without `graphic`, `illicit`, `self-harm` and
  `self-harm/intent` deliberately do not, the last two because blocking
  somebody who says they are struggling takes the message away from the
  people who might help. A refusal never reaches the thread: it stays in
  the sender's own composer as an unsent bubble with a general reason
  (never the category, never a score) and Edit / Discard / Ask for a
  review; an appeal reaches `/admin/chat`, where **Overturn and post**
  posts the message the person actually wrote from the held copy and
  deletes that copy in the same write. Sexual content involving minors
  is blocked with nothing retained and no appeal — the provider's own
  guidance forbids sending suspected CSAM to the API, and the real
  obligation is a report to an authority, not a click (README §11). An
  outage, a quota refusal or a revoked key never becomes delivery: the
  message is kept and Retry is offered. Also: a rate limit of 60 sends
  an hour per person and a daily call budget, chat pictures at a 1024px
  edge with their metadata stripped in the browser, and chat
  notifications removed from what a client may write. ADR-033. 71 tests
  added plus rules coverage; verified end to end in the emulator against
  the stand-in in `scripts/fake-openai.mjs` — clean message delivered,
  refusal present in no thread, picture or notification, appeal,
  overturn, outage and successful retry, picture sent and rendered, a
  meme blocked by its words and not its caption, a flagged-but-under-floor
  message delivered, the rate limit, and ten bypass attempts all
  refused. **Not** verified against the real API: no `OPENAI_API_KEY`
  exists for this project yet, and the floors are what a real key would
  most likely retune.
- **Cards and columns get an edge, 2026-09-22 (`ead3537`, deployed)** —
  the owner, looking at Discover, Map and Profile on a wide dark screen,
  asked for the boundaries between categories to be visible. Each
  activity card now carries a hairline in its own category's colour
  (`color-mix` of `--cat` with `--line`, the light partner `--cat-2` in
  the dark set, brighter on hover) instead of `border-color: transparent`;
  and a seam runs down the gutter of all three wide layouts — the feed
  and the picks, the list and the map, the profile and what you joined —
  a 1px gradient faded at both ends, drawn as a `::after` grid item in
  the left column's cell, shifted half the gap. Placing it broke the map
  and profile grids at first (a definitely-placed grid item is placed
  before auto-placed ones, so both real columns shifted a cell along):
  `.map-side`/`.smart-map` and `.profile-column`/`.profile-recent` are
  now placed by hand. Verified light and dark, 1024px and phone (no seam
  when the columns stack); deployed hosting only.
- **The 403 traced to the Google account; free tier, `flash`, wider
  timeouts, 2026-09-22** — the denial was not the key, the request or the
  project (a third key from a billing-free project was refused the same
  way); a key made under a different Google account works. That key is on
  the free tier, where `gemini-3.5-flash-lite` never answered and
  `gemini-3.5-flash` answered correctly in 43–75 s (queuing, not
  generating; two to three seconds on the paid key). Attaching billing to
  the working project was recommended and declined, so: `DEFAULT_MODEL` →
  `gemini-3.5-flash`, model-call timeout 20 s → 90 s, Function 30 s →
  110 s, browser callable 35 s → 115 s, and the SDK retry dropped (a
  second attempt no longer fits; Try again is the retry). AI Picks can
  now take up to a minute on a first load and is then cached for ten.
  ADR-032; README §10; secret at version 5.
- **Live after the 2026-09-22 deploy: Gemini refusing the project (403)**
  — `34ae1d4` shipped (Function then hosting); the live page then showed
  the no-ranking state because the API answered every generation call
  with `permission_denied: "Your project has been denied access. Please
  contact support."` (key valid: the models list answers 200). Google's
  side — the AI Studio/Cloud project behind the key, most likely the new
  prepay billing under review; worked the evening before. Follow-up:
  401/402/403 now classify as `refused` with the wording "Gemini is
  refusing this server's access right now…" (four languages) instead of
  "gave an answer the app could not use". The owner has to resolve it in
  AI Studio (billing/support) or re-set the secret with a key from
  another project.
- **Place names go to Gemini, by name only, 2026-09-22** — at the owner's
  request after the trade-off was laid out (ADR-031). Each candidate
  carries its `locationName` as `place` (cleaned, 60 chars) and the
  person's signals carry `placesBefore` — the venues of their joined
  activities, once each, at most twelve — both in the cache signature. A
  ninth reason code `place`, checked on the server (the activity's place
  is one of `placesBefore`, case-insensitively; no place named, no code),
  worded "At {{place}}, where you've been before" in four languages. The
  prompt weighs places with time and distance and declares place names
  data, not instructions. Coordinates never go; the on-page privacy line
  now says the names of places you have been to are sent. Verified in
  the emulator against the stand-in with an added Gaming activity at
  Siam Square (`activities/place-test-1`, where the demo admin had
  joined before): top pick with "At Siam Square, where you've been
  before", the Function's answer carrying `place`. Tests: +3 (server,
  client, page); 854 unit/app.
- **The scoring engine removed; Gemini ranks and nothing else does,
  2026-09-22** — at the owner's decision, after the trade-offs were put
  to them (ADR-030). `recommendationService.js` is gone: the six-signal
  score, its reasons, the weights, the sliders page (`/weights`), the
  "How this works" panel, the recommendation-details page
  (`/recommendations/:id`), every "% match" pill (cards, Home hero, map,
  activity page, profile's "Top match"), the count-up hook, and
  `scripts/evaluate.mjs` with its `npm run evaluate`. What stays is
  `services/compatibility.js`: the people-compatibility score behind
  People match and the "somebody like you is going" fact that the AI
  Picks request carries as `similar`. The context now enriches and
  orders (soonest first) instead of scoring; the candidate cap keeps
  the forty soonest; the score left the request and the prompt (the
  model is told the order is its to decide); and with no answer from
  Gemini the page shows the eligible activities soonest first under
  "Not ranked" with the reason and Try again — no hero and no reasons,
  because nothing ranked. The wire value for no answer is `source:
  'none'` (was `'standard'`), which the deployed Function still sends as
  `'standard'` until it is redeployed — the page treats anything but
  `'gemini'` the same, so either works. A retired `smartsync:weights`
  key is swept from localStorage on load. Four languages; `EVALUATION.md`
  kept as history with a banner; README §10, ARCHITECTURE and the
  exhibition Q&A rewritten (the "measured, not asserted" answer is now
  about checkability, since Gemini's ranking is unmeasured). Verified in
  the emulator against the stand-in: ranked with reasons, the fallback
  with the stand-in stopped, Try again back to ranked, Home/card/map/
  activity/profile/settings without the score, `/weights` → 404; phone
  width. Tests: −73 (the engine's, the sliders', the counter's), +25
  `tests/unit/compatibility.test.js`, page and service tests updated;
  851 unit/app tests pass.
- **AI Picks through Gemini, to the owner's spec, 2026-09-21** — the
  page's top list is now ranked by Gemini, as a re-ranker over the
  activities the person could join (upcoming, not full, inside their
  discovery filters, nobody blocked, not already joined; the forty best
  by the engine's score), from their interests, joined categories with
  counts, preferred time and whether distance is known. Through an
  authenticated callable Cloud Function (`recommendActivities`) with the
  key in Secret Manager; the browser holds only the Function's name.
  The model answers ids and reason codes against a JSON schema; unknown
  ids and repeats are dropped, every code is checked against the facts
  on the server and the ids checked again on screen, and the reasons
  are worded from the activity's own data in four languages — the model
  writes nothing a person reads. Cache per person in Firestore (ten
  minutes, keyed by the signals and the set of ids), ten model calls an
  hour per person and 1,500 a day for everyone, one transaction; no
  key, quota, outage, timeout or an unusable answer all come back as a
  value and the page shows the engine's own order under "Standard
  picks" with the reason and Try again. Refresh asks past the caches; a
  render never asks; a changed question (an interest added, the
  eligible set changed) asks again after a pause. Thin profiles get
  "Get better picks" with the four things that help. ADR-029; README
  §10 has the owner-only setup (key, Blaze, secret, deploy) and the
  stand-in server for the emulator (`scripts/fake-gemini.mjs`).
  Live the same evening: the owner upgraded to Blaze, set the secret and
  deployed the Function and rules; the push Functions remain undeployed.
  Verified in the emulator against the stand-in: ranked, cached
  (`cached: true` on the second call, one POST), refreshed, rate-limited
  (10 forced calls → the eleventh refused with a retry time), outage →
  standard picks, garbage → invalid; phone and laptop, light and dark.
  Tests: `tests/unit/picksServer.test.js` (38), `tests/unit/aiPicks.test.js`
  (13), `tests/app/recommendationsPage.test.jsx` (10), rules "AI Picks".
- **Discovery filters as sets, to the owner's spec, 2026-09-21** — the
  category and time dropdowns are gone; in their place a checkbox per
  category and per time band, dressed as chips with a mark, in labelled
  groups with an "All categories" / "Any time" control that empties its
  group and shows as pressed while it is empty. Any combination: OR within
  a group, AND between them — football or basketball, in the morning or
  evening, within the distance, with room (ADR-028). An empty set means no
  restriction, so nothing chosen is the old default. The page edits a
  draft that reaches the feed on Apply; Reset empties both sets, restores
  the distance and the switch, and applies. The feed, the search and the
  map all read one predicate (`src/utils/filters.js`), so title-only search
  and its empty-input prompt are as they were, narrowed by the same sets;
  the search's "clear filters" button compares by value, since two empty
  arrays are never `===`. A filter saved by the old version (`category`,
  `timeBand`) is read as a set of one and 'All'/'Any' as empty, without
  bumping the storage schema (a bump would take the weights too), and is
  written back in the new shape. The Discover page's Filter button counts
  the choices in force ("Filter, 4 active" to a screen reader); the empty
  state offers "Adjust filters" beside "Clear filters". Four languages.
  Verified in the emulator app: two categories and two times → the two
  activities that fit and not the one at the wrong time; search inside and
  outside the sets; the old shape seeded into storage → read, shown and
  rewritten; Reset; phone and laptop, light and dark. Tests:
  `tests/unit/filters.test.js` (migration, matching, counting),
  `tests/app/filterPage.test.jsx` (checkboxes, all/any, draft vs Apply,
  reopened, Reset, Thai), `tests/app/appContext.listeners.test.jsx`
  (the old shape through the context, OR/AND on the feed).
- **The bell's badge, to the owner's spec, 2026-09-21** — the unread
  count on the notification bell was there; three things were not. It
  counted the inbox, which holds the newest fifty, so it could never say
  more than fifty and lied past it: now it has a listener of its own over
  the unread documents alone (`watchUnreadCount`, capped at a hundred),
  so it moves the moment one arrives or is marked read — including a
  mark-all-read that reaches notifications too old for the inbox to have
  loaded — and reads "99+" past ninety-nine. It said "Notifications" to a
  screen reader whatever the number: the button's name is now
  "Notifications, 3 unread" (four languages) and the badge itself is
  decoration. And a new account inherits nothing: the count is reset with
  the rest of the state when the signed-in user changes. Nothing changed
  about when a notification becomes read — opening the inbox does not,
  tapping one does, Mark all read does. Verified in the emulator app with
  0, 1, 2, 3, 100+, an arrival, one tapped, and Mark all read; phone and
  web headers, both themes. Tests: the shell's cases (0, 1, 3, 99, 100,
  Burmese), the context's listener and its reset, the rules for the
  query.
- **Current warnings, the second pass, 2026-09-21** — the owner's spec
  for the card in Settings, point by point. With anything on the record
  the card is the first thing on the page, above the preferences; with
  nothing on it, it waits under them in a quiet state, so a clean record
  is not an alert and a card does not appear the moment you are warned.
  The count is a badge in words ("1 warning", "2 warnings"; th/my/zh
  have one form) beside the heading, the line under it says what to do
  ("You have an active account warning. Review it for details."), and a
  labelled "View warnings ›" is the way in — though the whole card is
  the button, a real one, so Enter and Space work and the focus ring
  draws inside the card's corners rather than being clipped by them.
  Until the listener answers the card says "Checking your record…", a
  failed read says so, and only a real answer of nothing says "No
  active warnings" — a warning never lapses in this system (the rules
  refuse every edit and delete), so every one on the record is active.
  Six tests, including the placement, the words, the keyboard and Thai.
- **The profile across the top, the record in its own card, a bio of 75
  words, 2026-09-21** — three things the owner had asked for. On a laptop
  (from 1024px) the profile is one tall panel down the left in the brand
  gradient — the card's controls, picture, name, bio and handle, then the
  overview's figures and interests under a hairline — at least the height
  of the window and growing with what stands beside it, which is the
  activities you have joined, laid out in cards on the right (six there,
  two on a phone). The card and the overview share a wrapper that is
  `display: contents` below 1024px, so the phone layout keeps its order.
  The card itself was reworked on both: the picture has a ring, the
  handle sits under the name and the bio under that at a readable
  measure, the interests moved onto the card as its chips, and **Edit
  profile is a white button on the card** — it had been a small "Edit"
  beside the "Your activity life" heading, which nobody found. That
  section is now three figures — joined, hosting, top match — and
  "Recent activities" has an empty state with a way to Discover. And the
  card lost its purple: it is in the mark's own colourway — cream and
  lilac on ink — with the ground a dusky indigo between the two, the
  lilac carried down into the ink (`--profile-ink` / `--profile-ink-2`,
  a step deeper in the dark set). The tile's own near-black was tried
  and read as too dark, the accent at full brightness as too bright;
  this is the middle. A lilac light in one corner, a lilac ring on the
  picture, cream text, the Edit profile button cream with indigo. The
  one screen that had colours belonging to no other part of the app
  now has the brand's. In Settings the warnings row
  leaves the list of preferences for a card of its own, "Current
  warnings", whose icon sits in a tile; it watches the record
  (`useMyWarnings`, shared with the warnings page) and says how much is on
  it — "Nothing on your record" once it knows, and only then — and when
  there is anything, the whole card takes the warning tone and the count
  takes the chevron's place. The bio's limit is 75 words, and 500
  characters for the languages that do not put spaces between words
  (ADR-027): `validBio()` in the rules splits on whitespace and counts,
  the editor counts the same way live ("72 of 75 words"), goes red past
  the limit and refuses the save with the reason; the profile keeps the
  line breaks that were typed. Four languages. Tests: the rules case for
  the two ceilings, the editor's counter and refusal, the helper, and five
  for the Settings card (its claim about a clean record is made only once
  the listener has answered, never on an error).
- **Web layout, 2026-09-16** — the phone frame is gone: under 720px the app
  is the phone it was; from 720px a web header (brand, four tabs, search,
  create, notifications, avatar → profile) replaces the bar, the tabs and
  the floating button, the scroller runs the full window, and each page
  takes a width keyed by its route (760 / 960 / 1200px). From 1024px
  Discover, Map (a list beside the map that selects pins), Activity (sticky
  action card with the facts), AI Picks and Profile take two columns; card
  lists become grids. Sign-in, splash and onboarding are centred columns on
  the page's own ground. The scroller is focused on each screen so the
  keyboard scrolls it. Also fixed in passing: the map's round "see as list"
  button had kept pill padding and squeezed its icon to 4px. ADR-019.
  Verified at 1920 / 1440 / 1280 / 1024 / 844×390 / 768 / 390 / 320, light
  and dark, all four languages; 7 shell tests added.
- **Browser push, 2026-09-19** — the inbox record is now also sent, once,
  to a person's devices through Firebase Cloud Messaging by a Cloud
  Function (`functions/`) for the kinds that matter when the app is closed;
  records carry `kind` + `params`; devices live under
  `users/{uid}/pushTokens`, self-only, cleaned on sign-out, revocation,
  dead token and after 60 days; `public/push-sw.js` shows a push only when
  no SmartSync window is visible and opens `/n/{id}`; Settings →
  Notifications has the inbox switch, this browser's state, four category
  switches, message previews (off), and the device list; the app asks for
  permission once, after a join. In-app: a tappable toast for arrivals.
  Needs Blaze to deploy the Function; not deployed. ADR-021. Tests: policy,
  wording ×4 languages, worker, client module, settings page, open route,
  invite, toast, rules, Admin-SDK delivery and the live trigger.
- **The mark, 2026-09-19** — SmartSync has a logo: two hooks making an S,
  ink and indigo (`src/components/BrandMark.jsx`). It replaces the stock
  sparkles icon in the web header, on the splash, sign-in, sign-up and boot
  screens, and the tab finally has an icon (`public/favicon.svg`, plus an
  Apple touch icon). The header wordmark is ExtraBold, tracked −3%. Four
  directions and seven colourways were compared first (kept under
  `design/logo-concepts/`). ADR-020. 2 tests added.
- **One rank, one console, 2026-09-21** — the moderator rank is gone,
  from the rules outward. Two ranks remain: an ordinary user, and an
  admin who does the moderating. `firestore.rules` has no `isModerator()`
  any more; every write that took a rank takes `isAdmin()`, the only role
  the app may write is `user` (so a row still saying `moderator` grants
  nothing and is brought into line by the first decision taken on it),
  nobody warns or suspends a fellow admin, and the log's `appoint` and
  `dismiss` kinds are refused. `/mod` and the moderators page are
  deleted; `/admin` is the one console, cut down to what an exhibition
  can explain in a sentence each: Overview (fewer figures, no median),
  Reports (search, status, type — no triage score, no bulk close, no date
  or handler filters), Accounts (warn, suspend and lift, close and
  reopen), Activities (take down, put back), History (search and kind —
  no workload table). The System page is gone. `isModerator` left
  `AuthContext`; the activity page's tools say Admin; Settings and the
  web header carry one door; the two rank-change notification templates
  are gone (a stored one still reads as its English text); the four
  locales lost 239 dead keys and gained the admin wording in each
  language. Tests rewritten rather than dropped: the roles matrix is a
  two-rank matrix with a legacy `moderator` row that must act on nobody
  (116 cases), the feature rules use two admins, the log tests refuse the
  retired kinds — 348 rules tests; 73 console tests. ADR-024. Not
  deployed, not committed.
  Verified in the browser against the emulator: a suspension taken on a
  legacy `moderator` row from the queue rewrote it to `user` through the
  rules, with its log entry, its decision and two stand-downs; lifted and
  restored again from the console; a plain user and the legacy row see
  the closed door and are refused by the rules on every read and write;
  375px; Thai.
- **Two consoles: the moderators' desk and the admin's, 2026-09-20** —
  the moderation screens leave the phone shell for two internal
  consoles, each its own room outside the app: `/mod` for whoever holds a
  rank (dashboard, report queue, accounts, history) and `/admin` for an
  admin (overview, queue, accounts, moderators, activities, audit log,
  system). Dense tables with keyboard rows (arrows, Enter, Space, `/`,
  Escape), sticky filters, a details panel for the selected record, a
  claim taken on purpose with its lease counting down, a triage score
  shown next to its badge, bulk close for duplicates, and the ladder of
  actions drawn by rank — an admin's powers appear only in the admin
  console. Every handler the old page had grown moved into one hook
  (`src/console/useDesk.js`) with its wording and its failure-telling
  intact. New underneath, because the desk needed them: a
  `moderationLog` collection whose rules bind each entry to its writer,
  to the server's clock and — through `getAfter` — to a state the subject
  is actually in; a bounded feed of decided reports (index on
  `status`/`reviewedAt`); one-shot readers for an account's and an
  activity's whole record; names resolved past the peer window; server
  counts for the overview (`getCountFromServer`, one more index on
  `activities` `status`/`startsAt`). `/moderation*` redirects into the
  consoles; Settings and the web header carry the door. ADR-023. Not
  deployed, not committed. Verified in the browser against the emulator
  as admin and as moderator: claim, takedown and restore each landed
  through the rules with their log entries; the door for a plain user and
  for a moderator at `/admin`; 1440 / 1280 / 900 / 375; light and dark;
  Thai and Burmese. Tests: rules (16), consoles (77 across guards,
  reports, accounts, admin pages, languages and theme, routes, history);
  two module tests extended for the log.
- **Settings without the Activity messages row, 2026-09-20** — the row
  was a door to `/messages`, which is a tab: chats are activity
  interactions, not preferences. The row and its two strings (four
  languages) are gone; the Messages tab, `/messages`, the threads, the
  chat, its notifications and its rules are untouched.
- **Terms & Safety, and a front door, 2026-09-20** — the first thing
  anybody sees is now an agreement: what SmartSync is for, the eight
  things it must never be used for, how to report and what a breach
  costs, one checkbox, a Continue disabled until it is ticked, the full
  text unfolding inside it. A dialog over whatever the routes show, with
  the page beneath inert, until this device has accepted the current
  `TERMS_VERSION` (`src/terms`, kept as `smartsync:terms`), so a change
  of wording asks everybody again; no other way out. The full text is
  also at `/terms` — from the front door's footer and a new Settings row.
  Behind it, the splash is replaced by a landing page (`WelcomePage`):
  brand bar with language, appearance and the two ways in; headline and
  buttons on the left; on the right the app's own activity card with its
  match score, the reasons worded by `reasonText`, and the group chat;
  the counts read from the code; then the three steps and three safety
  points. ADR-022. Not deployed, not committed. Verified at 1440 / 1280 /
  768 / 375 / 320, light, dark and system, all four languages; sign-in
  through the emulator lands on Home and the dialog does not return.
  Tests: the module (6), the dialog (11), the front door (11), the flow
  through `App` (8).
- **Language in the header, 2026-09-16** — from 720px the language picker
  (the Settings control, the same stored choice) sits in the web header
  between notifications and the avatar: icon and chevron to 1279px, the
  language's own name from 1280px; Settings keeps its row and both show
  the one value. Found on the way: the shell's grid column could widen
  past the window when the header did (`1fr` → `minmax(0, 1fr)`).
  ADR-019 addendum. Verified at 720 / 1024 / 1280 in all four languages
  (no overflow; header ↔ Settings, reload, sign-out/in, second tab);
  1 shell test added.

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

| #    | Status   | Fix                                                                                                                                                                                                              | Time  |
| ---- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| L-01 | **DONE** | **Enforce location permission + approximate location** — real browser permission prompt; approximate rounds to ~1 km before storing.                                                                             | 2 hrs |
| L-02 | **DONE** | **Tunable weights panel** — six sliders under Settings, ranking reorders live; the same mechanism the evaluation harness ablates with.                                                                           | 2 hrs |
| L-03 | **DONE** | **Timestamps + chat expiry** — real server timestamps, and threads close 30 days after the activity, enforced in the rules rather than filtered in the client. Access expiry, not deletion; see ADR-010 for why. | 3 hrs |
| L-04 | **DONE** | **Tests over the recommendation service** — 41 tests including a fuzzer, which found a real crash on non-string category data.                                                                                   | 3 hrs |
| L-05 | **DONE** | **Evaluation vs baselines** — 34.5% P@5 against 16.3% for the best single signal and 5.0% random, plus a per-signal ablation showing three of six signals contribute nothing. See EVALUATION.md.                 | 4 hrs |
| L-06 | **DONE** | **README rewrite to match reality** — now documents the real architecture, the data and security models, and how to run it.                                                                                      | 1 hr  |

## Tier 1 — safety and reliability

Added 2026-09-10 after a product review: SmartSync asks strangers to meet in
person, and the app had no way to report anyone, block anyone, or record who
actually turned up. These are not features so much as the conditions for
letting real people use it.

| #    | Status   | Task                                                                                                                                                                                                                                          |
| ---- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-01 | **DONE** | **Report and block** — report a person, activity or message with the context attached; blocking hides them everywhere and the rules refuse to let them join anything you host. Block lists are private, reports are immutable. 20 rule tests. |
| T-02 | todo     | **Attendance and no-shows** — remind before it starts, confirm on the day, let the host mark who came. Feeds the recommendation engine, which currently learns from what you joined rather than what you attended.                            |
| T-03 | todo     | **Recurring activities** — weekly football has to be recreated by hand every week, which is also why demo data goes stale.                                                                                                                    |

## Backend & operations

**Deployed 2026-09-09 — live at <https://smartsync-c1f07.web.app>**
Confirmed working on iPhone Safari the same day.
(Firebase project `smartsync-c1f07`, Firestore Standard in `asia-southeast1`.)
Verified in production: sign-up, onboarding, activity creation with real
coordinates, and that unauthenticated reads and writes are refused by the
security rules.

Not application code. Several of these can only be done by a human with a
Google account — marked **you**. B-01 to B-03 block everything else: deploy
on day one while a broken deployment is cheap to fix.

| #    | Status            | Task                                                                                                                                                                                                                                                                                                                                   | Owner   |
| ---- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| B-01 | **DONE**          | **Create the Firebase project** — enable Email/Password auth, create Firestore in `asia-southeast1`. README §3.                                                                                                                                                                                                                        | **you** |
| B-02 | **DONE**          | **Publish security rules to production** — `npm run deploy:rules`. Rules behave differently against a real project than an emulator; verify before trusting them.                                                                                                                                                                      | **you** |
| B-03 | **DONE**          | **First production deploy** — `npm run deploy`, confirm the live URL loads and sign-up works.                                                                                                                                                                                                                                          | **you** |
| B-04 | **DONE (iPhone)** | **Real-device verification** — confirmed working on iPhone Safari 2026-09-09, which was the largest untested surface in the project. Android remains unchecked; if a device is to hand, the parts most worth a second look are the date and time pickers and the map's location prompt, which diverge most between engines.            | **you** |
| B-05 | **DONE**          | **Seed a realistic production dataset** — 18 activities at real Bangkok locations across all 12 categories, spread over five weeks with a cluster on and around the defence date, since past activities are hidden and a two-week spread would leave the app empty on the day. `npm run seed:production -- --confirm`, safe to re-run. |         |
| B-06 | **DONE**          | **Network failure states** — an offline banner driven by Firestore's own connection state (more honest than navigator.onLine, which only knows whether an interface exists), and joins confirm optimistically then correct themselves if the server disagrees. Verified by killing the backend with the app open and restoring it.     |         |
| B-07 | todo              | **Quota sanity check** — Spark plan allows 50k reads/day. Confirm a demo session is nowhere near it, and don't leave tabs holding listeners open overnight.                                                                                                                                                                            |         |
| B-08 | todo              | **Data export** — `firebase firestore:export` before the defence, so a bad write is recoverable.                                                                                                                                                                                                                                       |         |
| B-09 | todo              | **Accessibility sweep** — keyboard-only run through the main flow plus a contrast check. Cheap, and often explicitly on the rubric.                                                                                                                                                                                                    |         |

## Evaluation & deliverables

The written and demonstrated work. D-01 is the highest-value remaining item
in the entire project.

| #    | Status   | Task                                                                                                                                                                                                                                                            | Time   |
| ---- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| D-01 | **DONE** | **Algorithm evaluation → `EVALUATION.md`** (same as L-05). Synthetic population with known preferences; compare random vs interest-only vs the full weighted model on precision@5 and MRR; add a per-signal ablation. The answer to "how do you know it works". | 4 hrs  |
| D-02 | **DONE** | **Written demo script** — DEMO_SCRIPT.md: timed to 7 minutes, exact click path, exact figures verified against the live site, contingencies, and a rehearsal log to fill in. Rehearsing it three times is still yours to do.                                    | 2 hrs  |
| D-03 | todo     | **Recorded backup demo video** — so a wifi failure at the venue does not become a failed defence.                                                                                                                                                               | 1 hr   |
| D-04 | todo     | **Report and slides** to the department template. Check the brief for required artefacts (SRS, UML, test matrix) — most can be pulled straight out of this repo.                                                                                                | —      |
| D-05 | **DONE** | **Defence preparation** — DECISIONS.md now ends with the questions a panel actually asks, each answered from something in the repository. Read it before you walk in.                                                                                           | 30 min |

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
- The security rules are worth demoing. `npm run test:rules` runs 390 tests
  that behave like a hostile client; two of them describe holes that existed
  and were closed by redesign, which is a better story than "we wrote rules".
  The strongest of them now is chat: the rules refuse the write outright and
  hand it to a Function that moderates first, so "how do you stop somebody
  bypassing your moderation" has a one-line answer (ADR-033).
- Known limitations are a strength if disclosed first, a weakness if
  discovered. README.md ends with an honest list.
