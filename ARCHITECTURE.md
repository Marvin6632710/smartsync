# How SmartSync works

What each part does, how data moves through it, and how to check each piece
yourself. Written to be read in order.

---

## 1. Four layers, and one rule

```
  screens          src/pages/*.jsx          what the user sees
     |             src/components/*.jsx
     |  reads state, calls actions — never touches Firebase
     v
  state            src/context/AuthContext.jsx    who is signed in
                   src/context/AppContext.jsx     everything else
     |  subscribes, derives, orchestrates writes
     v
  data access      src/firebase/*.js        the only place Firebase appears
     |  one module per domain: users, activities, messages, notifications
     v
  database         Firestore + firestore.rules
```

**The rule: no screen reads Firebase directly.** Every read goes through a
context or a shared hook, so rendering the same data in several places does
not open duplicate subscriptions. Photo bytes use `usePicture` independently
of the profile/activity feeds and are subscribed to only while rendered.

Writes are split, and the split is worth knowing because it is not
symmetrical:

- **Shared data** — joining, chatting, creating, cancelling — goes through
  `AppContext`, which surfaces failures as a toast and can correct the screen
  when the server disagrees.
- **Your own profile** — interests, privacy toggles, notification preference —
  is written straight from the screen to `firebase/users`, because a
  preference toggle is a pass-through with nothing to orchestrate.

That shortcut had a cost. Those writes originally had no error handling at
all: `setAnonymousMode` was fire-and-forget, so a refused or dropped write
left the switch flipped on screen and the change never made — the worst kind
of failure, because it looks like success. They now go through
`useSaveProfile`, which reports the failure and disables the control while a
write is in flight.

Either way, the point of the layering holds: what decides the picks is
testable without a browser and the security rules are testable without the
app, because each layer can be exercised alone.

`src/services/compatibility.js` and `src/services/aiPicks.js` sit outside
this stack entirely. They are pure: data in, values out, no imports from
Firebase, no state — the compatibility score, the "somebody like you is
going" fact, and what is sent to the model and made of its answer.

**Check it yourself** — screens should reference `firebase/*` only for their
own profile, for pure helpers, or for auth error text, never to read shared
data:

```bash
grep -rn "watchActivities\|watchPeers\|watchNotifications" src/pages
# expect: nothing — all subscriptions live in AppContext
```

---

## 2. The read pipeline — database to screen

Four listeners open when you sign in, and stay open. Nothing polls.

```
Firestore                    AppContext                        screen
---------                    ----------                        ------
activities  --onSnapshot-->  activities[]
users       --onSnapshot-->  peers[]
notifications -onSnapshot->  notifications[]      (the newest 50, + moderation notices)
notifications -onSnapshot->  unreadCount           (unread only, capped at 100 — the bell's badge)
following   --onSnapshot-->  followedUserIds[]
                                  |
                                  v
                             directory       Map(uid -> profile)
                                  |
                                  v
                             located         + distanceKm, live host name
                                  |
                                  v
                             enriched        + similarUsersJoined, soonest first
                                  |
                                  v
                             timed           + isPast
                                  |
                    +-------------+-------------+
                    v                           v
              visibleActivities            joinedIds
              (active, or yours)           (roster contains you)
                    |
                    v
              recommendations   (upcoming and active only)
                    |
                    v
              filteredActivities  (your category/distance/time filters)
```

Each stage adds one thing and hides nothing:

| Stage                | Adds                             | Why it is separate                                                                             |
| -------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `directory`          | uid → profile lookup             | Host names are copied onto activities and can go stale; the live profile wins                  |
| `located`            | `distanceKm`, live host identity | Distance is _yours_ — the same activity is 600 m from you and 8 km from someone else           |
| `enriched`           | `similarUsersJoined`, the order  | The one fact only this side can compute, and the one order it imposes: soonest first (ADR-030) |
| `timed`              | `isPast`                         | Whether something has started is a fact about _now_, so a clock re-evaluates it every minute   |
| `visibleActivities`  | —                                | Active ones, plus anything you joined even if cancelled or finished                            |
| `recommendations`    | —                                | Discovery: upcoming and active only                                                            |
| `filteredActivities` | —                                | Your filters, applied last (`matchesFilters` in `utils/filters.js`)                            |

