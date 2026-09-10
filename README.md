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
6. [Project structure](#6-project-structure)
7. [Data model](#7-data-model)
8. [Security model](#8-security-model)
9. [How recommendations work](#9-how-recommendations-work)
10. [Testing](#10-testing)
11. [Known limits](#11-known-limits)

---

## 1. What it does

- **Accounts.** Email and password sign-up, sign-in and password reset.
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
  message arrives.
- **People matching.** Other users ranked by how compatible their interests,
  preferred times and activity history are with yours.
- **Privacy controls.** Anonymous mode genuinely removes your name from the
  profile document other people can read. Approximate location rounds your
  position to roughly a kilometre before it is stored at all.
- **Blocking and reporting.** Block someone and you stop seeing their
  activities, their profile and their messages — and the database refuses to
  let them join anything you host. Report a person, an activity or a single
  message, with the thing you were looking at attached.

## 2. Running it locally without a Firebase account

The Firebase Emulator Suite runs the entire backend on your machine. No
Firebase project, no credit card, nothing leaves your computer.

**Requirements:** Node.js 18+, npm, and Java 11+ (the Firestore emulator is a
Java program — check with `java -version`).

```bash
npm install
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

The emulator UI at <http://127.0.0.1:4000> shows the database contents while
you click around.

## 3. Connecting your own Firebase project

Steps 1–4 have to be done by you in the Firebase console; they involve
creating an account and are not something the code can do for itself.

1. Go to <https://console.firebase.google.com> and **Add project**. The free
   Spark plan is enough for everything here.
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

```bash
npm run deploy
```

That builds the app and pushes both the static site and the security rules to
Firebase Hosting. The console prints the live URL.

## 6. Project structure

```
src/
  firebase/          the only place that talks to Firebase
    config.js          initialisation, emulator wiring, env validation
    auth.js            sign up / in / out, readable error messages
    users.js           public + private profile documents
    activities.js      create, edit, join, leave, cancel
    messages.js        activity chat
    notifications.js   per-user inbox and following
  context/
    AuthContext.jsx    who is signed in; nothing else
    AppContext.jsx     live application data and every write action
  hooks/               useThread, useDeviceLocation
  services/
    recommendationService.js   pure scoring and matching logic
  utils/               geo (haversine, formatting), time, storage
  pages/               one file per screen
  components/          shared UI
tests/rules/           security rule tests
scripts/seed.js        demo data loader for the emulators
firestore.rules        the security rules themselves
```

Screens never import `firebase/*` directly — they go through the two
contexts. `recommendationService.js` is deliberately pure: it takes data and
returns numbers, so it can be tested without a database.

## 7. Data model

```
users/{uid}                       PUBLIC — any signed-in user can read
  uid, name, avatar, username, bio,
  interests[], preferredTime, historyCategories[], anonymous

  private/profile                 PRIVATE — only the owner can read
    email, realName, privacy{}, location{lat,lng}, onboarded

  notifications/{id}              owner reads; anyone may write one
  following/{targetUid}           owner only

activities/{id}
  title, description, category, tags[],
  locationName, lat, lng,
  date, time, startsAt, timeBand,
  capacity, participantUids[],
  hostId, hostName, hostAvatar, status

  messages/{id}                   participants only
```

Two decisions worth explaining, because both were forced by how security
rules actually evaluate:

**Membership is an array on the activity, not a subcollection with a counter.**
Rules evaluate each write independently and cannot see sibling writes in the
same batch. With a separate roster and counter, "increment because I joined"
and "increment because I felt like it" are indistinguishable, so anyone could
inflate any activity to full and lock others out. One field on one document
makes each change atomically checkable.

**Hosts cancel; nothing is hard-deleted.** Deleting an activity document would
strand its message subcollection as unreachable orphans and erase the chat
history of everyone who had joined.

## 8. Security model

Everything the interface implies is enforced in `firestore.rules`, because a
determined user can call Firestore directly without going through the UI:

- Signed-out users can read nothing at all.
- You can only edit your own profile, and cannot reassign your `uid`.
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

## 9. How recommendations work

Measured, not asserted: `EVALUATION.md` reports precision@5, MRR and NDCG
against random, popularity, distance and interest-only baselines, plus a
per-signal ablation. Run it with `npm run evaluate`. The weights are also
adjustable in the app under Settings → Matching weights, with the ranking
reordering live.

Each activity is scored out of 100 for the current user:

| Signal     | Weight | Meaning                                                       |
| ---------- | ------ | ------------------------------------------------------------- |
| Interest   | 35     | Category matches a stated interest (tag match scores partial) |
| Distance   | 20     | How near it actually is, from real coordinates                |
| Time       | 15     | Its time band matches your preferred time                     |
| History    | 15     | You have joined this category before                          |
| Popularity | 10     | How full it is                                                |
| Behaviour  | 5      | Whether genuinely similar users joined it                     |

The behaviour signal is derived, not stored: a peer counts as similar when
their compatibility score is at or above 50. Compatibility itself uses a
Jaccard index over interests, so listing every interest going does not make
you compatible with everybody.

An unknown distance scores neutrally rather than as zero kilometres — no
reward and no penalty for a fact nobody knows yet.

## 10. Testing

```bash
npm test
```

This boots the Firestore emulator and runs the security rule suite: 61 tests
that behave like a hostile client and check the rules refuse them. It needs
Java, like the emulators.

```bash
npm run lint
npm run format:check
```

## 11. Known limits

Honest about what is not there:

- **Notifications are in-app only.** There is no push notification to a closed
  phone; that needs Firebase Cloud Messaging and a service worker.
- **No photo uploads.** Avatars are generated initials.
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
- **Reports have no in-app queue.** They are stored and reviewed through the
  Firebase console; there is no moderator screen, and no automated action is
  taken. The wording shown to a reporter says the report was sent and will be
  reviewed, and deliberately promises nothing more than that.
- **Blocking hides, it does not conceal.** Somebody you blocked cannot join
  your activities or reach you, and you stop seeing them everywhere — but they
  are not told, and their own view of public activity listings is unchanged.
