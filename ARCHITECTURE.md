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

Either way, the point of the layering holds: the recommendation engine is
testable without a browser and the security rules are testable without the
app, because each layer can be exercised alone.

`src/services/recommendationService.js` sits outside this stack entirely. It is
pure: data in, numbers out, no imports from Firebase, no state. That is why
`npm run evaluate` can score 400 simulated people without a database.

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
notifications -onSnapshot->  notifications[]
following   --onSnapshot-->  followedUserIds[]
                                  |
                                  v
                             directory       Map(uid -> profile)
                                  |
                                  v
                             located         + distanceKm, live host name
                                  |
                                  v
                             scored          + matchScore, reasons   <- the engine
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

| Stage                | Adds                             | Why it is separate                                                                                 |
| -------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `directory`          | uid → profile lookup             | Host names are copied onto activities and can go stale; the live profile wins                      |
| `located`            | `distanceKm`, live host identity | Distance is _yours_ — the same activity is 600 m from you and 8 km from someone else               |
| `scored`             | `matchScore`, `reasons`          | Runs the pure engine over everything, including cancelled ones so your own history keeps its score |
| `timed`              | `isPast`                         | Whether something has started is a fact about _now_, so a clock re-evaluates it every minute       |
| `visibleActivities`  | —                                | Active ones, plus anything you joined even if cancelled or finished                                |
| `recommendations`    | —                                | Discovery: upcoming and active only                                                                |
| `filteredActivities` | —                                | Your filters, applied last                                                                         |

**Why derived and not stored:** `joinedIds` is computed from the rosters, not
kept as a second list. Two lists can disagree; one cannot disagree with itself.

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
home — the engine has nothing to work with until interests exist.

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

### Discovery and ranking

**Path:** `recommendationService.js`, called from `AppContext`

Six signals, each scored 0–1, then weighted:

| Signal     | Weight | 1.0 when                                                             | Neutral fallback          |
| ---------- | ------ | -------------------------------------------------------------------- | ------------------------- |
| Interest   | 35     | category is one of your interests (0.75 for a tag match)             | 0.2                       |
| Distance   | 20     | it is on top of you, decaying to 0 by ~13 km                         | 0.5 if location unknown   |
| Time       | 15     | its time band matches your preferred time                            | 0.55                      |
| History    | 15     | you have joined this category **and did not list it** as an interest | 0.5                       |
| Popularity | 10     | it is full                                                           | —                         |
| Behaviour  | 5      | the most compatible person going is a perfect match for you          | 0.45 if nobody has joined |

Two of those are less obvious than they look:

**History only counts what interests do not say.** 59% of people's history
categories are already among their stated interests, so counting both scored
the same fact twice — and measurement showed it made the ranking _worse_. It
now means revealed preference: what you keep doing that you never claimed to
like.

**Unknown is not zero.** No location gives distance 0.5, not 0. Treating "we
don't know where you are" as "it is right here" handed every activity full
marks on 20% of the score for a fact nobody knew.

The score is normalised by the best score actually obtainable, not by the
weight total — interest and history can no longer both be maximal, so dividing
by the total capped the best possible match at 93%.

**Test:** Settings → Matching weights. Drag a slider; the list under it
reorders live. Then sign in as two different people and compare the same
activity — 78% for one, 37% for the other.

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
(five listeners: roles, warnings, the open queue, the decided reports, the
log) → `useDesk` (every action) → `firebase/moderation.js`

One internal desk outside the shell, loaded on demand, for the one rank
that acts: an overview in figures; the report queue; every account with
its record and the ladder of actions on it — warn, suspend and lift, close
and reopen; every activity, with a takedown or a restore a click away; and
the history of everything that was done. Drawn from the app's tokens and
drawn densely: tables the keyboard walks, sticky filters, a panel for the
selected record. Three controls above a list at most, and no bulk actions,
so that every function is one sentence to explain.

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

| Concern                          | Guarded by                        | Verify with         |
| -------------------------------- | --------------------------------- | ------------------- |
| Only participants read chat      | `firestore.rules`                 | `npm test`          |
| Capacity cannot be exceeded      | rules + `arrayUnion`              | `npm test`          |
| Only you can edit your profile   | rules                             | `npm test`          |
| Private profile unreadable       | separate document + rules         | `npm test`          |
| Score always 0–100, never throws | pure functions + a fuzzer         | `npm run test:unit` |
| Ranking actually works           | measured against baselines        | `npm run evaluate`  |
| Corrupt local data               | `looksLike` in `utils/storage.js` | —                   |
| Render crash                     | `ErrorBoundary`                   | —                   |

```bash
npm test           # 81 unit tests + 286 security rule tests
npm run evaluate   # does the ranking beat the baselines
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
2. **Pick 3 interests** → permissions → home shows ranked activities
3. **Open the top match** → reasons explain why it is top
4. **Settings → Matching weights** → drag interest to zero, list reorders
5. **Reset to defaults** → button disables itself
6. **Join an activity** → count rises, button becomes Leave
7. **Open chat**, send a message
8. **Second window, second account** → its count and bell update untouched
9. **Create an activity** → tap the map to place it → appears in discovery
10. **Delete it** → says Delete, not Cancel, because nobody else joined
11. **Privacy → anonymous mode on** → your name changes everywhere
12. **Turn wifi off**, join something → offline banner, "will sync"
13. **Set a category filter, then search for something in another category** →
    the empty state says the filters are hiding things and offers to clear
    them, rather than telling you to try another word
