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
11. [How chat moderation works](#11-how-chat-moderation-works)
12. [Testing](#12-testing)
13. [Known limits](#13-known-limits)

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
them back all happen in the console at `/admin`. The console also lets an
admin remove or restore a single public profile field, activity picture or
published chat message; choose a timed suspension; decide an appeal; revoke
sessions or trigger Firebase's password-reset email; and publish an expiring
announcement for everyone, hosts or participants. `admin` itself is the one
rank with no button anywhere.

Those newer actions are Cloud Functions, not privileged browser writes. The
Function checks the caller again, refuses self-actions and actions against
another admin, requires a reason, records the decision and notifies the
affected account. Content removals keep the original in a server-only vault,
so a reversal restores what was actually removed. A public lock prevents the
owner re-uploading or rewriting the field while the removal stands. Password
reset uses the account email only inside the Function; the console never sees
it. Accounts can open `/appeals` from Settings, from a moderation notice, or
even while closed, and admins decide the request in the Appeals section.
Under the local emulators the reset request stays in the Auth emulator and no
real email is sent.

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
  interests[], preferredTime, historyCategories[], anonymous, pictureVersion?,
  age?                            a number ONLY while its owner consents;
                                  null otherwise — absent, not hidden

  private/profile                 PRIVATE — only the owner can read
    email, realName, privacy{}, location{lat,lng}, onboarded,
    dateOfBirth                   never public under any setting

  notifications/{id}              owner reads; anyone may write one
  following/{targetUid}           owner only

activities/{id}
  title, description, category, tags[],
  locationName, lat, lng,
  date, time, startsAt, timeBand,
  capacity, participantUids[],
  hostId, hostName, hostAvatar, hostPictureVersion?, status, pictureVersion?

  messages/{id}                   participants read; NOBODY writes but the
                                  moderating Function — see section 11

chatPictures/{messageId}          participants read, within retention;
  activityId, senderId, dataUrl,  written only by that same Function
  createdAt

moderationBlocks/{clientMsgId}    admins read; written only by the Function
  uid, senderName, activityId,    — the held copy of a refused message,
  reason, source, categories[],   kept so a false positive can be undone
  severe, status, appealed?,
  text?, dataUrl?, hasImage

chatModeration/{uid}              nobody reads or writes but the Function
  sends{start,count}              — one person's hourly send allowance

chatModerationUsage/{YYYY-MM-DD}  nobody reads or writes but the Function
  count, updatedAt                — the app's daily new-send check budget

profilePictures/{uid}             owner writes; anonymous photos are owner-only
  dataUrl, version, updatedAt

activityPictures/{id}             host writes, following activity edit permission
  dataUrl, version, updatedAt

moderationVault/{actionId}         SERVER ONLY — original content removed by an admin
  kind, subjectId, activityId?, messageId?, original value/picture

moderationAppeals/{stableId}       subject + admins read; Function writes
  subjectId, kind, targetId, actionToken, detail, status, review lease/decision metadata

announcements/{id}                 active signed-in accounts read; Function writes
  title, body, audience, active, startsAt, expiresAt, createdBy
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
- **SmartSync is for people aged 15 and over, and the database is what
  enforces it.** The rules refuse a private profile carrying a date of
  birth under the minimum, so a client that skips the sign-up screen is
  refused exactly as one that uses it. The app asks before any other
  screen — above onboarding — and accounts made before the gate existed
  are asked too. It is self-declared and unverified; §13 says what that
  is and is not worth. ADR-034.
- Your email, your real name while anonymous mode is on, your date of
  birth, and your stored position live in a document nobody else can
  read. Your age can appear on your public profile, but only if you turn
  it on, and turning it off removes the number rather than hiding it —
  the date itself is never public under any setting. Firestore has no
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
- Activity chat is readable only by participants, and **writable by nobody**.
  `allow create: if false` — the only writer is the moderating Cloud
  Function, which re-checks membership, suspension and the retention window
  itself before it writes anything. That is what makes the check in section
  11 impossible to skip: there is no request a client can make, with or
  without the app, that puts words in a thread unchecked. The thread is
  still append-only — no silent edits, no deleting evidence — and a message
  still cannot claim another sender, because the sender is taken from the
  caller's token and never from the request.
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
- Admin content removals cannot be bypassed with a direct write. The rules
  preserve each public `contentModeration` lock and refuse changes to a locked
  profile field or picture document. Original content is in `moderationVault`,
  a collection with no client read or write path. Appeals and announcements
  are client-readable only to their intended audience and are Function-written.
- A future `suspendedUntil` blocks an account. Once that instant passes, rules
  stop treating the account as suspended even if the cleanup job has not yet
  cleared the role document. The scheduled Function removes stale flags and
  notifies the account every fifteen minutes; authorization never waits for it.
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
   Gemini — `gemini-3.5-flash` through the official `@google/genai`
   SDK, Interactions API, JSON output against a schema, `store: false`,
   no retry, a 90 s timeout (the Function gives up at 110 s, the browser
   at 115 s). Those are wide because the key is on a free-tier project,
   where a call queues for up to a minute — ADR-032. `functions/lib/picks.js`,
   `recommend.js`, `gemini.js`.
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
`GEMINI_MODEL` (default `gemini-3.5-flash`; `gemini-3.5-flash-lite` is
cheaper and faster when the account has capacity for it),
`PICKS_USER_HOURLY_CAP`
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

## 11. How chat moderation works

Every message and every picture in an activity chat is checked before
anybody else can see it. Not flagged after the fact, not reported by a
person who already read it — checked first, and only then written.

**The database refuses every client-written message.** `firestore.rules`
now says `allow create: if false` on `activities/{id}/messages`. The only
writer is a Cloud Function using the Admin SDK, which bypasses rules
because it _is_ the rule for a chat message: it re-checks everything the
old rules checked (a participant, of an activity that exists, inside the
retention window, not suspended, thread not closed) and then moderates.
There is no path around it. Turning off JavaScript, calling Firestore
directly, replaying the app's own request — none of them reach the
thread, because the thread is not writable by anyone holding a user's
credentials. That is the whole design in one sentence.

> **Current working tree, 2026-09-24:** the latency and pending-message UI
> refinement described below is uncommitted, not deployed and ready for
> localhost testing. It changes when independent work runs and how progress is
> shown; it does not change the server-only write boundary or the checks a send
> must pass.

### What gets checked

`sendChatMessageCall` checks up to three content sources:

1. **The text**, through OpenAI's Moderation API (`omni-moderation-latest`).
2. **The picture**, through the same call — the API takes images as well.
3. **The words inside the picture.** The Moderation API applies only six
   of its thirteen categories to images; `hate` and `harassment` are not
   among them. A slur typed onto a meme is therefore invisible to image
   moderation and visible to text moderation, so the picture is
   transcribed by a small vision model and the transcription is moderated
   as text. Turn this off with `CHAT_IMAGE_OCR=off` and that gap is open.

Three content sources do not mean three API requests. A captioned picture with
OCR can make four: typed-text moderation, image moderation, transcription, and
then moderation of the transcription. In the current uncommitted latency pass,
the first three start together because they are independent; OCR text is still
moderated as the required second stage. Results keep the fixed text → image →
image-text decision order regardless of which first-stage request finishes
first.

A category blocks only when the API's own boolean is true **and** its
score clears a floor kept in `functions/lib/moderation.js`. The booleans
are tuned for a general audience and fire on mild cases; the floors are
what keep a heated argument about a football match out of the blocked
pile. Blocked: targeted harassment (0.85), threats (0.35/0.3), hateful
abuse (0.45), sexual content (0.5), graphic violence (0.5), violent
wrongdoing (0.5), instructions for self-harm (0.4).

Deliberately **not** blocked: `violence` without `graphic` (that is how
people talk about a film or a tackle), `illicit` without violence, and —
this one matters — `self-harm` and `self-harm/intent`. Somebody telling
the group they are struggling is not abuse, and blocking it would take
the message away from the one person in the thread who might have
helped, and from the Report button too.

Ordinary swearing is allowed. `CHAT_PROFANITY_POLICY=block` makes it a
refusal instead, and `CHAT_PROFANITY_WORDS` extends the list without a
code change.

### What the real model actually does — measured, 2026-09-23

The floors above were chosen from the documentation and from reasoning
about what should and should not block. On 2026-09-23 they were measured
against `omni-moderation-latest` for the first time, over 60 messages
written for this app's own setting: activity groups, several of them for
board games and football. **One floor moved as a result, and the numbers
that moved it are worth reading, because they also say what this feature
cannot do.**

**Ordinary messages score far higher than expected.** Harassment scores
for messages that must reach the thread:

| message                                                          | harassment |
| ---------------------------------------------------------------- | ---------- |
| "that referee was absolutely awful, what a joke of a match"      | 0.196      |
| "this bloody bus is late again, what a shit day"                 | 0.402      |
| "come at me then, I will wipe the floor with you"                | 0.527      |
| "you are so bad at this game it is actually impressive"          | 0.803      |
| "if you bring that deck again I will end you, I swear"           | 0.804      |
| "honestly your idea is rubbish and you did not think it through" | 0.807      |

And for messages that must not:

| message                                                           | harassment |
| ----------------------------------------------------------------- | ---------- |
| "you are a disgusting waste of space and everyone is sick of you" | 0.889      |
| "nobody likes you, you are pathetic and everyone here knows it"   | 0.976      |
| "she is a fat ugly cow, look at her, what a joke"                 | 0.978      |

**At the original floor of 0.5 every message in the first table below
0.5 passed and every one above it was blocked** — criticism of an idea,
friendly teasing and board-game trash talk all refused. That is the one
failure that would have made the chat unusable, and it is why the floor
is now **0.85**: above everything in the first table, below everything
in the second.

The margin is 0.043. That is the whole of it, and it is the honest
measure of how much room this approach has.

### What it cannot separate, and why that is said out loud

**Threats and trash talk are the same thing to this model.**

| message                                                         | harassment | harassment/threatening |
| --------------------------------------------------------------- | ---------- | ---------------------- |
| "if you bring that deck again I will end you, I swear" — banter | 0.804      | 0.793                  |
| "if you show up I will kill you, I am not joking" — a threat    | 0.801      | 0.743                  |
| "I know where you live and I will be waiting outside"           | 0.028      | 0.007                  |
| "bring your friends, I will be bringing a knife"                | 0.020      | 0.037                  |

The banter scores _higher_ than the death threat on both axes, and the
two most frightening messages — stalking and a weapon, both calmly
worded — come back all but clean. No threshold on these two categories
separates the first row from the second, and none catches the third or
fourth at all. `harassment/threatening` is left at 0.35 because moving
it in either direction trades one of these failures for the other.

**Several kinds of abuse are missed entirely**, and not because of a
floor — the API's own boolean is false, so no threshold would reach
them:

| message                                                                | what the model said                         |
| ---------------------------------------------------------------------- | ------------------------------------------- |
| "go back to your own country, we do not want your kind here"           | hate **0.183** (not flagged as hate at all) |
| "nobody has to know, just come to my room, stop being frigid"          | nothing over 0.04                           |
| "mix it with alcohol and take the whole bottle, that is how you do it" | self-harm 0.126, not flagged                |
| "I would bend you over that table given half a chance"                 | sexual 0.204, boolean false                 |

On a held-out set of nineteen messages the floors had not been chosen
from, the policy was right on fourteen. All twelve that had to pass,
passed. Five that should have been blocked were not — the four above and
one more.

**So what this feature honestly is:** it reliably refuses flagrant,
unambiguous abuse — sustained personal attacks, pile-ons, graphic gore,
explicit sexual content, direct instructions for self-harm — and it
reliably leaves ordinary conversation alone, including argument,
swearing and competitive talk, which was the harder half. It is not a
threat detector, it is not a substitute for a human, and it misses
coercion and hostility phrased calmly. That is what Report and the admin
console are still for, and they are unchanged.

### What the person who wrote it sees

While moderation is running, the sender sees the message in the same shape as
their normal own-message bubble, with a compact spinner beside the time. There
is no visible **Checking** heading or long progress sentence, and the composer
does not carry a permanent moderation note. The checking description remains
available to screen readers. Once delivered, an own message has a subtle check
beside its time. The pending bubble is local UI state, not a message in the
thread.

The message never appears in the thread, so nothing has to be taken back.
It stays in their own composer area as an unsent bubble with a plain
reason — "This reads as targeting someone. Rewrite it and it can go
through." — and three choices: **Edit** (the words go back into the
composer, picture and all), **Discard**, or **Ask for a review**. The
reason is general on purpose. It never names the category or shows a
score, because a refusal that reads like a scorecard is an invitation to
tune a message until it passes.

A failure that is not a refusal says so honestly and keeps the message:
"The check could not be completed, so nothing was sent," with **Retry**.
Nothing is ever delivered unchecked because the checker was down.

### Human review

**Ask for a review** puts the message in front of an admin at
`/admin/chat`, with the held copy of the text and picture. Two answers:
**Uphold**, which closes it, or **Overturn and post**, which posts the
message the person actually wrote, from the copy the Function kept, and
deletes that copy in the same write. Putting right a false positive is
the message appearing in the thread — not an apology and a request to
type it again.

One kind of block has no held copy and no buttons: sexual content
involving minors. Nothing is kept at all, it cannot be appealed, and what
to do about it is not a click in a console. See the limitation below.

### Account setup and secrets

The Function needs an OpenAI API key, kept in Secret Manager and never in
the browser or a `VITE_` variable:

```bash
# 1. Make an account at https://platform.openai.com and create a key
#    (API keys → Create new secret key). A key is shown once.
# 2. Store it as a secret (the project must be on Blaze to run Functions):
npx firebase functions:secrets:set OPENAI_API_KEY --project smartsync-c1f07
# 3. Deploy the three callables and the rules that go with them:
npx firebase deploy \
  --only functions:sendChatMessageCall,functions:requestChatReview,functions:resolveChatBlock,firestore:rules \
  --project smartsync-c1f07
```

Deploy the rules and the Functions **together**, in that one command. The
rules stop clients writing messages; the Functions are what writes them
instead. Rules alone and chat stops working; Functions alone and the
moderation can still be walked around.

Optional tuning, in `functions/.env` (ignored by git, read at deploy):

| variable                | default        | what it does                                       |
| ----------------------- | -------------- | -------------------------------------------------- |
| `CHAT_USER_HOURLY_CAP`  | 60             | new chat send checks one person may start hourly   |
| `CHAT_DAILY_CAP`        | 5000           | new chat send checks the whole app may start daily |
| `CHAT_IMAGE_OCR`        | on             | `off` skips reading the words inside pictures      |
| `CHAT_PROFANITY_POLICY` | allow          | `block` refuses ordinary swearing too              |
| `CHAT_PROFANITY_WORDS`  | —              | comma-separated additions to the word list         |
| `OPENAI_VISION_MODEL`   | `gpt-5.6-luna` | the model that transcribes pictures                |

### What it costs

**The Moderation API is free** — no per-token charge for text or images.
That is the whole of the text path.

**But the account needs a credit balance anyway.** Free of per-token
charge is not the same as usable on an empty account: OpenAI gates API
access on having credits, and an account with none answers
`/v1/moderations` with a bare `429 "Too Many Requests"` and no
rate-limit headers — the same gate the paid endpoints report properly as
`insufficient_quota` / `credit_balance_exhausted`. Verified against this
project's own key on 2026-09-23: `/v1/models` answered 200, both other
endpoints 429. The minimum top-up is a one-off, and because moderation
itself is not charged per token, it is spent only on transcription.

The only paid part is reading the words inside a picture, and only when
`CHAT_IMAGE_OCR` is on. At `gpt-5.6-luna` prices ($0.20 per million input
tokens, $1.20 per million output), a chat picture is roughly 1,000 input
tokens and the transcription is capped at 400 output, so an upper bound
is about **$0.0007 a picture** — a thousand pictures is well under a
dollar. `CHAT_DAILY_CAP` bounds the worst case for the whole app.

The rest is Firebase, on the same Blaze plan AI Picks already needs: one
Function invocation per send, one server round trip that reads the existing
message, activity, role and sender profile together, the rate-limit transaction
and the final writes. A blocked message also has a held copy. Set a Cloud
Billing budget alert anyway.

### Running it locally

The emulator reads the key from `functions/.secret.local`
(`OPENAI_API_KEY=…`, ignored by git). Without one the Function answers
"not configured" and every message comes back as "could not be checked" —
deliberately, because the alternative is delivering unchecked messages.

To exercise the whole path without a key or a bill, run the stand-in and
point the adapter at it:

```bash
node scripts/fake-openai.mjs                          # 127.0.0.1:5699
# functions/.secret.local: OPENAI_API_KEY=fake-local-key
# functions/.env.local:    OPENAI_BASE_URL=http://127.0.0.1:5699/v1
```

It speaks both endpoints and answers by looking for marker words, so
every fixture is plainly safe to write down and read out at an
exhibition: `xharassx`, `xthreatx`, `xhatex`, `xsexualx`, `xviolentx`,
`xselfharmx`, `xminorsx`, and `xmildx` for the case that is flagged but
under the floor. `FAKE_OPENAI_MODE=error|quota|slow` makes it fail in
each way the Function handles, and `OPENAI_FAKE_IMAGE_TEXT='xhatex'`
makes every picture "contain" those words. The base URL override is
honoured under the emulator only.

### Known limitations

- **It refuses flagrant abuse; it does not catch everything.** Measured
  against the real model on 2026-09-23 (see above): on a held-out set of
  nineteen messages, all twelve that had to pass did, and five of seven
  that should have been blocked were not. Hostility phrased calmly gets
  through — "go back to your own country" is not classified as hate at
  all, and neither coercive sexual pressure nor an indirect description
  of a suicide method is flagged by the API in the first place, so no
  threshold here can reach them. Report and the admin console remain the
  path for everything the model misses.
- **It cannot tell a threat from trash talk.** "I will end you" about a
  board game and "I will kill you" to a person score within 0.01 of each
  other, and the calmest, most frightening messages — naming somebody's
  address, naming a weapon — come back almost clean. Anything relying on
  this feature to catch threats would be relying on the wrong thing.
- **The margin is 0.043.** The harassment floor sits at 0.85 because
  ordinary messages reach 0.807 and abuse starts at 0.889. That is the
  whole working range, and a model update could close it. The floor is
  pinned by a test naming the measured scores, so a change that breaks
  the separation fails the suite rather than the chat.
- **The behaviour of the code, rather than the model, is what the test
  suite proves.** The 912 unit/app tests and the rules suite run against
  the stand-in in `scripts/fake-openai.mjs`; the numbers above come from
  separate one-off probes against the live API, not from anything `npm
test` re-runs. Re-measuring after a model change is a manual job.
- **Image moderation covers six categories, not thirteen.** `hate`,
  `harassment`, threats and `sexual/minors` are applied to text only. The
  transcription step is what closes most of that gap, and it is a second
  model with its own failure modes — it can misread, and it can miss
  words in a script it handles poorly. A picture with no legible words
  and no sexual, violent or self-harm content is effectively unchecked
  for hate.
- **Sexual content involving minors is not detected here, and must not
  be.** OpenAI's own guidance is explicit: do not send known or suspected
  CSAM to the Moderation API. SmartSync therefore treats the
  `sexual/minors` category as a refusal signal only — the message is
  blocked, **nothing is retained**, there is no appeal and no console
  view. It is not a detector, and it is not a substitute for reporting to
  NCMEC or the relevant national authority, which is what an operator of
  a real service would be obliged to do.
- **A blocked message is kept for 30 days so it can be appealed.** Held
  copies live in `moderationBlocks`, readable by admins only, and are
  deleted when an appeal is overturned. An upheld one stays for the
  retention window. Deleting them on a schedule needs a Cloud Scheduler
  job that is not written yet.
- **It adds a wait to sending.** A captioned picture with OCR can make four
  OpenAI requests: typed-text moderation, image moderation and transcription
  start together, then the transcription is moderated as text. Each request
  has an 8-second abort that covers response-body parsing as well as response
  headers, inside a Function with a 60-second budget. Text alone is usually
  well under a second; a picture with OCR on is a few seconds. During that wait
  the normal own-message bubble shows a compact spinner beside its time; it is
  still only local pending state and has not reached the thread.
- **Moderation is English-first.** The refusal wording is translated into
  all four languages, but the model's own accuracy is best in English and
  the transcription step has not been measured on Burmese or Thai script.
- **A determined person can still test the boundary.** Floors mean a
  message just under one gets through, and a refusal tells you that
  something was refused. The rate limit — 60 messages an hour — is what
  bounds the tuning, along with Report and the admin console, which are
  unchanged and still the path for everything moderation is not meant to
  catch.

## 12. Testing

```bash
npm test
```

This runs five suites. The unit and rendering tests (`npm run test:unit`)
cover the pure functions, the screens, the push policy and wording, and the
service worker against a stand-in for the worker's globals. Chat moderation
has 71 of those — `chatModeration.test.js` argues with the policy itself
(which categories block, at what floor, which are deliberately left alone),
`chatServer.test.js` drives the whole send path against a stand-in adapter,
and `chatPage.test.jsx` covers what the person who wrote a refused message
sees and can do about it. All of them use harmless marker fixtures rather
than real abusive text, because what the policy actually reads is a set of
booleans and scores. The rules tests
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

## 13. Known limits

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
- **Only chat is moderated automatically; every admin is still made by
  hand.** Messages and pictures are checked before they are delivered
  (section 11). Everything else — activity titles and descriptions,
  profiles, bios, usernames, reports — is read by a human and always has
  been. An admin has to be created in the Firebase console, because there is
  deliberately no in-app path to that rank and no lesser rank to hand out;
  everything after that happens in the app. A suspended admin is lifted in
  the console too, since no admin may act on another.
- **Chat moderation has never been run against the real API.** Every test
  and every emulator pass uses the stand-in in `scripts/fake-openai.mjs`.
  The handling is proved; the floors are not. Section 11 lists the rest of
  what that feature does not cover — image categories the API applies to
  text only, the CSAM restriction, and the languages the transcription step
  has not been measured on.
- **An admin can see a report filed about themselves.** They cannot act on
  it — the rules refuse that — but they can read it, and so learn who filed
  it. Firestore has no field-level read rules and refuses a whole query if any
  document in it fails, so those reports are hidden from that reviewer's queue
  in the client only. ADR-011.
- **The age gate is self-declared and unverified.** SmartSync asks for a
  date of birth, refuses anything under 15 in the security rules as well
  as the form, and offers no "try again" on the refusal — but it has no
  way to check that the date is true, and a determined fourteen-year-old
  types a different year. Nothing short of an identity document would
  change that, and asking for one would collect far more than this
  needs. What the gate is honestly worth: the minimum is stated, asked
  before anything else, and cannot be walked around by a client that
  skips the form. ADR-034.
- **Blocking hides, it does not conceal.** Somebody you blocked cannot join
  your activities or reach you, and you stop seeing them everywhere — but they
  are not told, and their own view of public activity listings is unchanged.
