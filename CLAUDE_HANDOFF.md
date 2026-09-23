# Continue SmartSync in Claude Code

Prepared 2026-09-21. Use the existing local folder:
`/Users/marvin/Downloads/SmartSync 2`.

## Chat moderation — calibrated and ready, not yet deployed (2026-09-23)

Credits are on the OpenAI account and the whole path runs against the
real API. **The harassment floor moved 0.5 → 0.85 because the floors had
never been measured and the old one refused ordinary chat** — criticism
of an idea scores 0.807, friendly teasing 0.803, trash talk 0.804, while
real abuse starts at 0.889. Pinned by a test naming those scores;
measurements and the honest list of what the model misses are in README
§11 and in HANDOFF.md.

Still **not deployed** — the live site has the old rules and chat there
works. When deploying, rules and the three callables must go in one
command; HANDOFF.md opens with it.

## Start here

1. Read this file, then the latest sections of [HANDOFF.md](HANDOFF.md).
2. Run `git status --short --branch` and `git log -8 --oneline` before editing.
3. Read the relevant sections of [ARCHITECTURE.md](ARCHITECTURE.md) and
   [DECISIONS.md](DECISIONS.md) for the owner's next feature request.
4. Confirm the current state briefly and ask which feature to implement if
   the owner has not supplied one. The earlier ideas below are context, not
   instructions to implement them all.

The owner is switching assistants because of session limits. There is no
half-finished implementation to resume. Repository files carry the handoff;
do not assume access to the previous assistant's conversation.

## Current release

- Repository: <https://github.com/Marvin6632710/smartsync>, branch `main`.
- Before this documentation handoff, local and remote were clean and equal
  at `622ed9c` (Google Maps release verification).
- Live site: <https://smartsync-c1f07.web.app>.
- Deployed application: `1adfa05`, entry bundle `index-jHb5xmTm.js`.
- Hosting includes Google Maps, picture uploads and name-only search.
  Firestore rules/indexes were last released with picture uploads, `355b89f`.
- This handoff changes documentation only; no application deployment is needed.

| Completed feature | Behavior and implementation |
| --- | --- |
| Profile/activity pictures (`355b89f`) | Upload previews and replacements; no new selection preserves the existing/default image. JPG, PNG and WebP through 5 MiB; browser decoding/resizing strips metadata. Pictures live in separate Firestore `profilePictures` / `activityPictures` documents, **not Cloud Storage**. Owner/host rules, batched version markers, anonymous privacy and offline drafts are implemented. ADR-025 records the bounded data-URL design. |
| Activity search (`4462773`) | Empty/space-only input shows the prompt and no cards. Trimmed, case-insensitive partial matching checks titles only; clearing removes results immediately. Existing discovery filters still apply. All four locales updated. |
| Google Maps (`1adfa05`) | Leaflet/OpenStreetMap removed. Native Google maps, activity clusters/previews, desktop list, mobile controls and create/edit pin placement work. Saved coordinates are preserved. Loader failures have localized retry states. ADR-026 records the integration. |

## Keep the existing configuration

- Firebase project: `smartsync-c1f07`.
- Google Maps project: `genial-airway-509303-f6` (separate from Firebase).
- Maps browser key name: `SmartSync Web Maps`; restricted to Maps JavaScript
  API and the two Firebase hosting domains plus localhost/127.0.0.1 port 5173.
- Map: `SmartSync Web Map`, JavaScript raster map ID.
- `VITE_GOOGLE_MAPS_API_KEY` and `VITE_GOOGLE_MAPS_MAP_ID` already exist in
  ignored `.env.local` and `.env.production`. Do not replace these files with
  `.env.example`, recreate the key, or put actual values into git or handoffs.
- `.env.local` enables emulators; `.env.production` disables them for builds.
  Local maps still call the real Google Maps service.
- [GOOGLE_MAPS_SETUP.md](GOOGLE_MAPS_SETUP.md) documents restrictions and setup.
  `npm run check:maps` validates production configuration without printing keys.
