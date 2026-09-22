# SmartSync — hand-off

Original hand-off written 2026-09-21 after removing the moderator rank and
shipping the admin console. Later picture-upload, search and map changes are
recorded below; the original session details remain for context.

**Continuing in Claude Code?** Start with [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md)
for the current release, local setup, feature status and continuation steps.
Prepared 2026-09-21 from clean, synchronized `main` at `622ed9c`; this handoff
update is documentation only. The application has no half-finished changes.

## Latest continuation — the scoring engine removed (2026-09-22)

**State: built and verified on localhost; NOT committed, NOT deployed.**
The owner is testing it first; nothing goes to git or the live site
until they say so. `git status` shows the whole change as a working-tree
diff on top of `8df38bd` (together with the place-names addition below:
49 modified, 8 deleted, 2 new). The live site is still the `8df38bd`
build with the engine.

**The owner's decision.** With AI Picks ranked by Gemini, they asked
whether the signal weights were still needed. I laid out that the weights
were the parameters of the engine that still chose the forty candidates,
was the fallback, put "% match" on six screens and was what
`EVALUATION.md` measured; recommended keeping the engine hidden and only
retiring the sliders and the panel. They chose to remove the engine
outright: "just let the gemini decides, i think i don't need the engine
anymore, so delete it out." ADR-030 records the trade-offs and the
choice.

### What was done

