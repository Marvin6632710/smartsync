# SmartSync — hand-off

Original hand-off written 2026-09-21 after removing the moderator rank and
shipping the admin console. Later picture-upload, search and map changes are
recorded below; the original session details remain for context.

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
- **Pre-existing, untouched:** FIXLIST notes a `react-router-dom` v6 → v7
  upgrade for two moderate CVEs; Functions undeployed (Blaze + VAPID).
- Nothing else known. Browser checks in the emulator app found no console
  errors, including at 375px and in Thai.

## 5. Tests run and results

All run after the last code change (`0ba6e0b`), all green:

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
  attribute new work to its actual contributor. Commit and deploy only when
  the owner asks; they normally review on localhost first. The owner explicitly
  chose deployment before their walkthrough for the picture-upload release.

## 7. Running it locally — what only the conversation knew

```bash
npm run emulators      # project demo-smartsync: auth 9099, firestore 8181, UI http://localhost:4000, functions 5001
npm run seed           # creates the five demo people + activities; prints "email -> uid"
npm run dev            # http://localhost:5173 (binds IPv6 localhost — curl 127.0.0.1 fails, localhost works)
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
- Emulator state when I left it (if it is still running): `you@` = admin,
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

```bash
npm run build
npx firebase deploy --only firestore:rules --project smartsync-c1f07
npx firebase deploy --only firestore:indexes --project smartsync-c1f07
npx firebase deploy --only hosting --project smartsync-c1f07
```

In that order — rules before code that relies on them, indexes before code
that queries them — and always with `--only` (see §4 on Functions). Verify
with `curl -s https://smartsync-c1f07.web.app/ | grep -o 'assets/index-[^"]*\.js'`
against `dist/index.html`.

## 9. Recommended next steps, in order

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