- The project is on **Blaze** since 2026-09-21 and the AI Picks Function
  (`recommendActivities`, us-central1) is deployed with the `GEMINI_API_KEY`
  secret (README §10). The push Functions (`onNotificationCreated`,
  `cleanupPushTokens`) are still undeployed — they need `VITE_FCM_VAPID_KEY`
  and a `--only functions` deploy of their own.

Use the same local folder so ignored configuration remains available. A fresh
clone does not contain these files; transfer configuration privately if moving
machines. The live demo password is also ignored; follow HANDOFF §7 and let the
owner sign in. Never include credentials in chat, commits or documentation.

## Local services

At handoff, Vite listens at <http://127.0.0.1:5173>, Firebase Auth at `9099`,
Firestore at `8181`, and Emulator UI at <http://127.0.0.1:4000>.
Check existing listeners before starting duplicates. **Do not stop or reseed
the running development emulators:** they have no automatic persistence.

Only if starting a fresh environment, use separate terminals for:

```bash
npm run emulators
# Once the fresh emulators are ready, in another terminal:
npm run seed
npm run dev -- --host 127.0.0.1
```

Seed accounts/admin setup are in HANDOFF §7. The map verification activity
`uxzaMJg4LtKZeQikqBcS` remains in the running emulator, with coordinates
`13.7563, 100.5022`. No production test activity was created by the map work.
Test emulators use separate ports via `firebase.test.json` (Auth 9199,
Firestore 8282, Functions 5101); use the supplied npm scripts.

## Earlier feature ideas: inspect before implementing

These were discussed by the owner earlier; no new priority was chosen for
this handoff. The following reflects the current source, not an assumed queue.