- **Deleted:** `src/services/recommendationService.js` (score, reasons,
  weights), `src/pages/WeightsPage.jsx` and the `/weights` route,
  `src/pages/RecommendationDetailsPage.jsx` and `/recommendations/:id`,
  `src/hooks/useCountUp.js` (the hero's counting score),
  `scripts/evaluate.mjs` and `npm run evaluate`; their tests
  (`recommendation.test.js`, `weightsShown.test.jsx`, `countup.test.js`).
- **New:** `src/services/compatibility.js` — `calculateUserCompatibility`
  and `jaccardIndex` (People match), `computeSimilarUsersJoined` /
  `computeParticipantSimilarity` (the `similar` fact), and
  `enrichActivities(user, activities, peers)` which attaches
  `similarUsersJoined` and orders soonest first (unknown start last). Its
  tests: `tests/unit/compatibility.test.js` (25).
- **Context:** the `scored` stage is now `enriched`; `weights`,
  `setWeights`, `resetWeights` and the `smartsync:weights` storage are
  gone (the key is swept from localStorage on load — `RETIRED_KEYS` in
  `utils/storage.js`). `recommendations` / `filteredActivities` are
  soonest first.
- **AI Picks page:** the how-panel (strip, percentages, "Change what
  matters") is gone; the privacy sentence sits under the page lead as a
  quiet line. The hero shows "Gemini's top pick" instead of a percentage,
  its reasons only when the model gave any. With no ranking (`source !==
  'gemini'`): the bar reads "Not ranked. <reason>" with Try again, there
  is **no hero**, and a "Not ranked / Happening soon" section lists the
  eligible activities soonest first without reasons (`unrankedPicks`).
  The grouped-by-interest list orders groups by first appearance
  (soonest) instead of best score.
- **Request/prompt:** `matchScore` removed from `candidateOf`,
  `cleanCandidate` and `buildPrompt`; candidates are the forty soonest
  (`chooseCandidates` → `soonestFirst`); `resolvePicks` no longer falls
  back to engine reasons (a pick can have none). The system instruction
  now says the order is the model's to decide. `scripts/fake-gemini.mjs`
  ranks by fit (interest 2, history 1) then soonest.
- **Wire:** the Function answers `{ source: 'none', reason }` where it
  said `'standard'`. **The deployed Function still says `'standard'`**;
  the page treats anything but `'gemini'` as no ranking, so both work.
  Redeploy with the usual command when the owner says deploy.
- **Other screens:** `ActivityCard` keeps only the "Ended" pill; Home
  hero has no score and no reasons line; `MapPage` list and preview have
  no pills; `ActivityDetailsPage` lost the pill and the "Why this / Match
  reasons" panel (and its More link); `ProfilePage` has two stats
  (Joined, Hosting); `SettingsPage` lost the Matching weights row;
  `WelcomePage`'s stage card shows "Gemini's top pick" instead of "92%
  match"; `Shell.jsx` lost the `weights` title and the
  `recommendations-details` view word.
- **i18n:** groups `weights`, `pickDetails`, `signals` removed; keys
  `settings.weights/weightsHint`, `titles.weights`, `reasons.default`,
  `activity.whyThis/matchReasons`, `common.match/noScore`,
  `profile.topMatch/activity`, `picks.howEyebrow/howTitle/howLead/
  changeWhatMatters` removed; `picks.sourceStandard` → `picks.sourceNone`;
  added `picks.topPick`, `picks.unrankedEyebrow`, `picks.unrankedTitle`;
  `picks.fallback.*`, `picks.improveLead`, `welcome.stage.why` reworded —
  all four languages, `json.dumps` formatting. `reasonText` returns `''`
  for a code with no wording (`i18n.exists`), so callers drop it.
- **CSS:** rules for `.weight-*`, `.score-card`, `.how-strip/list/
  swatch/label/share`, `.hero-score`, `.hero-why`, `.preview-match`,
  `.detail-hero .match-pill` removed; `.top-pick-score` → `.top-pick-badge`
  (a label, not a number); `.ai-source[data-state='none']`; the wide AI
  Picks layout is no longer two columns (nothing sits beside the hero);
  `.how-privacy` has a little air under the lead.
- **Docs:** README §10 rewritten, project structure updated;
  ARCHITECTURE (data-flow stage, "Discovery order", the Gemini diagram,
  guard table, ten-minute test pass); DECISIONS ADR-030, ADR-006/029
  marked superseded/amended, the two exhibition answers rewritten — the
  "measured, not asserted" answer is now about checkability, since
  Gemini's ranking is unmeasured; EVALUATION.md kept with a historical
  banner; FIXLIST; CLAUDE_HANDOFF.

### Verified

- `npm run test:unit`: 74 files, 851 tests pass (was 899: −73 engine/
  sliders/counter, +25 compatibility, +1 picks). `npm run lint` clean,
  `npm run build` clean. Functions' own suite: 38 pass.
- Localhost (Vite + emulators + `scripts/fake-gemini.mjs`): AI Picks
  "Ranked by Gemini · Just now", hero "Gemini's top pick" with three
  reasons, four cards with reasons where the model gave them; stand-in
  stopped + Refresh → "Not ranked. Gemini could not be reached, so here
  is what is on, soonest first." with no hero and five cards in time
  order; stand-in restarted + Try again → ranked again; Home, the
  activity page, the map list, the profile and Settings without the
  score or the weights row; `/weights` → Page not found; phone width;
  no console errors.
- Not run: the rules suite (rules unchanged) and the live site (nothing
  deployed).

### Also in this working tree — place names to Gemini (ADR-031)

Asked for after the engine removal, built on top of it, same state (NOT
committed, NOT deployed). The owner asked whether Gemini should know
place names; I said the gain was modest and the privacy line would have
to change; they chose to build it.

- `functions/lib/picks.js`: `placesBefore` in `cleanSignals` (via
  `cleanList` with a 60-char cap; `same()` moved up), `place` on the
  candidate, both in `signatureOf`, `place` in `REASON_CODES` and
  `trueReasons` (activity's place ∈ placesBefore, case-insensitive; an
  empty place never matches), the instruction lists the code and treats
  place names as data; `buildPrompt` sends `placesBefore` and `place`.
- `src/services/aiPicks.js`: `placeName()` (fold whitespace, 60 chars),
  `placesBefore(joinedActivities)` (once each whatever the casing, ≤12,
  order of the joined list), in `signalsOf`; `candidateOf.place`;
  `picksSignature` includes `p`; `reasonFacts('place')` →
  `{ key: 'place', place }` or null when no name.
- `src/i18n/index.js` passes `place`; locales: `reasons.place` (after
  `distance`) and `picks.privacy` reworded, four languages.
- `scripts/fake-gemini.mjs`: `place` code (ranked above time/distance so
  it shows locally), fit = interest 2 + history 1 + place 1.
- Tests: `picksServer` (+1: cleaning/caps/refusal; signature; prompt;
  trueReasons), `aiPicks` (+1: `placesBefore`; candidate `place`;
  request carries the name but no coords/uids), `recommendationsPage`
  (+1: worded in English and Thai; a pick with `place` on an activity
  with no name shows no reason). 854 unit/app.
- Verified in the emulator: I added `activities/place-test-1` ("Board
  Games at Siam Square", Gaming, 2026-09-24 19:00, host June Park) by
  the REST owner token because the demo admin had joined Bangkok Night
  Gamers at Siam Square; AI Picks then made it the top pick with "At
  Siam Square, where you've been before", and the Function's answer
  carried `["interest","history","place"]`. The document is still in
  the dev emulator — delete it if unwanted:
  `curl -X DELETE -H "Authorization: Bearer owner"
  "http://127.0.0.1:8181/v1/projects/demo-smartsync/databases/(default)/documents/activities/place-test-1"`.
- Docs: README §10 (what goes out, the codes), ADR-029 amendment note,
  ADR-031, FIXLIST, CLAUDE_HANDOFF.

### To finish, when the owner says so

1. `git add -A && git commit` (one commit, or two: the engine removal
   and "Place names to Gemini, by name only"; co-author line on each),
   `git push`.
2. `npx firebase deploy --only functions:recommendActivities --project
   smartsync-c1f07` (the `'none'` wire value and the prompt without the
   score) and `npx firebase deploy --only hosting --project
   smartsync-c1f07 --non-interactive`.
3. Two untracked directories, `output/` and `tmp/` (word-break files
   from 2026-09-21 23:05–00:04), are not SmartSync's and were not
   touched; do not `git add` them.

## Latest continuation — AI Picks through Gemini (2026-09-21)

The owner's spec: AI Picks ranked by the Gemini API, personalised from
interests, joined categories, preferred time and distance; real eligible
activities only; structured answers with validated ids and data-backed
reasons; the key server-side; minimal data out; clear loading / retry /
empty states; graceful fallback; cost control; four languages; documented
setup. Built and verified on localhost against a stand-in Gemini server,
then put live the same evening: the owner upgraded `smartsync-c1f07` to
**Blaze**, created a Gemini API key in AI Studio, stored it with
`firebase functions:secrets:set GEMINI_API_KEY` (version 1, project
1027577281868), and deployed `functions:recommendActivities` + the rules
(`✔ Deploy complete!`, cleanup policy 14 days). The push Functions
(`onNotificationCreated`, `cleanupPushTokens`) are still **not** deployed
— that deploy was `--only functions:recommendActivities`; they also need
`VITE_FCM_VAPID_KEY`. Committed as "AI Picks through Gemini: a re-ranker
with reasons the data supports" and pushed; hosting deployed after.

### What was built

- `functions/lib/picks.js` (new, pure) — `validateRequest` (signed-in
  app's shape only: ≤ 40 candidates, ids `[A-Za-z0-9_-]{1,64}`, titles
  ≤ 80, descriptions ≤ 240, control characters stripped, numbers ranged,
  time bands from the three, interests/history ≤ 12), `signatureOf`
  (sha256 of signals + sorted ids), `buildPrompt` (system instruction +
  `PERSON:` / `ACTIVITIES:` JSON; descriptions declared data),
  `RESPONSE_SCHEMA` (picks ≤ 8 × {id, reasons ≤ 3 from the 8 codes}),
  `trueReasons` (what each code needs: interest ∈ interests, history ∈
  joined, time band equal, distance known and ≤ 3 km, similar, ≥ 60 %
  full, ≤ 1 day ahead, 1–3 spots), `parsePicks` (unknown ids and repeats
  dropped, codes filtered to the true ones, null when nothing usable),
  `rateWindow` (fixed-window arithmetic).
- `functions/lib/gemini.js` (new) — `geminiRanker({ apiKey, model,
  baseUrl, timeoutMs })` over `@google/genai` 2.23 (`ai.interactions.create`
  with `system_instruction`, `store: false`, `generation_config:
  { max_output_tokens: 1024, thinking_level: 'low' }`, `response_format:
  { type: 'text', mime_type: 'application/json', schema }`, one retry,
  20 s timeout); `classifyError` (429 → rate-limited, 5xx/timeout →
  unavailable, other 4xx → invalid); `DEFAULT_MODEL = 'gemini-3.5-flash-lite'`
  (the current stable "fastest, most cost-effective" model per
  ai.google.dev/gemini-api/docs/models; the Interactions API is GA since
  June 2026 and recommended for new projects, `generateContent` is
  legacy but supported).
- `functions/lib/recommend.js` (new) — `recommend({ db, uid, signals,
  candidates, force, ranker, now, log, caps })`: cache doc
  `aiPicks/{uid}` (signature, picks, model, createdAt; 10-minute TTL;
  `force` bypasses), one transaction over `aiPicks/{uid}.calls` (10 per
  hour) and `aiPicksUsage/{day}.count` (1,500 per day), then the ranker;
  every outcome a value — `{ source: 'gemini', picks, model, createdAt,
  cached }` or `{ source: 'standard', reason: 'not-configured' |
  'rate-limited' (+ retryAfterSeconds) | 'unavailable' | 'invalid' }`.
- `functions/index.js` — `recommendActivities = onCall({ region:
  'us-central1', secrets: [GEMINI_API_KEY], timeoutSeconds: 30, memory:
  '256MiB', maxInstances: 5 })`: unauthenticated → `HttpsError`, bad shape
  → `invalid-argument`, else `recommend`. Env: `GEMINI_MODEL`,
  `PICKS_USER_HOURLY_CAP`, `PICKS_DAILY_CAP`; `GEMINI_BASE_URL` honoured
  under the emulator only. `@google/genai` added to `functions/package.json`.
- `firestore.rules` — `aiPicks/{uid}` and `aiPicksUsage/{day}` denied
  explicitly (rules test "AI Picks"). **Rules must be released with the
  Function** (they compile and pass today; nothing else changed).
- `src/firebase/functions.js` (new) — `getFunctions(app, 'us-central1')`,
  emulator on 5001 (`VITE_FUNCTIONS_EMULATOR_PORT` to override),
  `recommendActivitiesCall` (35 s client timeout).
- `src/services/aiPicks.js` (new, pure) — `signalsOf` (known interests,
  history = profile's `historyCategories` ∪ joined list with counts,
  preferred time, `hasLocation`), `candidateOf` (facts only; an unknown
  distance stays null — `Number(null)` is 0, which was a real bug caught
  in the browser), `chooseCandidates` (best 40 by score),
  `buildPicksRequest`, `picksSignature`, `reasonFacts` (code → the
  `reasonKeys` shape `reasonText` already words), `resolvePicks` (ids ∩
  on screen, engine reasons when the model gave none), `standardPicks`,
  `improveHints` / `thinProfile`.
- `src/hooks/useAiPicks.js` (new) — module-level answer cache keyed
  `uid|signature`; status derived, not set (React Compiler lint forbids
  setState and `Date.now()` in render/effects: a kept answer is shown
  even past its time while the effect re-asks); 1.2 s debounce; `refresh`
  (force, past both caches) and `retry`; `forgetAiPicks()` for tests.
- `src/pages/RecommendationsPage.jsx` — rebuilt: headline; `.ai-source`
  bar (asking / "Ranked by Gemini · 2 min ago" + Refresh / "Standard
  picks." + reason + Try again; `role="status"`); hero = pick #1 with its
  reasons (skeleton hero while asking); "How this works" panel (lead now
  names Gemini; privacy line `picks.privacy`); "Also for you" cards each
  with a `.ai-pick-why` line; "Within your discovery filters (n active)"
  note with Adjust; empty state for no eligible activities; "Get better
  picks" panel for thin profiles (join / interests / time / location →
  `/home`, `/interests`, `/profile/edit`, `/privacy`); then the unchanged
  grouped-by-interest list (standard, unfiltered), the missing-interests
  note and the people banner. Candidates exclude what you already joined.
- `src/i18n/index.js` — `reasonText` passes `count` (for `reasons.spots`).
- Locales (all four): `picks.lead`, `howLead` reworded; new `asking`,
  `sourceGemini`, `sourceStandard`, `refresh`, `alsoForYou`,
  `withinFilters_*`, `emptyTitle`, `emptyBody`, `emptyBodyFilters_*`,
  `fallback.{unavailable, rate-limited_*, not-configured, invalid, stale,
  error}`, `improveEyebrow`, `improveTitle`, `improveLead`,
  `improve.{join, interests, time, location}`, `privacy`;
  `reasons.soon`, `reasons.spots_*`.
- `src/styles.css` — `.ai-source` (+ `[data-state]`, pulse while asking,
  reduced-motion), `.ai-refresh`, `.top-pick-loading`, `.ai-pick`,
  `.ai-pick-why`, `.how-privacy`, `.improve-panel`, `.improve-list`.
- `scripts/fake-gemini.mjs` (new) — stand-in Interactions API server
  (rank / error / quota / garbage / slow modes). `functions/.secret.local`
  and `functions/.env.local` are ignored (`.secret.local` added to
  `.gitignore`); the owner's copies point at the stand-in.
- Docs: README §10 "AI Picks: Gemini on top of the engine" (flow, secrets,
  billing, deploy, local stand-in, tunables), ADR-029, ARCHITECTURE (new
  feature section + guard table rows), FIXLIST, CLAUDE_HANDOFF.
- Tests: `tests/unit/picksServer.test.js` (38: validation, cleaning,
  signature, prompt contents and absence of personal fields, schema,
  trueReasons, parsePicks, rateWindow, classifyError, and `recommend`
  over a Map-backed fake Firestore: ask/keep/count, cache hit and expiry,
  force, not-configured, per-person and per-day caps, failures),
  `tests/unit/aiPicks.test.js` (13), `tests/app/recommendationsPage.test.jsx`
  (10: request timing and contents, answer rendering with reasons,
  re-render is not a request, refresh forces, changed question re-asks,
  rate-limited fallback + Try again, callable failure + retry, stale id
  dropped, empty state, hints, Thai), rules "AI Picks".

### Verified

- Emulator + stand-in, from the browser as the owner's account: "Asking
  Gemini…" → "Ranked by Gemini · Just now" with the hero and cards and
  reasons; Refresh → asked again (`force: true`, `cached: false`); the
  second identical request from curl → `cached: true` with a single POST
  to the stand-in; ten forced calls as Maya → the eleventh
  `rate-limited`, `retryAfterSeconds` ≈ 3,390; the browser account put at
  the cap → "Standard picks. Gemini has been asked a lot… Try again in
  60 minutes." with the engine's order; stand-in in error mode → "Gemini
  could not be reached" (two attempts, ~400 ms); garbage mode → `invalid`
  (unit); the bundle contains the Function's name and no Gemini string
  (`grep` of `dist/assets`). Phone and laptop, light and dark.
- The `.secret.local` / `.env.local` route works in the emulator (the
  Function read the fake key and the base URL without a restart).

### Setup that was done (owner-only), for the record

1. `smartsync-c1f07` upgraded to **Blaze** (2026-09-21). Set a budget
   alert if one is not there yet.
2. Gemini API key created in Google AI Studio (free tier; its "content
   may be used to improve products" terms apply — enabling billing on the
   key's Cloud project changes that).
3. `npx firebase functions:secrets:set GEMINI_API_KEY --project smartsync-c1f07`
   → version 1. To rotate: run it again (a new version), then redeploy
   the Function so it picks the latest up.
4. `npx firebase deploy --only functions:recommendActivities,firestore:rules --project smartsync-c1f07`
   — the first run failed with "no latest version of the secret" only
   because it ran before Enter was pressed on step 3; the second run
   created the Function. Then hosting.
5. Optional, still open: `functions/.env` with `GEMINI_MODEL`,
   `PICKS_USER_HOURLY_CAP`, `PICKS_DAILY_CAP` (read at deploy); App Check
   on the callable if abuse ever matters; push Functions + VAPID.
6. Live check: an unauthenticated POST to
   `https://us-central1-smartsync-c1f07.cloudfunctions.net/recommendActivities`
   answers `UNAUTHENTICATED` "Sign in to get recommendations."; signed
   in, AI Picks reads "Ranked by Gemini"; the Functions log line
   `ai picks ranked` carries token counts.
7. The first live open showed "The recommendation service could not be
   reached" — the hosting **Content-Security-Policy** in `firebase.json`
   had no Cloud Functions host in `connect-src`, so the browser refused
   the fetch before it left (console: "violates the following Content
   Security Policy directive"). `https://us-central1-smartsync-c1f07.cloudfunctions.net`
   added and hosting redeployed. A Function in another region would need
   its own host there.
8. Then "Gemini gave an answer the app could not use" twice, for two
   different reasons, both read from the Function log (`kind: invalid`):
   **401** — the first secret was the key pasted twice (106 characters;
   current AI Studio keys are 53 characters starting with `AQ.`, not
   `AIza…`); re-set as version 2 and the CLI's "re-deploy and destroy
   the stale version" answered Yes. **402** — the key is valid but the
   API answers "Your prepayment credits are depleted. Please go to AI
   Studio at https://ai.studio/projects to manage your project and
   billing": the AI Studio project is on **Prepay** with no balance.
   The owner bought **$5 of prepay credits** (AI Studio → Billing); the
   API answered from then on. Prepay credits expire after 12 months and
   run down at flash-lite's $0.30 / $2.50 per million tokens — a live
   request is ~1,100 tokens, so $5 is tens of thousands of them; when
   the balance hits zero every key in that billing account answers 402
   again and the page shows the standard picks. The key was also pasted
   into the shell once, in the clear, on the owner's own screen —
   regenerate it in AI Studio if that ever matters.
9. The Function's `log.warn` used a `message` field that overwrote the
   entry's message (the API's wording was lost); now `detail`. Function
   redeployed (`f3f2d22`).
10. With credits, the first live answer was `{"picks": []}` — the demo
    account's interests matched none of the five activities and the
    model read "fit this person best" as "only what fits well"; the
    page fell back with "gave an answer the app could not use". The
    system instruction now says to rank the supplied activities by
    whatever fits when nothing matches interests or history (an empty
    reasons list is fine, an empty picks list is not) and the schema has
    `minItems: 1`; reproduced and then verified against the live model
    (`43463df`, Function redeployed). **Live and working since 14:55
    UTC on 2026-09-21:** "Ranked by Gemini · Just now", hero + four
    picks with reasons, log line `ai picks ranked … candidates 5, picks
    5, tokens 1112`.

## Latest continuation — discovery filters as sets (2026-09-21)

The owner's spec for multi-select discovery filters, implemented point by
point, verified on localhost against the emulator, reviewed by the owner
there, then committed as "Discovery filters as sets: any categories, any
times, one predicate" and pushed. Hosting was then deployed (bundle
`index-DYVFHfV6.js`, carrying the bell's badge as well); no rules or index
change (the filters never leave the device).

- `src/utils/filters.js` (new) — the one place that knows the filters'
  shape. `defaultFilters = { categories: [], maxDistance: 10, timeBands: [],
  availableOnly: true }`; `DISTANCE_RANGE = { min: 1, max: 15 }`;
  `normaliseFilters(stored)` reads either the new shape or the old one
  (`category: 'All' | name`, `timeBand: 'Any' | band` → set of one, or
  empty for All/Any), keeps only vocabulary members in vocabulary order,
  clamps the distance to the slider and rounds it, and falls back field by
  field; `toggleChoice(chosen, value, vocabulary)`; `matchesFilters(activity,
  filters)` — OR within each set, AND between the four groups, an unknown
  distance never hides anything; `activeFilterCount` / `filtersActive`
  (each chosen category and band counts one, distance and switch count one
  each when off their defaults). ADR-028 records the "empty means
  everything" choice and why the storage schema version was not bumped.
- `src/context/AppContext.jsx` — `defaultFilters` moved out (import it
  from `utils/filters`); state initialised through `normaliseFilters`, so an
  old stored shape is migrated on load and written back new by the existing
  save effect; `filteredActivities` is `recommendations.filter(matchesFilters)`.
- `src/pages/FilterPage.jsx` — `ChoiceGroup` (a `fieldset` with a legend,
  a count chip "2 selected" when non-empty, a hint, an "all" toggle button
  with `aria-pressed` that empties the group, and a real
  `<input type="checkbox">` inside a `<label class="choice-chip">` per
  option, with a `.choice-mark` check). Draft state as before; Apply →
  `setFilters(draft)` + `/home`; Reset → defaults, applied at once.
- `src/pages/SearchPage.jsx` — `filtersActive` now `filtersActive(filters)`
  from the module (the old key-by-key `!==` would be true forever with
  arrays). Title-only search and the empty-input prompt untouched.
- `src/pages/HomePage.jsx` — the Filter button carries `data-active`, a
  `.tool-count` with the number of choices in force and `aria-label`
  `home.filterActive` ("Filter, {{count}} active").
- `src/components/FiltersEmptyState.jsx` — "Adjust filters" (→ `/filters`)
  beside "Clear filters", in `.button-row.filters-empty-actions`.
- `src/styles.css` — `.choice-group / legend / .choice-count / .choice-grid`
  (auto-fill, min 148px → 2 columns on a phone, 4 on the 760px page),
  `.form-card .choice-chip` (46px tall, selected = accent-soft), the hidden
  input, focus ring on the chip via `:focus-within` minus
  `:has(input:focus:not(:focus-visible))`, `.choice-mark`, `.choice-all`
  (round mark); `.discover-tools button[data-active='yes']` + `.tool-count`;
  `.filters-empty-actions` (natural widths, the primary's own margin
  zeroed); `.compact-row > span:first-of-type` stacks the switch row's
  title and hint (it keyed on the span being second, after an icon this
  row never had — a pre-existing slip on this page).
- `src/utils/storage.js` — comment only: why `SCHEMA_VERSION` stays 3.
- Locales (all four): `filters.category` → "Categories", `categoryHint`,
  `allCategories`, `time` → "Time of day", `timeHint`, `anyTime`,
  `selected_one/_other`; `filters.all` and `filters.any` removed;
  `filtersEmpty.body` reworded, `filtersEmpty.adjust`;
  `home.filterActive_one/_other`; `settings.discoveryHint` now names
  categories and times in the plural.
- Tests: `tests/unit/filters.test.js` (14), `tests/app/filterPage.test.jsx`
  (7), `tests/app/appContext.listeners.test.jsx` "the discovery filters"
  (3). Docs: ADR-028, FIXLIST, ARCHITECTURE (pipeline table + a paragraph),
  CLAUDE_HANDOFF (ideas table, files table).
- Verified in the emulator app as Maya: Football + Basketball + Morning +
  Evening → "Filter 4" on Discover and the empty state (nothing upcoming
  fits); Coffee + Running + Morning + Evening → exactly "Google Maps
  verification" (Coffee, evening) and "Benjakitti Easy Run" (Running,
  morning), not "Coffee & New Connections" (afternoon); search "connect"
  → not found with "Clear filters and search again", which then finds it;
  the old shape `{category:'Coffee', timeBand:'Afternoon', maxDistance:8,
  availableOnly:false}` seeded into `localStorage` → page shows Coffee +
  Afternoon + 8 km + switch off and storage is rewritten as sets; Reset →
  defaults stored; map empty state with both buttons, pins back after
  Clear; phone viewport, light and dark; keyboard focus ring on a chip,
  none on a tapped one. (Synthetic Space from the browser tool does not
  toggle a checkbox — a known limitation of the tool, not the page; the
  tests cover toggling.)

**Checks at the time of writing:** unit/app 838 / 838; lint, Prettier and
the build clean. Rules unchanged, so the rules suite was not re-run.

## Latest continuation — the bell's unread badge (2026-09-21)

The owner's spec for the notification badge. Most of it already existed
(badge top-right of the bell, hidden at zero, live via the inbox
listener, cleared on account switch); this pass closed the gaps.
Reviewed by the owner on localhost (with 100 test notifications dropped
into the emulator inbox and removed afterwards), then committed as
`9026377` and pushed. Hosting was deployed later the same day, together
with the discovery filters (bundle `index-DYVFHfV6.js`); no rules or
index changes (the new query is a single-field equality on the owner's
own subcollection, which the existing `allow read: if isSelf(uid)` covers;
a rules test proves it).

- `src/firebase/notifications.js` — `UNREAD_CAP = 100`,
  `watchUnreadCount(uid, cb, onError)`: `onSnapshot` over
  `where('read', '==', false)`, `limit(100)`, callback gets `snap.size`.
  Its own listener because the inbox holds only the newest 50 (+20
  moderation notices), so a count taken from it stopped at fifty.
- `src/context/AppContext.jsx` — `unreadCount` state, reset to 0 in the
  uid-change block with the rest, subscribed beside the inbox listener
  (quiet on permission-denied, which the inbox listener already reports),
  exposed on the context value.
- `src/components/Shell.jsx` — both bells read `unreadCount`; badge text
  is the number to 99 then "99+"; `aria-label` (and the web header's
  `title`) is `shell.notificationsUnread` ("Notifications, {{shown}}
  unread", plural-keyed) when > 0, else `shell.notifications`; the badge
  span is `aria-hidden`.
- Tests: `tests/app/shellLayout.test.jsx` (0 / 1 / 3 / 99 / 100 / Burmese,
  labels, aria-hidden), `tests/app/appContext.listeners.test.jsx` (the
  seventh listener opens and closes; count follows the listener; a new
  account starts at 0 — the "five listeners" describe is now "the data
  listeners"), `tests/rules/firestore.test.js` (owner may run the unread
  query, another account may not).
- Verified in the emulator app through real documents written with the
  owner token: 2 → an arrival → 3 → 100 more → "99+" (label
  "Notifications, 99+ unread") → Mark all read on the inbox page → no
  badge (opening the inbox did not clear it; the button did) → two set
  unread outside the inbox window → badge 2 while the list shows none
  unread (the case the dedicated listener exists for) → one tapped in
  the list → 3 → 2. Phone and web headers, light and dark. The test
  documents were deleted afterwards and the two originally-unread chat
  notifications restored.

**Checks at the time of writing:** unit/app 814 / 814, rules 383 / 383,
integration 8 / 8; lint, Prettier and the build clean.

## Latest continuation — Current warnings, second pass (2026-09-21)

The owner's written spec for the Settings card, implemented point by
point on top of the first pass below. Reviewed by the owner on localhost,
then committed ("Current warnings: first on the page when there are
any, and said in words") and deployed to hosting the same day (no rules
or index changes in this pass).

- `src/pages/SettingsPage.jsx` — one `warningsCard` element rendered in
  one of two slots: first on the page when `active > 0`, under the
  preferences card otherwise. `active` is 0 while loading or after an
  error, so the card never claims a clean record it has not seen. The
  card is a single `<button class="setting-row warnings-row">` with
  `aria-describedby="warnings-body"`; inside: icon tile, heading with a
  `.warnings-count` badge in words, the explanation, and a
  `.warnings-link` "View warnings ›" label (a span — the button is the
  control).
- `src/styles.css` — `.warnings-row` (two columns, focus ring with
  `outline-offset: -3px` because `.settings-card` clips overflow),
  `.warnings-link`, `.warnings-count`, `.warnings-card.has-warnings`
  (amber tokens `--warning*`, both themes).
- Strings, four languages, under `settings`: `warningsChecking`,
  `warningsNone`, `warningsActive_one/_other`, `warningsBadge_one/_other`,
  `viewWarnings`; removed `warningsHint`, `warningsCount_*`. th/my/zh
  carry `_other` only (the parity test folds plurals).
- `tests/app/settingsWarnings.test.jsx` — six tests: checking state,
  quiet state and placement, active state (first on the page, badge
  words, explanation, `aria-describedby`), failed read, keyboard
  (real button, focusable, opens `/warnings`), Thai.
- Not applicable: "resolved or expired" warnings — the data model has no
  status or expiry; a warning is a permanent record by design (rules
  refuse edits and deletes), so the count is every warning on the
  record.
- Verified in the emulator app: a warning placed on the signed-in
  account moved the card to the top and turned it amber live, removing
  it moved it back down to "No active warnings"; Tab reaches the card
  and the ring draws inside it; both themes; 375px and 1280px. The
  browser tool's synthetic Enter does not activate buttons, so Enter/
  Space activation rests on the element being a native `<button>`.

**Checks at the time of writing:** unit/app 810 / 810 (71 files), lint,
Prettier and build clean; rules/integration untouched by this pass (last
run 382 / 382 and 8 / 8 on `ecc2101`).

## Latest continuation — profile banner, warnings card, 75-word bio (2026-09-21)

Three features the owner had listed, built one after another in Claude
Code and reviewed on localhost before release. Details in FIXLIST ("The
profile across the top…") and ADR-027; the CLAUDE_HANDOFF table marks
them done.

- **Profile on laptops** — from 1024px one tall gradient panel down the
  left (card + overview; the owner rejected a horizontal banner and a
  full-width stacked card, and asked for "vertically full profile at the
  left side and joined activities on the right side"), joined activities
  in cards on the right. `ProfilePage.jsx` wraps the card and overview in
  `.profile-column` (`display: contents` on phones) and renders six recent
  cards (phones show two via CSS); the layout is in the DESKTOP block of
  `src/styles.css`. The card was then reworked at the owner's request
  ("better UI", "edit profile somewhere the user can see"): ring on the
  picture, handle under the name, interests as chips on the card, a white
  **Edit profile** button on the card (`.profile-edit`), three stats
  (joined / hosting / top match — `profile.hosting`), and an empty state
  for no joined activities (`profile.findActivities`). Then recoloured at
  the owner's request ("the purple doesn't suit"): the card and the
  laptop panel are a dusky indigo — the mark's lilac carried down into
  its ink, cream text, lilac light and ring — settled after the owner
  found the icon's near-black too dark and a blue-indigo too bright
  ("match the logo colourway, not too dark, not too bright"); tokens
  `--profile-ink` / `--profile-ink-2` / `--profile-line` in both theme
  sets.
- **Current warnings** — `src/hooks/useMyWarnings.js` (shared with
  `WarningsPage`), a `.warnings-card` in `SettingsPage.jsx`, strings
  `settings.warnings` (now "Current warnings") and `settings.warningsCount`
  (plural) in four languages. Tests that render Settings mock
  `watchMyWarnings`; `tests/app/settingsWarnings.test.jsx` covers the
  states.
- **Bio** — `firestore.rules` `validBio()` (75 words by `\s+`, 500
  characters), `src/utils/bio.js`, the editor's counter/refusal, strings
  `editProfile.bioHint/bioCount/bioTooLong`. `.profile-center p` keeps
  line breaks. **Release order: rules before hosting** — a build that
  allows 500 characters against rules that allow 300 refuses saves.

**Verification:** unit/app suite, rules suite (382, including the new bio
case), lint, Prettier and the build — figures in the commit message. In
the emulator app: a 72-word / 400+-character bio saved through the new
rules and renders on the phone and the banner; 82 words was refused
before the round trip with the reason; a warning placed on the signed-in
account turned the Settings card amber with a count of 1, live, and its
row opened the record; the card is quiet with nothing on the record.

## Latest continuation — Google Maps migration (2026-09-21)

**Deployed:** implementation commit `1adfa05`, hosting bundle
`index-jHb5xmTm.js`, released and checksum-verified 2026-09-21 at
<https://smartsync-c1f07.web.app/map>. Started from clean `main` at `78c9093`.
The owner requested Google Maps instead of Leaflet/OpenStreetMap, then
explicitly authorized completing cloud setup, testing, commit/push and
deployment. Hosting now uses Google Maps.

- Added the shared `services/googleMaps.js` loader, `GoogleMap` adapter,
  `ActivityMapPins` and coordinate helpers. Discovery keeps clusters, pin
  previews, the desktop list, location control and Thailand bounds. Create/
  Edit Activity uses the same provider and keeps its existing saved fields.
- Maps stay stable while typing in forms and during ordinary live updates.
  Coincident activity pins remain selectable. Loading/network/authentication
  failures show localized status and retry controls in all four languages.
- Removed Leaflet packages, CSS, asset chunk and OpenStreetMap tile host;
  added Google's resource domains to hosting CSP. Script inline/eval
  restrictions remain intact. No Firestore or permission changes.
- Moved mobile floating actions above Google's attribution row after the
  real browser check caught the create button overlapping it.
- Added `npm run check:maps` to hosting's predeploy step. It rejects missing
  production configuration or `DEMO_MAP_ID` without printing key values.
  `.env.example`, README, architecture and ADR-026 explain the setup.

**Google configuration completed:** the owner connected Google Cloud project
`genial-airway-509303-f6` using their existing trial/billing setup. The
`SmartSync Web Maps` browser key is restricted to Maps JavaScript API and the
four production/local website referrers in [GOOGLE_MAPS_SETUP.md](GOOGLE_MAPS_SETUP.md).
Created `SmartSync Web Map`, a JavaScript raster map ID, in the same project.
Both `VITE_GOOGLE_MAPS_API_KEY` and `VITE_GOOGLE_MAPS_MAP_ID` are saved in
ignored `.env.local` and `.env.production`; actual values are not in git.
No billing activation, terms acceptance or Firebase plan changes were made
by the agent. Google configuration checks pass.

**Verification:** all 801 unit/rendering tests passed, including 13 additional
checks for SDK loading/retry/auth errors, Strict Mode cleanup, marker events,
pin selection and view stability. Lint, source formatting, `git diff --check`
and the configured production build pass. The build retains the existing
Firebase chunk-size and photo-module chunking warnings. Security/Functions
suites were not rerun because their code and rules are unchanged.

**Real browser checks:** Google tiles, native zoom controls, dark styling,
markers and attribution load with no Google or CSP errors. Tested a 390 px
mobile map/picker and a 1440 px desktop map/list; list selection focuses the
correct pin, a separable cluster zooms into its activities, and overlapping
pins cycle through activities. In the local emulator, created `Google Maps
verification`, selected a pin, renamed its location without moving the pin,
saved, reopened, replaced the pin, saved again and reloaded. The edited
coordinates persisted at `13.7563, 100.5022`. The test activity remains in the
dev emulator (`uxzaMJg4LtKZeQikqBcS`); no production test activity was created.
Device GPS permission was not requested; the existing location code is
unchanged. Real light-theme verification has not been recorded.

**Hosting CSP check:** served an optimized emulator build at the existing
local origin with the hosting headers from `firebase.json`, adding only the
local Auth/Firestore endpoints to `connect-src`. Google's production script,
image, worker and frame restrictions remained exact; map/picker rendering and
interaction passed with no console warnings/errors. Temporary server/build
files are under `/private/tmp/smartsync-maps-csp*`, outside the repository.

**Release verification:** committed and pushed `1adfa05`, then deployed
**hosting only** to `smartsync-c1f07`. `/`, `/map` and `/create` return HTTP 200
and the exact production HTML/CSP. The entry script, Google Maps chunk
(`GoogleMap-DqPIyr81.js`) and CSS (`index-Dq8TPmeh.css`) match the local build
by SHA-256. The owner's existing signed-in production browser loaded native
Google tiles/controls, expanded clusters and opened the correct activity
preview. The live edit picker retained an existing activity's coordinates;
the live create picker accepted a new draft pin. No production activity was
created or edited. No Google Maps errors were reported; the tab retains
older Firestore connectivity/lease log entries from before this release.

The normal Vite server is restored at <http://127.0.0.1:5173>, and the dev
emulator's data is preserved. Browser viewport overrides were reset. The
Google Maps implementation is complete; original production index/admin
walkthrough items below remain outstanding.

## Latest continuation — activity search (2026-09-21)

Changed `SearchPage` to show no cards until a trimmed, nonempty search term
exists. Matches are partial, case-insensitive and based only on activity
titles. Clearing the input restores “Enter an activity name to search.” No
matches shows “No activities found” and “Try another activity name.” Existing
discovery filters remain in effect, with a clear-filters action after an
unsuccessful search. Updated placeholders, labels and messages in all four
languages, and removed the unused location-search and filter-empty wording.

**Verified locally:** the signed-in browser shows no cards for initial or
space-only input; `  nIgHt  ` finds Bangkok Night Gamers; `Gaming` (category)
and `Siam Square` (location) find nothing; `cof` changes the result to Coffee
& New Connections; clearing removes it and restores the prompt. The empty
screen was visually checked. All 788 existing unit/rendering tests, lint,
formatting and the build pass. No backend/rules changes are needed. The build
retains the existing Firebase chunk-size warning.

**Deployed:** implementation commit `4462773`, following the owner's
commit/deploy workflow. Hosting release `index-fs7oX7Ln.js` is live at
<https://smartsync-c1f07.web.app/search>. `/`, `/search` and the JavaScript
bundle return HTTP 200 and match the production build by SHA-256. This release
only deployed hosting; the existing photo rules/indexes remain unchanged.

## 0. Latest continuation — picture uploads (2026-09-21)

**Release requested by the owner.** Started from clean `main` at `feae71b`,
the original hand-off commit. The user requested activity and profile uploads,
previews, replacements and default preservation, then explicitly asked to
commit and deploy so they can review the feature on the live domain.

**Deployed:** implementation commit `355b89f`, released 2026-09-21 to
<https://smartsync-c1f07.web.app>. Rules and indexes were deployed successfully
before hosting. Live bundle `index-BYPnDSKM.js` matches the production build
byte-for-byte (SHA-256); `/`, `/profile/edit` and `/create` return HTTP 200 and
the matching application HTML. The build uses the production Firebase project.

- Added `PicturePicker`, `SavedPicture`, `usePicture`, `utils/pictures.js`
  and `firebase/pictures.js`. JPG/PNG/WebP input through 5 MB is decoded and
  resized before saving. Profile maximum edge: 512 px; activities: 1440 px;
  resized further if needed to fit a 320,000-character raster data URL.
- Persisted in the existing Firestore setup, in separate
  `profilePictures/{uid}` and `activityPictures/{activityId}` documents.
  This avoids requiring Cloud Storage/Blaze. See ADR-025 for limits and
  eventual object-storage migration. No original files are retained.
- Create/edit activity and edit profile show previews and preserve the
  existing image if nothing new is selected. Saved photos appear on cards,
  activity details, the home feature and all existing avatar surfaces,
  including the admin console. Labels and errors cover all four languages.
- Parent marker and picture writes are batched. Profile changes propagate
  `hostPictureVersion` through the existing identity sweep. Offline drafts
  retain selected pictures and compare versions on reconnect. Activity
  hard deletion removes its image in the same batch.
- Rules enforce owner/host permissions, version binding, bounded raster
  data, no collection listing, and private photos while anonymous. Admin
  rank grants no additional photo rights. Added two `dataUrl` index
  exemptions; existing rules were not weakened.

**Verification:** 788 unit/rendering tests, 382 security-rule tests and 8
Auth/Firestore integration tests pass. The integration suite exercises the
application's real save functions, replacement, no-selection edits, activity
deletion with and without a photo, and persistence after signing in again.
Lint, source formatting and `git diff --check` pass. Production build succeeds,
with Vite's large-chunk warning for the Firebase bundle. Push delivery and
trigger suites were not rerun; this change does not touch their code.

**Browser check:** a PNG selection produced a real browser preview. The
owner chose to do the final signed-in save/reload and responsive walkthrough
on production after deployment. These manual checks are not yet recorded as
completed; the credentials rule in §7 still applies to agent browser work.
Vite was restarted at <http://127.0.0.1:5173>; the existing dev Auth/Firestore
emulators were left running. The rules tests used an isolated emulator and
did not reset the development data.

**Release order followed:** commit, deploy `firestore:rules` and
`firestore:indexes`, then hosting. Photo saves and activity deletions depend on
the new picture-collection rules. The owner will do the walkthrough: Profile → Edit
profile → Choose picture; Create activity or an owned activity's Edit page →
Choose picture. The previously unverified production composite-index build
state and live `/admin` walkthrough in §3 remain outstanding.

## 1. Where things stand

|                  |                                                                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live             | <https://smartsync-c1f07.web.app> — hosting bundle `index-jHb5xmTm.js`, built from `1adfa05`, released and checksum-verified 2026-09-21                                                   |
| Repo             | `github.com/Marvin6632710/smartsync`, branch `main`; maps implementation `1adfa05`, search `4462773`, photos `355b89f`                                                                  |
| Deployed         | Hosting as of `1adfa05`; Firestore rules and indexes (including photo-field index exemptions) as of `355b89f`                                                                       |
| **Not** deployed | Cloud Functions in `functions/` (browser push). They need the Blaze plan and a `VITE_FCM_VAPID_KEY`. The live site has no push notifications, which is what README and DEMO_SCRIPT say |
| Local state      | Firebase CLI 15.29.0 signed in as the owner on this machine. A dev emulator and Vite dev server may still be running (see §7)                                                          |

Recent commits, newest first:

- `622ed9c` Record the configured and verified Google Maps release.
- `1adfa05` Replace Leaflet maps with Google Maps for activity discovery and placement — configured restricted browser key/map ID, native markers, preserved saved coordinates, responsive controls, CSP and verification.
- `78c9093` Record the verified activity-search release.

- `4462773` Search activities by name only after a term is entered — empty prompt, title-only matching, no-match message, four locales and browser verification.
- `2e9d231` Record the verified picture-upload release.
- `355b89f` Add profile and activity picture uploads — previews, bounded Firestore storage, owner/host rules, privacy, offline recovery and tests (see §0).
- `feae71b` HANDOFF.md for the next assistant — original hand-off after the console release.
- `0ba6e0b` Rules without the moderator's ban guard — removed the dead `willBeBanned()` helper the rules compiler flagged on release. No behaviour change.
- `fff68bb` One rank that acts: the admin console at /admin, the moderator rank retired — 76 files, the whole feature.
- `ea4fd64` Settings without the Activity messages row
- `f9d1799` Terms & Safety at the door, and a front door that shows the app
- `7973400` Browser push: a copy of the inbox record, sent once, by a Function

## 2. What was completed (session of 2026-09-20 → 21)

The brief was two internal consoles, a Moderator Panel at `/mod` and an
Admin Panel at `/admin`. Both were built and green. The owner then judged the
result too much to explain at the exhibition and chose — in these words —
"just leave the admin role and delete the moderator role completely", and
confirmed that meant the rank itself, in `firestore.rules`, not only the UI.
What shipped:

**Two ranks.** `user` (no `roles` row, or a row with `role: 'user'`) and
`admin`. `roles/{uid}` is `{ role, suspended, banned? }`. A row that still
says `moderator` grants nothing and is rewritten to `user` by the first
decision an admin takes on that account (`patchRole` in
`src/firebase/moderation.js` always writes `role: 'user'`). No migration
script — none is needed.

**Rules (`firestore.rules`).** `isModerator()` no longer exists; every write
that used to take a rank takes `isAdmin()` (= role admin and not suspended):
claim, decision, warn, suspend/lift, close/reopen, take down/put back, the
moderation notice, the log. Invariants worth knowing before touching them:

- a `roles` write must have `role == 'user'`, `suspended` a bool, `banned` (optional) a bool, nothing else; the target is never the caller and never an admin. There is still no way to _create_ an admin from inside the app — that is done once, by hand, in the Firebase console (README §6).
- `warnings` refuse the caller or an admin as subject.
- `moderationLog` entries are created only inside the action transactions: `by == request.auth.uid`, `at == request.time`, `kind` in the six (`suspend, lift, close, reopen, remove, restore` — `appoint`/`dismiss` are refused), and a `getAfter()` check that the subject's post-write state matches the kind. Read: admins. No update, no delete.
- reports: a reporter reads their own, admins read all; the claim lease is `{ by, at }`, 5 minutes (`CLAIM_TTL_MS`), ADR-016; `ModerationError` codes `claim-held`, `already-handled`, `claim-lost`.

**One console at `/admin`** (`src/console/`, lazy chunk `AdminPanel`), five
sections, each one sentence to explain:

| Section    | Does                                                                                                             | Deliberately does not                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Overview   | server counts (Recount), live queue, people, recent timeline                                                     | median age, oldest open, workload                      |
| Reports    | search, status (`open/unclaimed/mine/held/resolved/everything`), type; claim → decide (warn / suspend / dismiss) | triage score, bulk close, date/handler/sort filters    |
| Accounts   | warn · suspend/lift · close/reopen; states `all/suspended/closed/warned/takenDown`                               | anything against an admin or yourself; appoint/dismiss |
| Activities | take down, put back (reason required)                                                                            | —                                                      |
| History    | search + kind over the log, warnings and decisions                                                               | workload table                                         |

Deleted: `ModeratorPanel`, `Dashboard`, `ModeratorsPage`, `SystemPage`,
`src/pages/ModerationPage.jsx` and `src/pages/moderation/*`. `/moderation*`
redirects to `/admin*`; `/mod` never shipped and does not exist. The door is
Settings → Admin console, or the shield in the web header, for `user.isAdmin`.

**Locales** (`src/i18n/locales/{en,th,my,zh}.json`): `activity.moderator.*`
→ `activity.admin.*`; the surviving dashboard keys moved to
`console.overview.*`; 239 dead keys deleted; new admin wording added in all
four languages. The Terms and welcome copy still say "A moderator reviews
every report" **on purpose** — see §4.

**Docs** updated in the same commit: README §1, §6 (making the first admin),
§12; ARCHITECTURE §4 "The admin console"; DECISIONS — ADR-011 superseded
banner, ADR-023 amended banner, Q&A retitled "Who watches the admin?", new
ADR-024 "One rank that acts, and one console small enough to explain";
FIXLIST entry "One rank, one console, 2026-09-21"; ROADMAP paragraph.

### Files changed in `fff68bb` (76) and `0ba6e0b` (1)

- Rules and indexes: `firestore.rules`, `firestore.indexes.json` (adds `reports (status ASC, reviewedAt DESC)` and `activities (status ASC, startsAt ASC)`).
- Console (new): `src/console/{AccessDenied,AdminPanel,ConsoleContext,ConsoleLayout,DeskDialogs}.jsx`, `console.css`, `history.js`, `hooks.js`, `useDesk.js`, `pages/{AccountDetails,AccountsPage,ActivitiesPage,HistoryPage,Overview,ReportDetails,ReportsPage}.jsx`, `ui/{DataTable,DetailPanel,Filters,Timeline,index}.jsx`.
- App: `src/App.jsx`, `src/components/{ConfirmDialog,ReportDialog,Shell}.jsx`, `src/context/{AppContext,AuthContext}.jsx`, `src/firebase/{moderation,users}.js`, `src/hooks/usePeopleSearch.js`, `src/i18n/{index.js,notificationKinds.json,notificationText.js,reportContext.js}`, four locale files, `src/pages/{ActivityDetailsPage,SettingsPage,WarningsPage,WelcomePage}.jsx`, `src/styles.css`.
- Deleted: `src/pages/ModerationPage.jsx`, `src/pages/moderation/{ModeratorList,PeopleDirectory,RemovedActivities}.jsx`, `tests/app/moderationPage.test.jsx`.
- Tests: `tests/app/console/{consoleAccounts,consoleAdmin,consoleGuards,consoleI18nTheme,consoleReports}.test.jsx` + `fixtures.js` (new), `tests/app/consoleRoutes.test.jsx` (new), `tests/unit/consoleHistory.test.js` (new), `tests/rules/{firestore,moderation-log,roles-matrix}.test.js`, `tests/app/{activityPagesLoading,firstEntry,moderationClaims,moderationFailures,moderationIdempotent,shellBanner,shellLayout,signOutFailure}.test.*`, `tests/unit/{notificationText,pushPolicy}.test.js`.
- Docs: `ARCHITECTURE.md`, `DECISIONS.md`, `FIXLIST.md`, `README.md`, `ROADMAP.md`.

## 3. What is unfinished, and exactly where I stopped

There is no half-done code. The last actions, in order: the owner tested the
console on localhost against the emulator and said it works → commit
`fff68bb` → `firebase deploy --only firestore:rules` (compiler warned that
`willBeBanned()` was unused) → removed it, rules suite green, commit
`0ba6e0b`, rules released again with no warnings → `--only
firestore:indexes` → `--only hosting` → confirmed the live `index.html`
references the same bundle hash as the local build and that
`AdminPanel-BD9yL9vj.js` is served → this file → push.

Two things were **not** verified and are the first thing to check:

1. **Index build state in production.** `firebase deploy --only
firestore:indexes` returns when the indexes are _submitted_; they build
   asynchronously and there is no `gcloud` on this machine to poll them.
   Firebase console → Firestore → Indexes: both new composite indexes should
   read _Enabled_. Until they do, the Reports filters `resolved`/`everything`
   (`watchResolvedReports`) and the Overview counts (`fetchCounts`, which
   queries `activities` by `status` + `startsAt`) fail with a
   `failed-precondition` "index is building" error. On a dataset this size it
   takes minutes.
2. **A click-through of `/admin` on the live site with real data.** Testing
   was against the emulator (by the owner and by me). Only the owner's admin
   account can do this; see the credentials note in §7.

## 4. Known bugs, caveats and blockers

- **Terms/welcome wording.** `welcome.safe1Body`, `terms.report` and
  `terms.doc.reporting.body` in all four locales still say "A moderator
  reviews every report".
  Left unchanged deliberately: the Terms text is versioned (`TERMS_VERSION`
  in `src/terms/index.js`), and changing it makes every device accept again. If the
  owner wants "an admin" there, change the copy in four languages _and_ bump
  `TERMS_VERSION` in the same commit.
- **Live `moderator` rows.** If any `roles/{uid}` in production still says
  `moderator`, that account has no powers now; the first decision an admin
  takes on it rewrites the row. Nothing to migrate.
- **`npm run deploy` deploys everything `firebase.json` knows about,
  including Functions**, which cannot deploy on the Spark plan. Deploy with
  `--only` targets (§8) unless the project has moved to Blaze.
- **The dev emulator has no persistence** (`npm run emulators` has no
  `--import`/`--export-on-exit`). Stopping it loses the auth users, the
  `roles` rows, reports and log. `npm run seed` restores people and
  activities only; the admin row is re-created by hand (§7).
- **History renders an unknown log `kind` as raw text.** Production cannot
  contain one (the rules refuse anything outside the six); the emulator had a
  leftover seeded `appoint` entry that I deleted.
- **Stale wording, harmless:** ROADMAP's heading "Moderation with limits on
  the moderator" (the paragraph under it is current) and its list of old
  attacks on the moderator rank (history, intentional); DEMO_SCRIPT.md does
  not show the console at all.
- **Historical FIXLIST entry:** the v6 → v7 router upgrade note is stale;
  `package.json` now specifies `react-router-dom ^7.18.3`. Functions remain
  undeployed (Blaze + VAPID).
- Original console browser checks in the emulator app found no console
  errors, including at 375px and in Thai.

## 5. Original console test results

Historical baseline for `0ba6e0b`, all green. See the continuation sections
above for the newer results: 801 unit/render tests at the Maps release,
382 rules tests and 8 integration tests at the picture-upload release.
Individual suite timing for the original baseline is noted below:

| Command                                                        | Result                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `npm run lint` (eslint, includes the React Compiler rules)     | clean                                                                                   |
| `npm run format:check` (Prettier, `src/**` only)               | clean                                                                                   |
| `npm run test:unit` (vitest, `tests/unit` + `tests/app`)       | 65 files, **755 / 755** (console suites 73)                                             |
| `npm run test:rules` (rules-unit-testing on the test emulator) | 4 files, **348 / 348**                                                                  |
| `npm run test:integration`                                     | 6 / 6 (run before the final commit; nothing relevant changed after)                     |
| `npm run test:push`, `npm run test:push:trigger`               | 11 / 11 and 3 / 3 (same)                                                                |
| `npm run build`                                                | OK — `AdminPanel-BD9yL9vj.js` 63 kB, `index-H39CzUfX.js`; no emulator config in `dist/` |

Browser verification against the emulator app, done before the commit:
suspending the legacy `moderator` row (Alex) from the queue rewrote it to
`user` through the rules with a `suspend` log entry, the decision and two
stand-down `remove` entries; lifted with a note; both activities put back
from the console. Signed in as Alex afterwards: "Admins only" at `/admin`,
no shield, no Settings row, `permission-denied` on reads of `reports`,
`roles`, `moderationLog` and on a `roles` write. The owner then tested it
themselves and approved.

## 6. Important decisions

- **ADR-024** (DECISIONS.md): one rank that acts, one console. Cuts were
  chosen so every screen is one sentence at the exhibition: no triage score,
  no bulk actions, no date/handler/sort filters, no workload table, no
  System page, no appoint/dismiss. Do not add these back without asking.
- **Rules are the final authority and are never weakened.** Every new
  collection ships with rules and rule tests. `admin` is the one rank with no
  button anywhere; keep it that way.
- **ADR-023 (amended)**: console architecture — `ConsoleProvider` (five
  listeners enabled by `user.isAdmin`; `rankOf(uid)` → `'admin' | 'user'`),
  `useDesk` (claim/release/act/actOnPerson/applyRecorded/restore/remove),
  `DeskDialogs` (four dialogs), `ConsoleLayout({ nav, title })` with
  `data-console="admin"` (teal accent), `useStickyState` keys
  `reports/accounts/activities/history`, `useFilterParams`, `useFetched`,
  `useNow`. `moderationLog` is written by `recordAction` inside the existing
  action transactions.
- **ADR-016**: the report claim lease stays exactly as it was.
- **Q&A "Who watches the admin?"**: the immutable log, the rules that stop
  any admin acting on another or on themselves, and the Firebase console.
- Commit messages use a sentence-case title and a body that says what
  changed and why. Earlier Claude sessions used a Claude co-author trailer;
  attribute new work to its actual contributor. Follow the owner's current
  release scope. Recent picture, search and Maps work was committed, pushed
  and deployed for live review; do not repeat approval questions for steps
  already authorized. This documentation handoff needs no hosting deployment.

## 7. Running it locally — what only the conversation knew

At the Claude handoff on 2026-09-21, Vite at `127.0.0.1:5173`, Auth `9099`,
Firestore `8181` and Emulator UI `4000` were confirmed running. Recheck before
starting anything; preserve the running emulator's data. These commands are
for a fresh local start, not instructions to restart or reseed existing services:

```bash
npm run emulators      # project demo-smartsync: auth 9099, firestore 8181, UI http://localhost:4000, functions 5001
npm run seed           # creates the five demo people + activities; prints "email -> uid"
npm run dev -- --host 127.0.0.1  # http://127.0.0.1:5173; allowed by the Maps key's referrer restrictions
```

- `.env.local` has `VITE_USE_EMULATORS=true`; `.env.production` sets it
  `false` with the real config, and wins in `vite build`.
- Seed accounts (password `demo1234`, from `scripts/seed.js`):
  `you@smartsync.demo` (Min Khant Aung), `alex@`, `maya@`, `narin@`,
  `june@smartsync.demo`. The seed creates **no** roles, reports or log.
- Make yourself admin in the emulator: Emulator UI → Firestore → collection
  `roles` → document id = the uid → `role: "admin"`, `suspended: false`; or
  with the owner token, which bypasses rules on the emulator only:

  ```bash
  curl -X PATCH -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
    "http://127.0.0.1:8181/v1/projects/demo-smartsync/databases/(default)/documents/roles/<UID>" \
    -d '{"fields":{"role":{"stringValue":"admin"},"suspended":{"booleanValue":false}}}'
  ```

- To fill the queue, sign in as another seed user and file reports from a
  participant list, a chat or an activity page — that exercises the real
  `fileReport` path.
- Original console-session emulator snapshot (not reverified at this handoff): `you@` = admin,
  Alex = `{role:'user', suspended:false}`, Narin suspended with one open
  report, Maya with one open report and one warning, all activities active,
  nine log entries.
- **Credentials:** the live demo account's password is in the gitignored
  `demo-credentials.local.txt`. Never print, paste or commit it, and never
  type any password into a browser through an automation tool — the owner
  signs in themselves. The emulator's `demo1234` is only for the SDK/scripts
  and the owner's own browser.
- Rules tests: `firebase.test.json` (auth 9199, firestore 8282, functions
  5101), per-file project ids (`demo-smartsync`, `demo-smartsync-log`,
  `demo-smartsync-roles`), must run with `--no-file-parallelism` (the npm
  script does). Test fixtures for the console live in
  `tests/app/console/fixtures.js` (`admin`, `plain`, `suspendedAdmin`,
  `feedRegistry`, `moderationMock`, `settle`, `report`).
- Locale files: the parity test folds `_one/_other` and th/my/zh carry
  `_other` only. Edit them with Python (`json.dumps(indent=2,
ensure_ascii=False)`) to keep the diff to the keys you touched — JS
  reorders numeric keys. `npm run sync-locales` copies them into `functions/`
  (gitignored copy); the test scripts run it for you.
- Prettier covers `src/**` only; format tests by hand
  (`npx prettier --write tests/...`). ESLint runs the React Compiler rules
  (`set-state-in-effect`, `preserve-manual-memoization`, `rules-of-hooks`).

## 8. Deploying

For an authorized application release, build and check configuration first:

```bash
npm run check:maps
npm run build
```

When rules or indexes changed, deploy the relevant targets before dependent
frontend code:

```bash
npx firebase deploy --only firestore:rules --project smartsync-c1f07
npx firebase deploy --only firestore:indexes --project smartsync-c1f07
```

Then deploy hosting (the only target needed for frontend-only changes):

```bash
npx firebase deploy --only hosting --project smartsync-c1f07 --non-interactive
```

Always use `--only` (see §4 on Functions). Verify
with `curl -s https://smartsync-c1f07.web.app/ | grep -o 'assets/index-[^"]*\.js'`
against `dist/index.html`.

## 9. Original follow-up suggestions

These are historical console/exhibition suggestions. Follow the owner's next
feature request; current feature status is in CLAUDE_HANDOFF.md.

1. Check the two new indexes are _Enabled_ in the Firebase console, then have
   the owner open `/admin` live and walk the five sections once with real
   data.
2. Exhibition items only the owner can do (ROADMAP): D-03 backup video, D-04
   report and slides, D-02 three timed rehearsals. If the console will be
   shown, add a 30-second segment to DEMO_SCRIPT.md: Reports → claim → decide
   → History, and the closed door as a plain user.
3. B-08 data export before the defence. `firebase firestore:export` needs a
   Cloud Storage bucket (Blaze); on Spark, a read-only dump with the Admin
   SDK or the console's export is the alternative.
4. B-07 quota sanity check, B-09 accessibility sweep.
5. Decide on the Terms wording ("a moderator" → "an admin") — copy ×4
   languages plus `TERMS_VERSION`, one commit.
6. Product work after the defence: T-02 attendance, T-03 recurring
   activities (FIXLIST). Functions/push only after Blaze + VAPID.
