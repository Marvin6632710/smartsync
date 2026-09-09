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
4. [Deploying](#4-deploying)
5. [Project structure](#5-project-structure)
6. [Data model](#6-data-model)
7. [Security model](#7-security-model)
8. [How recommendations work](#8-how-recommendations-work)
9. [Testing](#9-testing)
10. [Known limits](#10-known-limits)

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
all of them is `demo1234`:

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

## 4. Deploying

```bash
npm run deploy
```

That builds the app and pushes both the static site and the security rules to
Firebase Hosting. The console prints the live URL.

## 5. Project structure

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

## 6. Data model

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

## 7. Security model

Everything the interface implies is enforced in `firestore.rules`, because a
determined user can call Firestore directly without going through the UI:

- Signed-out users can read nothing at all.
- You can only edit your own profile, and cannot reassign your `uid`.
- Your email, your real name while anonymous mode is on, and your stored
  position live in a document nobody else can read. Firestore has no
  field-level read rules, so this separation is the only way to make it real
  rather than cosmetic.
- Only a host can edit their activity, and they cannot add participants,
  invent a roster, hand the activity to somebody else, or cut capacity below
  the people already in.
- You can only add or remove _yourself_ from a roster, only once (duplicates
  are rejected, or one person could take every seat), and only if there is
  room and the activity is still active.
- Activity chat is readable and writable only by participants, messages
  cannot claim another sender, and the thread is append-only — no silent
  edits, no deleting evidence.
- Notifications can be sent by anyone (that is how "Alex joined your
  activity" works) but only in a fixed shape and only as unread, so nobody
  can forge a pre-read system message.
- Every path not explicitly allowed is denied.

All of this is covered by tests — see below.

## 8. How recommendations work

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

## 9. Testing

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

## 10. Known limits

Honest about what is not there:

- **Notifications are in-app only.** There is no push notification to a closed
  phone; that needs Firebase Cloud Messaging and a service worker.
- **No photo uploads.** Avatars are generated initials.
- **No place search.** Hosts place a pin on a map rather than typing an
  address and having it geocoded.
- **Verified on Chromium.** Not yet tested on Safari or a physical iPhone.
- **Past activities are not archived.** Anything that started more than a day
  ago simply stops being fetched.