| Idea | Current state |
| --- | --- |
| Full-width profile separate from activities on laptops | **Done 2026-09-21.** From 1024px the profile is one tall gradient panel down the left (card + overview stats and interests, at least window height) with the joined activities in cards on the right — the owner's words: "vertically full profile at the left side and joined activities on the right side"; a horizontal banner and a full-width stacked card were both rejected first. `.profile-column` wrapper in `ProfilePage.jsx` (`display: contents` on phones); layout in the DESKTOP block of `src/styles.css`. The card also gained a white **Edit profile** button (the old "Edit" text link beside the overview heading is gone), the interests as chips, three stats (joined / hosting / top match) and an empty state for the joined list. |
| More noticeable “Current Warnings” in Settings | **Done 2026-09-21, two passes.** Its own card (`.warnings-card`), titled "Current warnings", icon in a tile, live count from `useMyWarnings`. Second pass to the owner's spec: first on the page when there are warnings (under the preferences when not), badge in words ("2 warnings"), explanation line, "View warnings ›" label, whole card a native button with an inset focus ring, "Checking your record…" while loading; never claims a clean record it has not seen. See HANDOFF "Current warnings, second pass". |
| Bio below the profile picture, up to 75 words | **Done 2026-09-21.** 75 words _and_ 500 characters, in the rules (`validBio()`) and the editor (`src/utils/bio.js`, live counter, refusal with reason). Characters are the ceiling that bites for Thai/Burmese/Chinese. ADR-027. Rules must be released before hosting. |
| Unread count on the notification bell | **Completed to the owner's spec 2026-09-21.** Its own listener (`watchUnreadCount`, unread docs only, capped at 100) instead of counting the 50-item inbox; "99+" past 99; `aria-label` "Notifications, N unread" in four languages; reset on account switch. See HANDOFF "the bell's unread badge". |
| Multi-select discovery filters | **Done 2026-09-21, to the owner's spec.** Checkboxes-as-chips per category and time band, "All categories" / "Any time" controls, OR within a group and AND between, empty set = no restriction, draft until Apply, Reset restores the defaults and applies. One module `src/utils/filters.js` (shape, `normaliseFilters` migration of the old `category`/`timeBand` shape, `matchesFilters`, `activeFilterCount`); the feed, search and map share `filteredActivities`. Filter count on the Discover button; "Adjust filters" in the empty state. ADR-028. See HANDOFF "discovery filters as sets". |
| AI Picks through Gemini | **Done and live 2026-09-21, to the owner's spec (Blaze, secret and Function deployed by the owner).** `functions/lib/{picks,recommend,gemini}.js` + the `recommendActivities` callable in `functions/index.js`; browser side `src/services/aiPicks.js`, `src/hooks/useAiPicks.js`, `src/firebase/functions.js`, `RecommendationsPage.jsx`. Re-ranks the eligible activities with reason codes validated against the data; cache + rate limits in Firestore (`aiPicks/{uid}`, `aiPicksUsage/{day}`, denied to clients); with no answer the page shows the eligible activities soonest first under "Not ranked", with the reason and Try again. Secret `GEMINI_API_KEY`; README §10; ADR-029. Stand-in server for the emulator: `scripts/fake-gemini.mjs`. |
| The scoring engine removed | **Shipped 2026-09-22 as `34ae1d4` (pushed; Function + hosting deployed).** The 403 that followed was a block on the Google account the keys were made under, not the app — resolved with a key from another account (secret version 5). That key is free tier: `gemini-3.5-flash` only (lite has no capacity), 43–75 s per call, so the model call / Function / browser timeouts are now 90 / 110 / 115 s and the SDK retry is gone. ADR-032. `src/services/recommendationService.js` deleted with the weights, the sliders page, the how-panel, the recommendation-details page and every "% match"; `scripts/evaluate.mjs` gone (`EVALUATION.md` kept as history). `src/services/compatibility.js` keeps People-match compatibility and `enrichActivities` (the `similar` fact, soonest-first order). The Function no longer takes a score (`matchScore` dropped from the request and prompt) and answers `source: 'none'` instead of `'standard'` — the deployed Function still says `'standard'` until redeployed; the page treats both as no ranking. ADR-030. |
| Chat moderation (ADR-033) | **Built 2026-09-23 to the owner's 12-point spec — NOT committed, NOT deployed; owner tests on localhost first.** The database refuses every client-written chat message (`allow create: if false` on `activities/*/messages` and `chatPictures/{messageId}`), so the only writer is `sendChatMessageCall`, which re-checks membership/suspension/closure/retention in `gate()` and then moderates — that is what makes the check unskippable. Text and pictures go to OpenAI's `omni-moderation-latest`; a picture is also transcribed by `gpt-5.6-luna` and the transcription moderated as text, because the API applies `hate`/`harassment` to text only. Nine categories block, each needing the API boolean **and** a score over a floor in `functions/lib/moderation.js`; `violence`, `illicit`, `self-harm` and `self-harm/intent` deliberately do not. A refusal stays in the sender's composer with a general reason and Edit / Discard / Ask for a review; appeals reach `/admin/chat`, where Overturn posts the original from the held copy and deletes it. `sexual/minors` is blocked with nothing retained and no appeal (README §11). Outages keep the message and offer Retry — failure is never delivery. Rate limit 60/hour/person plus a daily call budget. Moderation API is free; only transcription is billed (~$0.0007/picture). New: `functions/lib/{moderation,openai,chat,sendChat}.js`, `src/firebase/chat.js`, `src/console/pages/ChatBlocksPage.jsx`, `scripts/fake-openai.mjs`. 71 tests added; verified end-to-end in the emulator **against the stand-in, never the real API** — no `OPENAI_API_KEY` exists yet, and the floors are what a real key would most likely retune. |
| Place names to Gemini (ADR-031) | **Shipped 2026-09-22 with the above (`34ae1d4`).** Candidates carry `place` (the venue name, 60 chars), signals carry `placesBefore` (venues of joined activities, ≤12), both in the cache signature; ninth reason code `place` checked server-side; `reasons.place` + reworded `picks.privacy` in four languages; coordinates never sent. |
| Pictures, name-only search, Google Maps | Completed and deployed, as above. |

## Files to begin with