**Why derived and not stored:** `joinedIds` is computed from the rosters, not
kept as a second list. Two lists can disagree; one cannot disagree with itself.

**The filters** are sets: any number of categories, any number of time
bands, a maximum distance and the available-spots switch. An empty set is
no restriction — every category, any time — and an activity passes when it
matches _any_ member of each chosen set and _every_ group (football or
basketball, in the morning or evening, within 10 km, with room). They are a
per-device preference in `localStorage` (`smartsync:filters`); one place,
`src/utils/filters.js`, owns their shape, reads a filter saved by an older
version as a set of one, and is the predicate the feed, the search and the
map all share. The filter page edits a draft that reaches the feed on
Apply; Reset clears the sets, restores the defaults and applies at once.

**Check it yourself:** open the app in two windows as two accounts. Join in
one. The other updates without a refresh — that is the listener, not a poll.

---

## 3. The write pipeline — screen to database

Every write takes the same path, and the interesting part is what happens
when it is refused.

```
  screen calls an action on AppContext
        |
        v
  AppContext validates what it can, calls src/firebase/*
        |
        v
  Firestore SDK applies the write to its LOCAL cache immediately
        |                                   |
        |                                   +--> listener fires, screen updates
        v                                        (this is why it feels instant)
  the write is sent to the server
        |
        v
  firestore.rules evaluates it
        |
   +----+----+
   |         |
 accepted  refused
   |         |
   |         +--> local write is rolled back, listener fires again,
   |              screen reverts, AppContext shows a toast saying why
   v
 confirmed, other clients' listeners fire
```

Two consequences worth understanding, because both are visible:

**Writes work offline.** Firestore queues them. The roster on screen changes
before the server has seen anything. That is why joining shows "Joined — will
sync" when offline instead of a spinner, and why there is an offline banner —
an unconfirmed action that looks confirmed is a lie.

**A refusal is not a bug.** The rules are the last word, and when they refuse,
the UI corrects itself. Try it: sign in as one user and open another user's
activity — the Edit button is not there, and if you called the API directly it
would be refused anyway.

---

## 4. Feature by feature

Each entry: what it does, the logic behind it, and how to check it.

### Accounts

**Path:** `SignUpPage` → `AuthContext.signUp` → `firebase/auth.js` →
`users.js:createUserProfile`

Your profile is split in two on purpose. `users/{uid}` is public — name,
avatar, interests — because discovery and matching genuinely need it.
`users/{uid}/private/profile` holds your email, real name and stored position,
and **no other account can read it**. Firestore has no field-level read rules,
so separate documents are the only way to make that real rather than cosmetic.

Routing is gated in stages: loading → signed out → not yet onboarded → the
app. Whole route tables swap, so there is no path where a signed-out visitor
reaches a screen that assumes a user. Over all of it, the Terms & Safety
agreement: not a route but a dialog `App` renders above whatever the stage
produces, with the page beneath inert, until this device has accepted the
current version (`src/terms`) — so no address skips it, and the page behind
it is the one that was asked for.

**Test:** sign up with a new email. You should land on interest selection, not
home — AI Picks has nothing to work with until interests exist.

### Profile and activity pictures

**Path:** `PicturePicker` → `utils/pictures.js:preparePicture` → the existing
profile/activity save → `firebase/pictures.js:writePicture`, in the same batch.

The picker accepts JPG, PNG and WebP through 5 MB, decodes the image, and draws
a resized copy onto a canvas. This preserves proportions and strips original
metadata. Profile pictures start at a maximum edge of 512 px; activities at
1440 px. Compression and further resizing keep the encoded data URL at or
below 320,000 characters. Only that static copy is retained, not the original.

