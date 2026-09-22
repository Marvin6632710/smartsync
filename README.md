# SmartSync

Find nearby activities, join them, and meet people by doing things together.

**Live: <https://smartsync-c1f07.web.app>**

SmartSync is a real multi-user web application: people create accounts, host
activities at real places, join each other's, and chat with the group. It is
built with React and Vite on the front end and Firebase (Authentication and
Cloud Firestore) on the back end.

---

## Contents

1. [What it does](#1-what-it-does)
2. [Running it locally without a Firebase account](#2-running-it-locally-without-a-firebase-account)
3. [Connecting your own Firebase project](#3-connecting-your-own-firebase-project)
4. [Demo accounts on the live site](#4-demo-accounts-on-the-live-site)
5. [Deploying](#5-deploying)
6. [Making the first admin](#6-making-the-first-admin)
7. [Project structure](#7-project-structure)
8. [Data model](#8-data-model)
9. [Security model](#9-security-model)
10. [How recommendations work](#10-how-recommendations-work)
11. [Testing](#11-testing)
12. [Known limits](#12-known-limits)

---

## 1. What it does

- **Accounts.** Email and password sign-up, sign-in and password reset.
- **Pictures.** Upload or replace profile and activity pictures, with a
  preview before saving. JPG, PNG and WebP files up to 5 MB are resized and
  saved in separate Firestore documents; leaving the picker empty keeps the
  saved picture or existing initials/category artwork. Anonymous mode hides
  the profile photo from other accounts. See ADR-025 for the storage limits.
- **Discovery.** Every activity anyone creates is visible to everyone, ranked
  for you personally.
- **Real places.** Hosts place an activity by tapping a map. Distance is then
  computed from your device's GPS position to that coordinate — so the same
  activity is correctly "600 m away" for one person and "8 km away" for
  another.
- **Joining.** Capacity is enforced by the database, not the interface. Two
  people taking the last seat at the same moment cannot both succeed.
- **Group chat.** Every activity has a thread, readable only by people who
  actually joined it.
- **Notifications.** Real cross-user notifications: the host is told when
  somebody joins, participants are told when the activity is cancelled or a
  message arrives. The inbox is the record; the ones that matter when the
  app is closed — messages, cancellations, safety notices — also reach the
  person's devices as browser push, worded in their language, with the
  message text kept off the lock screen unless they ask for it.
- **People matching.** Other users ranked by how compatible their interests,
  preferred times and activity history are with yours.
- **Privacy controls.** Anonymous mode genuinely removes your name from the
  profile document other people can read. Approximate location rounds your
  position to roughly a kilometre before it is stored at all.
- **Blocking and reporting.** Block someone and you stop seeing their
  activities, their profile and their messages — and the database refuses to
  let them join anything you host. Report a person, an activity or a single
  message, with the thing you were looking at attached.
- **Moderation and oversight.** Reports land in a queue the admin works from
  a console of its own, and an accounts list shows every account with what it
  has actually done — so the admin can act on something they noticed rather
  than only on what somebody flagged. The ladder is warn, take down, suspend,
  close, each reversible except the warning, and every action records who
  took it and why. Nobody can act on a report about themselves, no admin can
  act on another, admin can only be granted from the Firebase console, and
  the rank cannot read a private profile, a block list, or a chat it did not
  join. See ADR-011 and ADR-024.

## 2. Running it locally without a Firebase account

The Firebase Emulator Suite runs the app's backend on your machine without
a Firebase account. Map screens use Google's external service, including
during emulator development, and need a billing-enabled Google Cloud project,
a browser API key and a JavaScript map ID. Follow
[Google Maps setup](GOOGLE_MAPS_SETUP.md). Without that configuration, the
rest of the app works and maps show an unavailable message.

**Requirements:** Node.js 18+, npm, and Java 11+ (the Firestore emulator is a
Java program — check with `java -version`).

```bash
npm install
npm run functions:install     # the Cloud Function that sends browser pushes
cp .env.example .env.local
```

Then, in three terminals:

```bash
npm run emulators
```

```bash
npm run seed
```

```bash
npm run dev
```

Open the URL Vite prints. Sign in with any seeded account — the password for
all of them is `demo1234`. These are emulator-only accounts that exist solely
on your machine; the live site uses the same email addresses with a different
password that is not in this repository (see section 4).

| Email                  | Who            |
| ---------------------- | -------------- |
| `you@smartsync.demo`   | Min Khant Aung |
| `alex@smartsync.demo`  | Alex Chen      |
| `maya@smartsync.demo`  | Maya Rahman    |
| `narin@smartsync.demo` | Narin Suksai   |
| `june@smartsync.demo`  | June Park      |

To see it genuinely working as a multi-user app, open a second browser (or a
private window), sign in as somebody else, and join the other person's
activity — the count, the participant list and the chat all update live in
both windows.

Browser notifications work under the emulators too, up to the last step:
Settings → Notifications registers a stand-in token, the Cloud Function in
the functions emulator claims each inbox record and words the push in your
language, and — since there is no messaging emulator — writes it to the
emulator log instead of sending it. Look for `push (not sent: log
transport)` in the emulator terminal.

The emulator UI at <http://127.0.0.1:4000> shows the database contents while
you click around.

## 3. Connecting your own Firebase project

Steps 1–4 have to be done by you in the Firebase console; they involve
creating an account and are not something the code can do for itself.

1. Go to <https://console.firebase.google.com> and **Add project**. The free
   Spark plan is enough for the app itself; browser push needs the Cloud
   Function in `functions/`, and Cloud Functions need the **Blaze** plan
   (pay as you go, with the same free allowance — expected to cost nothing
   at this size; set a budget alert when you upgrade). Without Blaze
   the Firebase features work without browser notifications. Google Maps
   has its own billing requirement; see [Google Maps setup](GOOGLE_MAPS_SETUP.md).
2. In **Build → Authentication → Sign-in method**, enable **Email/Password**.
3. In **Build → Firestore Database**, click **Create database**. Choose a
   region near your users (`asia-southeast1` for Bangkok). Start in
   **production mode** — the rules in this repo replace the defaults.
4. In **Project settings → General → Your apps**, add a **Web app**. Copy the
   `firebaseConfig` values it shows you.

Then, back in the project:

```bash
cp .env.example .env.local
```

Edit `.env.local`: set `VITE_USE_EMULATORS=false` and paste in the six values
from step 4.

For browser notifications, two more things in the console:

5. **Project settings → Cloud Messaging → Web configuration → Web Push
   certificates → Generate key pair.** Put the public key in `.env.local`
   (and `.env.production`) as `VITE_FCM_VAPID_KEY`. The private half never
   leaves Google. `VITE_FIREBASE_MESSAGING_SENDER_ID` from step 4 is
   required too.
6. Upgrade the project to **Blaze** and deploy the Function
   (`npx firebase deploy --only functions`). It uses the project's default
   service account; no key file is needed.

Point the CLI at your project and publish the security rules:

```bash
npx firebase login
npx firebase use --add          # pick the project you just created
npm run deploy:rules
```

> The Firebase web API key is **not** a secret — it identifies the project and
> authorises nothing by itself. Access is controlled entirely by
> `firestore.rules`. It is still kept out of git because it differs per
> environment.

## 4. Demo accounts on the live site

`npm run seed:production -- --confirm` loads demo content into the live
project: six accounts, eighteen activities at real Bangkok locations spread
over about five weeks, some joins and a chat thread. It is safe to run more
than once — anything already there is skipped rather than duplicated.

The dates deliberately reach well past the defence. Activities that have
already started are hidden from discovery, so seeding only "the next two
weeks" would leave the app looking empty on the day it has to be shown.

| Email                  | Interests                |
| ---------------------- | ------------------------ |
| `you@smartsync.demo`   | Football, Gaming, Coffee |
| `alex@smartsync.demo`  | Football, Gaming, Gym    |
| `maya@smartsync.demo`  | Coffee, Study, Movies    |
| `narin@smartsync.demo` | Running, Cycling, Food   |
| `june@smartsync.demo`  | Gaming, Movies, Hangouts |
| `pim@smartsync.demo`   | Basketball, Food, Events |

The password is **not written down in this repository**, deliberately — these
are live accounts on a site anyone can reach, and a password committed to a
public repo is a password everyone has. It is in
`demo-credentials.local.txt`, which is gitignored, and the seed script
requires it as `SEED_PASSWORD` rather than falling back to a default.

Signing in as two of them side by side is the clearest demonstration the app
has: the same eighteen activities rank completely differently. Football Night
is Min Khant's top match at 84% and sits at 39% for Maya.

## 5. Deploying

Configure Google Maps first using [the setup guide](GOOGLE_MAPS_SETUP.md).
`npm run check:maps` checks that production has a key and a map ID; hosting
also runs it before deployment. It cannot verify billing, API activation or
referrer restrictions, so test the actual maps before publishing.

For a hosting-only release (the usual case — the AI Picks Function is
deployed separately, see §10; the push Functions are not deployed yet):

```bash
npm run check:maps
npm run build
npx firebase deploy --only hosting
```

When intentionally deploying all configured Firebase services:

```bash
npm run deploy
```

That builds the app and pushes the static site, the security rules and the
Cloud Function to Firebase. The console prints the live URL. The Function
deploy copies `src/i18n/locales` into `functions/locales` first (the
`predeploy` step in `firebase.json`), so a push is worded from the same
strings as the screen.

If you changed a query, deploy the indexes too — the moderation queue needs
composite indexes on `reports` (open by `createdAt`, decided by
`reviewedAt`) and the admin overview one on `activities` (`status` and
`startsAt`), and without them the query fails on a real project even though
it works fine on the emulator:

```bash
npx firebase deploy --only firestore:indexes
```

The stale-token sweep (`cleanupPushTokens`) needs the collection-group index
on `pushTokens.lastSeenAt` from `firestore.indexes.json`, deployed the same
way.

## 6. Making the first admin

There is deliberately no way to create an admin from inside the app. Not a
sign-up flow, not a hidden screen, not another admin — the rules refuse it.
That is the point: compromising any account in the app cannot produce a new
admin. The first one is made by hand, once, in the Firebase console.

1. Sign up in the app with the account you want to be the admin.
2. Firebase console → **Authentication** → **Users**. Find that email and copy
   its **User UID** (a long string like `kJ3n...`).
3. Firebase console → **Firestore Database** → **Start collection**, if you do
   not already have one, with the collection ID `roles`.
4. Add a document whose **Document ID is that UID exactly** — not
   auto-generated — with two fields:

   | Field       | Type    | Value   |
   | ----------- | ------- | ------- |
   | `role`      | string  | `admin` |
   | `suspended` | boolean | `false` |

5. Reload the app. **Profile → Settings → Admin console** now appears.

That is the only step that happens outside the app, and the only rank
there is to grant: there are two ranks, an ordinary user and an admin, and
no lesser rank to appoint from inside the app. Warning, suspending and
un-suspending, closing and reopening, taking activities down and putting
them back all happen in the console at `/admin`. `admin` itself is the one
rank with no button anywhere.

To check it worked without a queue to look at: Settings shows an "Admin
console" row to the admin, the web header carries a shield, and `/admin`
shows a closed door to everyone else. The console is an internal desk
outside the app's shell — a sidebar, tables, a panel for the selected
record — see ARCHITECTURE.md §4, ADR-023 and ADR-024.

## 7. Project structure

```
src/
  firebase/          the only place that talks to Firebase
    config.js          initialisation, emulator wiring, env validation
    auth.js            sign up / in / out, readable error messages
    users.js           public + private profile documents
    activities.js      create, edit, join, leave, cancel
    pictures.js        separate picture documents, batched with their parent
    messages.js        activity chat
    notifications.js   per-user inbox and following
  context/
    AuthContext.jsx    who is signed in; nothing else
    AppContext.jsx     live application data and every write action
  hooks/               useThread, useDeviceLocation, usePicture
  services/
    compatibility.js   people compatibility; "somebody like you is going"
    aiPicks.js         what goes to Gemini, and what is made of its answer
    interestPicks.js   the AI Picks page's by-interest grouping
  utils/               geo (haversine, formatting), time, storage
  pages/               one file per screen
  components/          shared UI
tests/rules/           security rule tests
scripts/seed.js        demo data loader for the emulators
firestore.rules        the security rules themselves
```

Shared writes go through `AppContext`; profile forms call the profile data
module directly, and reads use contexts or shared hooks (ARCHITECTURE §1).
The `services/` modules are deliberately pure: they take data and return
values, so they can be tested without a database.

## 8. Data model

```
users/{uid}                       PUBLIC — any signed-in user can read
  uid, name, avatar, username, bio,
  interests[], preferredTime, historyCategories[], anonymous, pictureVersion?

  private/profile                 PRIVATE — only the owner can read
    email, realName, privacy{}, location{lat,lng}, onboarded

  notifications/{id}              owner reads; anyone may write one
  following/{targetUid}           owner only

activities/{id}
  title, description, category, tags[],
  locationName, lat, lng,
  date, time, startsAt, timeBand,
  capacity, participantUids[],
  hostId, hostName, hostAvatar, hostPictureVersion?, status, pictureVersion?

  messages/{id}                   participants only

profilePictures/{uid}             owner writes; anonymous photos are owner-only
  dataUrl, version, updatedAt

activityPictures/{id}             host writes, following activity edit permission
  dataUrl, version, updatedAt
```

Two decisions worth explaining, because both were forced by how security
rules actually evaluate:

**Membership is an array on the activity, not a subcollection with a counter.**
Rules evaluate each write independently and cannot see sibling writes in the
same batch. With a separate roster and counter, "increment because I joined"
and "increment because I felt like it" are indistinguishable, so anyone could
inflate any activity to full and lock others out. One field on one document
makes each change atomically checkable.

**Hosts cancel once others have joined.** A host can delete an unused
activity, with its picture removed in the same batch. Once others join,
cancellation preserves their plans and chat history.

## 9. Security model

Everything the interface implies is enforced in `firestore.rules`, because a
determined user can call Firestore directly without going through the UI:

- Signed-out users can read nothing at all.
- You can only edit your own profile, and cannot reassign your `uid`.
- You can only change your own profile picture or pictures for activities
  you host and may edit. Picture writes are size/type constrained and tied
  to the parent's version. Anonymous profile pictures cannot be read by
  another account, even an admin.
- Your email, your real name while anonymous mode is on, and your stored
  position live in a document nobody else can read. Firestore has no
  field-level read rules, so this separation is the only way to make it real
  rather than cosmetic. Turning on anonymous mode also rewrites the copy of
  your name held on every activity you host — see ADR-005, including what it
  deliberately does not cover.
- Only a host can edit their activity, and they cannot add participants,
  invent a roster, hand the activity to somebody else, or cut capacity below
  the people already in. A host can delete an activity only while nobody else
  has joined; once anyone has, it can only be cancelled, so their plans and
  chat history survive.
- You can only add or remove _yourself_ from a roster, only once (duplicates
  are rejected, or one person could take every seat), and only if there is
  room and the activity is still active.
- Activity chat is readable and writable only by participants, messages
  cannot claim another sender, and the thread is append-only — no silent
  edits, no deleting evidence.
- Chat closes 30 days after the activity. This is enforced by the rules, not
  filtered in the app, so it holds against anyone querying the database
  directly. It expires _access_, not the documents — see ADR-010.
- Notifications can be sent by anyone (that is how "Alex joined your
  activity" works) but only in a fixed shape and only as unread, so nobody
  can forge a pre-read system message.
- Your block list is private to you. Publishing it would tell people they had
  been blocked and by whom, so the rules read it with `exists()` — which sees
  past read permissions — and enforce blocking without ever exposing it.
- Reports are immutable once filed, to everyone including the person who filed
  them. Evidence either side can alter or quietly withdraw is not evidence.
- Every path not explicitly allowed is denied.

All of this is covered by tests — see below.

## 10. How recommendations work

Gemini ranks; the app checks. The AI Picks page asks Gemini to put the
activities you could join in order and say why each one fits, from your
interests, what you have joined, your preferred time and how far away
things are. Nothing in the app scores an activity any more: the weighted
six-signal engine that used to rank the feed was removed on 2026-09-22
(ADR-030, with its measurement kept in `EVALUATION.md` as history). What
the browser still does is decide what is _eligible_ — upcoming, not full,
inside your discovery filters, hosted by nobody you blocked, not already on
your list — and attach the one fact only it can compute: whether somebody
genuinely like you has joined (a peer at compatibility 50 or above; see
`src/services/compatibility.js`, which is also what the People match
screen ranks with). Every other screen lists activities soonest first.

When Gemini has no answer — no key on the server, the hourly or daily cap,
an outage, an answer that does not parse — the page shows the same
activities soonest first under a line that says they are **not ranked**,
with a way to ask again. There is no second ranking to fall back on, and
the page does not pretend there is.

### AI Picks: what goes to Gemini and what comes back

How a request goes:

1. The browser takes what you could join — upcoming, not full, inside your
   discovery filters, hosted by nobody you blocked, not already on your
   list — keeps the forty soonest (a cost cap, not a ranking), and sends
   them to the `recommendActivities` Cloud Function with your signals:
   interests, the categories you have joined (with counts), your preferred
   time of day, whether your distance is known, and the names of the
   places you have joined activities at. Per activity: title, category,
   time band, days ahead, rounded distance, the place's name as its host
   wrote it, spots left, whether similar people are going, and a trimmed
   description. **Never** your name, email, host names, coordinates,
   photos or messages (place names go by name only — ADR-031).
   `src/services/aiPicks.js`.
2. The Function refuses anything but a signed-in account and a request of
   exactly that shape, checks its cache (the same question in the last ten
   minutes is answered without a model call), counts the call against the
   person's hour (10) and the day's total (1,500), and only then calls
   Gemini — `gemini-3.5-flash-lite` through the official `@google/genai`
   SDK, Interactions API, JSON output against a schema, `store: false`, one
   retry, a 20 s timeout. `functions/lib/picks.js`, `recommend.js`,
   `gemini.js`.
3. The answer is a list of ids with reason **codes**, not prose. An id the
   model was not given is dropped, a repeat is dropped, and each code is
   kept only when the data supports it (`interest` needs the category in
   your interests, `time` needs the band to match, `distance` needs a known
   distance of 3 km or less, `place` needs the activity's place to be one
   you have joined at, and so on). The browser checks the ids again
   against what is on screen and words the reasons from the activity's own
   data, in your language.
4. Titles and descriptions are other people's text: the prompt says they
   are data to judge, never instructions, and the schema cannot carry
   anything but ids and codes back.

**Secrets and setup (owner-only).** The Function needs a Gemini API key,
kept in Secret Manager and never in the browser or a `VITE_` variable:

```bash
# 1. Get a key: https://aistudio.google.com/apikey (a Google Cloud project;
#    the free tier works, and its "content may be used to improve products"
#    terms apply — with billing on the key, it does not).
# 2. Store it as a secret (the project must be on Blaze to run Functions;
#    smartsync-c1f07 has been since 2026-09-21):
npx firebase functions:secrets:set GEMINI_API_KEY --project smartsync-c1f07
# 3. Deploy the Function (and the rules, which now name the two AI Picks
#    collections):
npx firebase deploy --only functions:recommendActivities,firestore:rules --project smartsync-c1f07
```

Optional tuning, in `functions/.env` (ignored by git, read at deploy):
`GEMINI_MODEL` (default `gemini-3.5-flash-lite`), `PICKS_USER_HOURLY_CAP`
(default 10), `PICKS_DAILY_CAP` (default 1500). Set a Cloud Billing budget
alert; at the documented prices the daily cap bounds the model cost to a
few dollars a day even with every request a miss.

**Locally** the emulator reads the key from `functions/.secret.local`
(`GEMINI_API_KEY=…`, ignored by git). Without one, the Function answers
"not configured" and the page shows what is on, unranked. To exercise the
whole path without a key or a bill, run the stand-in server and point the
SDK at it:

```bash
node scripts/fake-gemini.mjs                          # 127.0.0.1:5599
# functions/.secret.local: GEMINI_API_KEY=fake-local-key
# functions/.env.local:    GEMINI_BASE_URL=http://127.0.0.1:5599
```

`FAKE_GEMINI_MODE=error|quota|garbage|slow` makes it fail in each way the
Function handles. The base URL override is honoured under the emulator
only.

## 11. Testing

```bash
npm test
```

This runs five suites. The unit and rendering tests (`npm run test:unit`)
cover the pure functions, the screens, the push policy and wording, and the
service worker against a stand-in for the worker's globals. The rules tests
(`npm run test:rules`) behave like a hostile client and check the rules
refuse them — `roles-matrix.test.js` checks who may do what to whom at every
combination of rank and relationship. The integration tests
(`npm run test:integration`) run the auth and Firestore emulators together.
The push tests run the delivery pipeline through the Admin SDK against the
Firestore emulator (`npm run test:push`) and the trigger itself in the
functions emulator (`npm run test:push:trigger`). Everything past the first
suite needs Java, like the emulators.

```bash
npm run lint
npm run format:check
```

## 12. Known limits

Honest about what is not there:

- **Browser push needs the Blaze plan, and iPhones need the Home Screen.**
  The inbox is the record; a push is a copy of it sent by a Cloud Function,
  which the free plan cannot run. On iOS, Safari delivers push only to a
  site added to the Home Screen. There is no email channel yet.
- **Pictures are resized copies.** Originals are not retained. Profile photos
  have a maximum edge of 512 px and activity pictures 1440 px, reduced further
  if needed to fit a 320,000-character data URL. Separate Firestore documents
  keep photos out of the feeds, but storage and photo reads still count toward
  Firebase quotas. Full-resolution media would need object storage (ADR-025).
- **No place search.** Hosts place a pin on a map rather than typing an
  address and having it geocoded.
- **Android is untested.** Confirmed working on iPhone Safari and on
  Chromium; nothing has been run on an Android device.
- **Past activities are not archived.** Anything that started more than a day
  ago simply stops being fetched.
- **Chat is closed, not deleted.** After 30 days nobody can read a thread, but
  the documents still exist. Real deletion needs a scheduled job, which on
  Firebase means Cloud Functions and the paid plan.
- **Anonymity is not retroactive for chat.** It covers your profile and the
  activities you host, but messages keep the name they were sent under.
- **Moderation is manual, and every admin is made by hand.** Nothing is
  detected or actioned automatically — a human reads every report. An admin
  has to be created in the Firebase console, because there is deliberately no
  in-app path to that rank and no lesser rank to hand out; everything after
  that happens in the app. A suspended admin is lifted in the console too,
  since no admin may act on another.
- **An admin can see a report filed about themselves.** They cannot act on
  it — the rules refuse that — but they can read it, and so learn who filed
  it. Firestore has no field-level read rules and refuses a whole query if any
  document in it fails, so those reports are hidden from that reviewer's queue
  in the client only. ADR-011.
- **Blocking hides, it does not conceal.** Somebody you blocked cannot join
  your activities or reach you, and you stop seeing them everywhere — but they
  are not told, and their own view of public activity listings is unchanged.