| Area | Relevant files |
| --- | --- |
| Maps | `src/pages/MapPage.jsx`, `src/components/LocationPicker.jsx`, `GoogleMap.jsx`, `ActivityMapPins.jsx`, `src/services/googleMaps.js`, `src/utils/maps.js` |
| Pictures | `src/components/PicturePicker.jsx`, `SavedPicture.jsx`, `src/hooks/usePicture.js`, `src/utils/pictures.js`, `src/firebase/pictures.js` |
| Profile/bio/layout | `src/pages/ProfilePage.jsx`, `EditProfilePage.jsx`, `src/firebase/users.js`, `src/styles.css`, `firestore.rules` |
| Search / discovery filters | `src/pages/SearchPage.jsx`, `FilterPage.jsx`, `src/utils/filters.js`, `src/components/FiltersEmptyState.jsx` |
| AI Picks (Gemini) | `src/pages/RecommendationsPage.jsx`, `src/hooks/useAiPicks.js`, `src/services/aiPicks.js`, `src/services/interestPicks.js`, `src/firebase/functions.js`; `functions/index.js`, `functions/lib/picks.js`, `recommend.js`, `gemini.js`; `scripts/fake-gemini.mjs` |
| Chat moderation | `functions/lib/moderation.js`, `openai.js`, `chat.js`, `sendChat.js`; `functions/index.js` (three callables); `firestore.rules`; `src/firebase/chat.js`, `src/pages/ChatPage.jsx`, `src/context/AppContext.jsx`; `src/console/pages/ChatBlocksPage.jsx`; `scripts/fake-openai.mjs` |
| Compatibility / feed order | `src/services/compatibility.js` (People match score, `enrichActivities`), `src/context/AppContext.jsx` (`enriched` stage) |
| Warnings/notifications | `src/pages/SettingsPage.jsx`, `WarningsPage.jsx`, `NotificationsPage.jsx`, `src/components/Shell.jsx` |
| Shared data/localization | `src/context/AuthContext.jsx`, `AppContext.jsx`; `src/i18n/locales/{en,th,my,zh}.json` |

Keep authorization in rules, including photo ownership and anonymous privacy.
Admin is the only privileged rank; do not restore moderator powers or add
in-app admin assignment (ADR-024). Preserve the report claim lease (ADR-016).
Changing accepted Terms copy requires all four locales and a `TERMS_VERSION`
bump. Keep locale key order and follow HANDOFF §7's formatting conventions.

## Verification and release

Latest recorded results: **801 unit/render tests** at the Maps release;
**382 rules tests and 8 Auth/Firestore integration tests** at the picture
release. Rules/integration were not rerun for the subsequent frontend changes.
Lint, source formatting, build and Maps configuration checks passed. Existing
build warnings concern Firebase chunk size and picture-module chunking.

Real browser checks covered title-only search, Google Maps at 390 px/1440 px,
clusters and list selection, stable pins while typing, and local create/edit
coordinate persistence. Production map and create/edit pickers were checked
without saving production activities. Details/evidence are in HANDOFF.

For application changes, run the relevant tests and these baseline checks:

```bash
npm run check:maps
npm run test:unit
npm run lint
npm run format:check
npm run build
git diff --check
```

Run `npm run test:rules` and `npm run test:integration` when permissions,
data contracts or persistence change; push suites when push code changes.
Test affected screens in the browser, including mobile and save/reload flows.

Follow the owner's current release instruction. Recent requests explicitly
included commit, push and deployment for live review; avoid redundant approval
questions for work already authorized. For an authorized frontend release:

```bash
npx firebase deploy --only hosting --project smartsync-c1f07 --non-interactive
```

Deploy changed rules/indexes before hosting when the frontend depends on them.
Avoid `npm run deploy`: it includes undeployed Functions. Hosting predeploy
checks Maps config; `npm run build` alone does not guarantee config is valid.
Verify the live bundle against `dist/index.html`, perform the relevant live
walkthrough, and record commits, checks and limitations in HANDOFF.md.

Still not recorded as verified: production composite indexes showing Enabled;
live `/admin` with real data; the owner's complete picture save/reload/mobile
walkthrough; real Maps light-theme and device GPS permission flows. Historical
ROADMAP/FIXLIST entries are context, not authority over the owner's next request.