`profilePictures/{uid}` and `activityPictures/{activityId}` contain
`{ dataUrl, version, updatedAt }`. The parent's optional `pictureVersion`
points to that copy; activities also carry `hostPictureVersion` with their
host identity. The fixed picture document is overwritten on replacement, so
there is one current copy per owner/activity. A save with no new selection
does not write any picture fields. Activity deletion removes its picture in
the same batch. `dataUrl` has single-field indexing disabled in both collections.

`SavedPicture` uses `usePicture` to share one listener for each signed-in
viewer, picture and version. Only mounted images load these documents; feed
and people queries carry no image bytes. Missing, refused or undecodable
pictures fall back to initials or category artwork. CSS uses fixed frames and
`object-fit: cover` for a consistent crop without stretching.

The rules permit writes only by the profile owner or an activity's host
with edit permission, and bind each picture to its parent version with
`getAfter`. No collection-wide picture listing is allowed. A profile photo
is unreadable by other accounts while the public profile is anonymous; its
owner can still preview it in the editor. Offline saves use the existing
durable drafts and batch queue, including the picture version when judging
whether a replacement was saved, refused or superseded after a reload.

**Check it yourself:** choose a picture, confirm the preview, save, reload,
then replace it. Save another edit without choosing a file and verify the
photo stays. Try an unsupported or oversized file, and toggle anonymous mode
while viewing from a second account. See ADR-025 for the storage tradeoff.

### Discovery order

**Path:** `compatibility.js:enrichActivities`, called from `AppContext`

Nothing in the browser scores an activity (ADR-030). The context attaches
one fact to every activity — `similarUsersJoined`, true when the most
compatible person already going scores 50 or more against you — and puts
the list soonest first. Discover, Search and the map read that order; AI
Picks asks Gemini for a better one. Compatibility itself is a Jaccard
index over interests (70) plus a shared preferred time (15) and shared
history (15), so listing every interest going does not make you
compatible with everybody; it is the same number the People match screen
shows.

**Test:** Discover lists tonight's activity above tomorrow's whatever your
interests; AI Picks is where the order changes with who you are.

### AI Picks: Gemini ranks

**Path:** `RecommendationsPage` → `useAiPicks` → `services/aiPicks.js` →
the `recommendActivities` callable (`functions/index.js` → `lib/recommend.js`,
`lib/picks.js`, `lib/gemini.js`) → Gemini, and back. ADR-029.

```
browser                                  Cloud Function                      Gemini
eligible = filteredActivities − joined   auth? shape? ──refuse if not
soonest 40 + signals  ─────────────────► cache hit (same question, <10 min)? ──► answer
                                         hour/day counters (one transaction)
                                         prompt: signals + facts, JSON schema ─► model
                                         ids ∈ sent? dedupe; codes ∈ facts?  ◄── ids + codes
picks ∩ on-screen; codes → words ◄────── {source:'gemini', picks} | {source:'none', reason}
```

Two things to hold on to. **The model ranks what it is given** — the
browser has already applied every visibility, blocking, availability and
discovery-filter rule, and the Function drops any id it did not send.
**A reason is a code the data supports**, checked on the server against
the facts and worded in the browser from the activity's own fields; the
model never writes text a person reads. Without a key, past the limits,
or with the service down, nothing ranks: the same activities appear
soonest first under a line that says they are not ranked and why, with
the way to ask again.

Kept in Firestore by the Function alone: `aiPicks/{uid}` (last answer,
question signature, the hour's count) and `aiPicksUsage/{day}` (the
day's count). Both denied to every client in the rules.

**Test:** with the emulator and `scripts/fake-gemini.mjs` running (README
§10), open AI Picks: "Ranked by Gemini · just now", each card with its
reasons; Refresh asks again; stop the stand-in and Try again → "Not
ranked. Gemini could not be reached…" with no top pick and the same
activities soonest first. `tests/unit/picksServer.test.js`, `tests/unit/aiPicks.test.js`,
`tests/app/recommendationsPage.test.jsx`, and the rules test "AI Picks".

### Activity search

**Path:** `SearchPage` → the existing `filteredActivities` in `AppContext`.

Opening Search, entering only spaces, or clearing the field shows an
instruction to enter an activity name, with no activity cards. Once the
trimmed term is nonempty, results match only `title`, using a case-insensitive
substring comparison on every input change. Descriptions, categories,
locations and host names do not contribute matches. Existing discovery
filters still apply; an empty result offers another name and, when filters
are active, a button to clear them and repeat the same name search.

**Check it yourself:** search a fragment with mixed case and surrounding
spaces, then change the text and clear it. A location or category that is
absent from every title must show “No activities found.”

### Joining

**Path:** `ActivityDetailsPage` → `AppContext.joinActivity` →
`activities.js:joinActivity` → `arrayUnion`

Membership is a single `participantUids` array on the activity. Not a
subcollection with a counter — that design was exploitable, because rules
evaluate each write independently and cannot see sibling writes in a batch, so
"increment because I joined" and "increment because I felt like it" were
indistinguishable.

`arrayUnion` is resolved on the server _before_ the capacity rule runs, so two
people taking the last place cannot both win. Tested ten times concurrently:
one winner every time, roster never over capacity.

**Test:** join something. The count rises, the button becomes Leave, and the
host gets a notification. Join twice quickly — nothing breaks, because
`arrayUnion` is idempotent.

### Chat

**Path:** `ChatPage` → `useThread` → `messages.js:watchMessages`

Readable and writable **only by people on the roster**, enforced in the rules.
Append-only: no edits, no deletions. Threads close 30 days after the activity —
that is expiry of _access_, not deletion, because scheduled deletion needs
Cloud Functions and the paid plan.

The listener is only opened once you have joined, because otherwise every
non-member visit logs a permission error.

**Test:** open an activity you have not joined and press Open chat — it tells
you to join first. Join, and the thread appears.

### Notifications

**Path:** any action → `AppContext.notifyUser` →
`notifications.js:pushNotification` → `users/{uid}/notifications`

Written into the _recipient's_ inbox by the _sender_, which is why the rules
let any signed-in user create one — "Alex joined your activity" has to be
written by Alex. They are constrained to a fixed shape and forced to
`read: false`, so nobody can forge a pre-read system message.

Your "notifications off" setting lives on your **public** profile, unusually,
and deliberately: a preference only its owner can read is a preference nobody
else can honour. The rules check it before allowing the write.

**Test:** turn notifications off in Settings, then have another account join
your activity. Nothing arrives — and check the database if you like; nothing
was written.

### The admin console

**Path:** `/admin` → `src/console/AdminPanel.jsx` → `ConsoleProvider`
(roles, warnings, report queues and the log) → `useDesk` for the original
transactional actions, or `firebase/admin.js` for trusted callable actions.

One internal desk outside the shell, loaded on demand, for the one rank
that acts: an overview in figures; the report queue; every account with
its record and the ladder of actions on it — warn, suspend and lift, close
and reopen; every activity, with a takedown or a restore a click away; and
the history of everything that was done. Drawn from the app's tokens and
drawn densely: tables the keyboard walks, sticky filters, a panel for the
selected record. Three controls above a list at most, and no bulk actions,
so that every function is one sentence to explain.

The expanded powers cross a boundary that rules cannot safely grant to an
admin browser: changing another person's profile, restoring removed content,
revoking Auth sessions and sending a reset email. They therefore go through
callable Functions in `functions/index.js` and the narrow operations in
`functions/lib/admin.js`. Each call proves the caller is still an active admin,
refuses self and fellow-admin actions, bounds the request and requires a
reason. Content removals copy the exact original into server-only
`moderationVault`, replace the public value with a safe state and add a public
lock in one transaction. Rules preserve the lock and reject owner writes to a
locked field or picture; only a Function can restore the vault copy.

Appeals use the same boundary. `/appeals` asks the Function to verify that the
action still exists before creating a stable, duplicate-proof
`moderationAppeals` record. `/admin/appeals` can uphold it or reverse the named
action. The Function rechecks the action token and takes a five-minute review
lease before changing anything, so a stale appeal or a second admin cannot undo
the wrong decision. Failed attempts release the lease, and an abandoned lease
can be reclaimed after it expires. `/admin/announcements` creates server-owned,
expiring notices for all accounts, hosts or participants; `AnnouncementBanner`
evaluates audience and expiry against the signed-in user's live data. Security
actions look up the Auth account server-side, so session revocation and
Firebase's password-reset email never expose a private email to the browser.
The local Function targets the Auth emulator's matching endpoint, keeping the
whole security-action path testable without sending a real email.

A suspension may be indefinite or carry `suspendedUntil`. Every rules check
evaluates that timestamp, so access returns at expiry even if no job has run.
The scheduled `expireTimedSuspensions` Function clears expired flags every
fifteen minutes for tidy data, an audit row and the “active again” notice. The
scheduler is cleanup and communication, not the security boundary.

Working a report is claim → act and record in one transaction, exactly as
before (ADR-016); the desk adds a claim taken on purpose, with its lease
counting down. Every action of the six kinds that change an account or an
activity also writes an entry to `moderationLog` in the same transaction,
and the rules bind each entry to its writer, to the server's clock and —
through `getAfter` — to a state the subject is actually in (ADR-023,
ADR-024). The history views merge that log with the warnings and the
decided reports into one timeline.

**Check it yourself** — the door is the guard, once, and the rules are
the control:

```bash
grep -n "isAdmin" src/console/AdminPanel.jsx
# expect: one guard at the top, nothing per page
grep -c "isModerator\|'moderator'" firestore.rules src/**/*.js src/**/*.jsx
# expect: 0 in every file — the rank is gone from the rules and the code
npm run test:rules   # tests/rules/roles-matrix.test.js: the two-rank matrix
```

Signed in as a plain user, `/admin` shows a closed door; so does a row
that still says `moderator`, because the rank no longer exists.

### Browser push

**Path:** a record lands in `users/{uid}/notifications` →
`functions/index.js:onNotificationCreated` → `lib/deliver.js` → FCM →
`public/push-sw.js` → a tap → `/n/{id}` (`NotificationOpenPage`) → the
thread or the activity, and the record marked read.

The inbox record is the truth; the push is a copy of it, sent once. The
Function claims the record (a transaction writing `delivery.push` — a
retry finds the claim and stops), reads the recipient's private preferences,
language and devices (`users/{uid}/pushTokens`, self-only rules), words the
push from the same locale files as the screen (copied into `functions/` at
build), and sends a data-only message to every device. The worker shows it
only when no SmartSync window is visible — an open app shows the record
itself, as a toast — and drops a push naming somebody other than the person
signed in on the device. A chat push says who wrote, not what, unless
previews are switched on. Registration happens only from a click (the
one-time offer after a join, or Settings); it is taken back on sign-out,
revocation, a dead token, and after sixty days unseen.

**Test:** under the emulators, Settings → Notifications → Turn on, then have
another account write in a chat you are in. The functions emulator's log
shows `push (not sent: log transport)` with the title in your language and
no message text; the record's `delivery.push` says `sent`. Deployed, the
same path ends at FCM (needs Blaze and a VAPID key).

### Maps and activity locations

**Path:** `MapPage` / `LocationPicker` → `GoogleMap` →
`services/googleMaps.js` → Google's Maps JavaScript API.

The official loader fetches the maps, core and marker libraries only when a
map mounts. `GoogleMap` owns the imperative map and cleans up its listeners
when unmounted. React portals render the category pins inside Google's
Advanced Markers; activity text is not interpolated into marker HTML.
`ActivityMapPins` groups nearby pins using Google's projection, fits changed
coordinates, and cycles activities that occupy the same place. Clock ticks,
roster updates and typing a location name do not reset the user's map view.

The activity picker still saves only a location name and latitude/longitude
through the existing activity write path. Clicks outside Thailand are
rejected; map movement is constrained to the same Thailand bounds. No
Places API, geocoding, new Firestore fields or rules changes are needed.

Google Maps is external even with Firebase emulators. Missing configuration,
loading failures and Google authentication errors show an unavailable state;
the activity list and existing location controls remain usable. Hosting
checks for a production key/map ID before deployment. Follow
[GOOGLE_MAPS_SETUP.md](GOOGLE_MAPS_SETUP.md) for cloud configuration and real
SDK verification. ADR-026 records the provider change.

### Privacy

**Path:** `PrivacyPage` → `users.js:setAnonymousMode` → both profile halves
**plus** `activities.js:syncHostIdentity`

Anonymous mode rewrites the public document so your real name genuinely leaves
it. It also sweeps the copy of your name held on every activity you host —
without that, the setting was doing half its job, which an audit caught.

Approximate location rounds your position to about a kilometre _before it is
stored_, so the precise fix never leaves your device.

**Test:** turn on anonymous mode, then look at your own activities from
another account. The host reads "Anonymous user".

---

## 5. What is guarded, and where

| Concern                          | Guarded by                         | Verify with          |
| -------------------------------- | ---------------------------------- | -------------------- |
| Only participants read chat      | `firestore.rules`                  | `npm test`           |
| Capacity cannot be exceeded      | rules + `arrayUnion`               | `npm test`           |
| Only you can edit your profile   | rules                              | `npm test`           |
| Private profile unreadable       | separate document + rules          | `npm test`           |
| Compatibility 0–100, symmetric   | pure functions + a fuzzer          | `npm run test:unit`  |
| Corrupt local data               | `looksLike` in `utils/storage.js`  | —                    |
| Gemini key never in the browser  | Secret Manager + callable          | `grep` the bundle    |
| Model cannot invent or overclaim | `parsePicks` + `resolvePicks`      | `npm run test:unit`  |
| Model calls bounded              | per-person and per-day counters    | `npm run test:unit`  |
| Removed admin content stays down | public lock + rules + server vault | `npm run test:rules` |
| Admin restores exact original    | callable Function + vault          | `npm run test:unit`  |
| Timed suspension expires safely  | timestamp in every rules guard     | `npm run test:rules` |
| Password email stays private     | server-side Auth lookup            | `npm run test:unit`  |
| Render crash                     | `ErrorBoundary`                    | —                    |

```bash
npm test           # the unit, rendering and security rule suites
npm run lint
```

The rule tests behave like a hostile client rather than a well-behaved one.
They have caught three real holes on their own, and pin three more that were
found by driving the app — each of those tests fails against the rules as they
were before the fix, which is the only way to know a regression test is one.

---

## 6. A ten-minute test pass

In order, on <https://smartsync-c1f07.web.app>:

1. **Sign up** with a new email → lands on interests, not home
2. **Pick 3 interests** → permissions → home shows what is on, soonest first
3. **AI Picks** → "Ranked by Gemini", the top pick with its reasons
4. **Refresh** → asked again; **change an interest** and come back → asked
   again on its own
5. **Discovery filters** that exclude everything → "Nothing to pick from"
   with Adjust filters, and no request made
6. **Join an activity** → count rises, button becomes Leave
7. **Open chat**, send a message
8. **Second window, second account** → its count and bell update untouched
9. **Create an activity** → tap the map to place it → appears in discovery
10. **Delete it** → says Delete, not Cancel, because nobody else joined
11. **Privacy → anonymous mode on** → your name changes everywhere
12. **Turn wifi off**, join something → offline banner, "will sync"
13. **Pick two categories and two times, then search for something outside them** →
    the empty state says the filters are hiding things and offers to clear
    them, rather than telling you to try another word
