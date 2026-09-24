# SmartSync — handing the work to another agent

Updated 2026-09-24. The latest source release is a pushed Messages-page
redesign that has not been deployed. The earlier source/data release renamed
two demo identities and granted both active admin rows; the underlying live
application remains the moderated-chat build from `6b323f6`. Source is on
`origin/main`, `sendChatMessageCall` is active, and Hosting still serves the
previous checksum-verified build.
This is the briefing for a fresh agent with none of the conversation behind it.
Read this first, then
[CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md) for the feature-by-feature state
and [HANDOFF.md](HANDOFF.md) for what each recent change actually did.

**Latest source release, 2026-09-24: committed and pushed after localhost
owner review; not deployed.** `/messages` is now a modern, medium-width inbox:
a compact search/filter toolbar and one divided conversation surface replace
the sparse stack of rounded cards. Bright circular category pictograms are
replaced by calm activity-title monograms with slim category-colour rails, and
the title/sender/preview/time hierarchy is clearer on laptop and phone. All
thread selection, sorting, filtering, searching, anonymous-name handling and
navigation behavior is unchanged. The subtitle is translated in all four
locales. Local dark-mode phone and 1440 px checks passed, including search and
Hosting filtering; **957 unit/app tests pass**, with lint, Prettier, Maps
configuration and build clean. No rules, Functions, data model or ADR changed.

**Latest data/source release, 2026-09-24: committed, pushed and verified; Hosting
redeployed.** The existing demo-account UIDs and passwords were preserved while
`alex@smartsync.demo` / Alex Chen became
`marvin@smart.sync.demo` / Zwe Khat Lin, and `maya@smartsync.demo` / Maya Rahman
became `lotus@smart.sync.demo` / Chaw Yadanar Oo. Auth, public/private profiles
and hosted activities were updated and verified. Historical snapshots and the
usernames `@alexc` / `@mayar` remain unchanged. Both accounts now have active
admin rows in production and the running emulator, assigned through privileged
Firebase access; there is still no app path that can grant admin. The source
changes were seed and documentation files only; the app bundle is unchanged.

**Latest release, 2026-09-24: live in `6b323f6`.** It shortens moderated-chat
latency and quiets the pending state. One Admin SDK `getAll` preflight reads the
existing message, activity, role and sender profile. Typed-text moderation,
image moderation and OCR start together; OCR output is moderated as the
dependent second stage. A captioned picture with OCR therefore still has up to
four OpenAI requests, but its first three no longer run serially. The 8-second
OpenAI abort now includes response body parsing. Pending sends use a normal
own-message bubble with a small spinner beside the time; there is no visible
**Checking** heading/long sentence or permanent composer note, and delivered
own messages get a subtle check. The screen-reader status remains.

This is a latency and presentation change only. Clients still write no chat
content, and the Function still writes no message, picture or notification
until every required moderation stage allows it.

Release verification: **957 unit/app and 402 rules tests pass**; lint, Prettier,
Maps configuration and the production build are clean. Production lists the
callable as active, the live JS/CSS checksums match the local build, and a
signed-in live chat opened successfully. No production message was sent during
the smoke test.

**The exhibition is Friday 25 September 2026.** Nothing below is worth
breaking the live site for.

---

## 1. What this is

A React 18 + Vite + Firebase social app: people post activities, others
join them, each activity has a chat. Final-year student project, live at
<https://smartsync-c1f07.web.app>, repository
`Marvin6632710/smartsync`.

|           |                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Front end | React 18, Vite, React Router 7, i18next (en / th / my / zh)                                                                  |
| Back end  | Firebase Auth, Cloud Firestore, Cloud Functions (2nd gen, `us-central1`)                                                     |
| Plan      | Blaze. Gemini and OpenAI keys live in Secret Manager, never in the client                                                    |
| Tests     | Vitest. Current fast baseline: 957 unit/app, 402 rules; last auxiliary runs: 8 integration, 11 push delivery, 3 push trigger |

```bash
npm run emulators    # terminal 1 — Firebase emulators (needs Java)
npm run seed         # terminal 2 — demo accounts and activities
npm run dev          # terminal 3 — Vite on :5173
npm test             # everything; test:unit / test:rules for the fast two
npm run lint && npm run format:check
```

Emulator ports are **not** the defaults: Firestore 8181, Auth 9099,
Functions 5001, UI 4000. The test config (`firebase.test.json`) uses a
second set so suites can run while you are developing.

---

## 2. How this owner works

Learn this before writing code; it matters more than any of the
architecture below.

- **Build → they test on localhost → they say "commit and deploy".**
  Never commit, push or deploy unasked. When work is ready, say so and
  stop.
- **They will override your recommendation, and that is fine.** Give the
  recommendation once, plainly, then do what they decided. Several of
  the best decisions in this repo are theirs against advice.
- **If a request is ambiguous, ask before building.** They have said so
  explicitly. A wrong reading has cost a whole rebuild here before.
- **Keep the documentation current at the end of every task.**
  `HANDOFF.md` and `CLAUDE_HANDOFF.md` are the entry points; a design
  decision gets an ADR in `DECISIONS.md`; a shipped change gets a
  `FIXLIST.md` entry; anything a user can see gets all four locales.

### Secrets — hard rules

- **Never print, paste or commit an API key or a password.** To check a
  secret, pipe it: `npx firebase functions:secrets:access NAME | python3
-c "import sys; k=sys.stdin.read().strip(); print(len(k), k[:7])"`.
- `demo-credentials.local.txt` holds the live demo password and is
  gitignored. **Do not sign in as the user.** If a live check needs an
  account, write a script that reads that file itself and ask them to
  run it — `scripts/live-chat-check.mjs` is the working example.
- `functions/.secret.local` and `functions/.env.local` are gitignored
  emulator config. They are not in git and must not go in.

### Commit style

Prose, not bullet lists. Say what changed and **why it had to**, in
plain sentences; name the alternative that was rejected where there was
one. Look at `git log` before writing one. End every message with:

```
Co-Authored-By: <your model name> <noreply@anthropic.com>
```

### Code style

Comments in this codebase explain _why_, never _what_ — and they are
written for a person reading the file cold, including the reasoning and
the rejected alternative. Match that density and that voice; it is the
house style and the owner values it. Prettier and ESLint are enforced
(`npm run lint`, `npm run format:check`). Locale JSON is outside
Prettier's scope — write it with `json.dumps(indent=2,
ensure_ascii=False)`. **th, my and zh take `_other` plural keys only;
en takes `_one` and `_other`.**

---

## 3. The two things that carry the marks

Both shipped and live. Understand them before touching anything near
them.

### Chat moderation (ADR-033) — README §11

Every chat message and picture is checked **before** it is written.
The design rests on one line: `firestore.rules` says `allow create: if
false` on `activities/{id}/messages` and on `chatPictures`. **No client
can write a chat message.** The only writer is `sendChatMessageCall`, a
callable using the Admin SDK, which re-checks membership, suspension,
closure and the 30-day window itself and then moderates via OpenAI's
`omni-moderation-latest`.

If you change anything here, the property to preserve is that one:
_there is no request a client can make that puts words in a thread
unchecked._ `scripts/live-chat-check.mjs` proves it against the live
site; the last row of its output is the one that matters.

The deployed `6b323f6` optimization preserves that property. It replaces
separate preflight reads with one four-document read round and overlaps the
independent text, image and OCR requests. Moderating OCR output remains a
required second stage, and the approved message, optional picture and chat
notifications remain one final batch after the verdict.

**The floors were measured, not guessed** (README §11 has the table).
The harassment floor is **0.85** because ordinary messages score up to
0.807 — "your idea is rubbish" scores 0.807, friendly teasing 0.803 —
and real abuse starts at 0.889. The margin is 0.043. A test names those
numbers so a change that closes the gap fails the suite rather than the
chat. **Do not adjust a floor without re-measuring against the real
API.**

Known and documented: it cannot tell a threat from trash talk, misses
calmly-worded stalking, and does not classify "go back to your own
country" as hate. Report and the admin console are the answer for the
rest. Say this plainly if asked; it is in README §11 and it is the
project's best material.

### The age gate (ADR-034) — README §9 and §13

Fifteen and over. A **date of birth**, private, never public; the
_age_ derived from it can go on the public profile but only by consent,
and withdrawing consent sets the field to `null` so the number leaves
rather than being hidden. `src/utils/age.js` is the whole policy —
`MIN_AGE` is the one number to change. The rules enforce the minimum
independently of the form.

---

## 4. What is open

Ordered by what would hurt most to leave undone before Friday.

| #   | Item                                    | Notes                                                                                                                                                                                                              |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Demo accounts have no date of birth** | Every existing account is asked once on next entry — including the demo ones. Sign in to each on the live site and answer it, or an audience meets the age screen first. **Owner's job; needs the live password.** |
| 2   | **B-08 data export**                    | `firebase firestore:export` before the defence so a bad write is recoverable. Cheap insurance.                                                                                                                     |
| 3   | **D-03 backup demo video**              | So venue wifi failing is not a failed defence.                                                                                                                                                                     |
| 4   | **B-09 accessibility sweep**            | Keyboard-only pass through the main flow plus a contrast check. Often explicitly on the rubric.                                                                                                                    |
| 5   | **B-07 quota sanity check**             | Confirm a demo session is nowhere near the read limits; do not leave tabs holding listeners open overnight.                                                                                                        |
| 6   | **D-04 report and slides**              | Most required artefacts (SRS, UML, test matrix) can be pulled straight from this repo.                                                                                                                             |

### Known gaps that are _not_ bugs — do not "fix" them by accident

- **`onNotificationCreated` and `cleanupPushTokens` have never been deployed.**
  Production currently has nine callables and the timed-suspension scheduler;
  `firebase functions:list` shows them. Browser push writes the inbox record
  but delivers no push. Deploying the push pair is a real change with real
  cost; it is a decision, not a chore.
- **`moderationBlocks` are never deleted.** Held copies of refused
  messages stay for the retention window. A scheduled cleanup needs
  Cloud Scheduler and has not been written.
- **Android is untested.** Confirmed on iPhone Safari and Chromium only.
- **The age gate is self-declared** and the moderation floors are
  model-dependent. Both are documented as such. Do not quietly present
  either as stronger than it is.

---

## 5. Traps this project has already fallen into

Every one of these cost real time. They are in the code comments too,
but they are worth reading before you start.

- **A definitely-placed CSS grid item is placed _before_ auto-placed
  ones.** A `::after` with `grid-column: 1` stole cell 1 and pushed both
  real columns along. If you add a decorative grid child, pin the real
  columns explicitly.
- **i18next returns the key when `defaultValue` is empty.** Use
  `i18n.exists()` when a key may legitimately be missing.
- **The Firestore emulator REST API needs `Authorization: Bearer
owner`** or it silently returns nothing — it does not error.
- **`functions/.env.local` is picked up without restarting the
  emulator**, but production has no `functions/.env` at all, so
  production runs the defaults. They differ today: image-text reading is
  **on** in production and **off** locally.
- **Sign-up and the auth observer race** to create a profile. Anything
  that must be on a new profile has to travel through
  `pendingSignUpDetails`, not just be written by `signUp`.
- **React Compiler ESLint rules are on**: no ref writes during render,
  no setState in render.
- **Deploy order matters.** When rules and Functions change together,
  deploy **Functions first, then rules, then hosting**. The single
  combined command gives no ordering guarantee, and rules landing first
  with a failed Functions deploy means every chat message is refused
  with nothing able to write one.

---

## 6. Where things are

| Area                       | Files                                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routing and the gates      | `src/App.jsx` — closed account, then age, then onboarding, then the app                                                                                              |
| Identity                   | `src/context/AuthContext.jsx`, `src/firebase/auth.js`, `src/firebase/users.js`                                                                                       |
| Shared app data            | `src/context/AppContext.jsx`                                                                                                                                         |
| Chat moderation            | `functions/lib/{moderation,openai,chat,sendChat}.js`, `functions/index.js`, `src/firebase/chat.js`, `src/pages/ChatPage.jsx`, `src/console/pages/ChatBlocksPage.jsx` |
| Age gate                   | `src/utils/age.js`, `src/pages/AgeCheckPage.jsx`, `src/components/TooYoungScreen.jsx`                                                                                |
| AI Picks                   | `functions/lib/{picks,recommend,gemini}.js`, `src/services/aiPicks.js`, `src/hooks/useAiPicks.js`                                                                    |
| Admin console              | `src/console/`                                                                                                                                                       |
| Expanded admin powers      | `functions/lib/admin.js`, `src/firebase/admin.js`, `src/pages/AppealsPage.jsx`, `src/console/pages/{Appeals,Announcements}Page.jsx`                                  |
| Rules                      | `firestore.rules` — the security model, and the enforcement for both features above                                                                                  |
| Stand-ins for the emulator | `scripts/fake-openai.mjs`, `scripts/fake-gemini.mjs`                                                                                                                 |
| Live check                 | `scripts/live-chat-check.mjs`                                                                                                                                        |

Reading order for a cold start: `README.md` §7–§11, then
`firestore.rules` top to bottom, then `DECISIONS.md` from ADR-029.

---

## 7. The prompt to start with

Paste this into the new agent.

> You are picking up SmartSync, a React 18 + Vite + Firebase final-year
> project, live at https://smartsync-c1f07.web.app. The working
> directory is the repository root; tracked project files on `main` are
> synchronized with `origin/main`, and the application release is deployed.
>
> **Read `CODEX_HANDOFF.md` first, in full, before doing anything
> else.** It covers how the owner works, the secrets rules, the two
> features that carry the marks, what is still open, and the traps this
> project has already hit. Then read `CLAUDE_HANDOFF.md` for the
> feature-by-feature state.
>
> Working agreement, from the owner: build the change, tell them it is
> ready, and let them test it on localhost. **Do not commit, push or
> deploy until they say so.** If a request could be read two ways, ask
> before building rather than guessing. Keep `HANDOFF.md`,
> `CLAUDE_HANDOFF.md`, `FIXLIST.md`, `DECISIONS.md` and all four locale
> files current as part of finishing a task, not afterwards.
>
> Never print, paste or commit an API key or password, and do not sign
> in as the user — if a check needs a live account, write a script that
> reads `demo-credentials.local.txt` itself and ask them to run it.
>
> The exhibition is **Friday 25 September 2026**, so prefer small,
> verified changes over ambitious ones, and do not break the live site.
>
> Start by confirming the project still builds and its tests pass
> (`npm run lint && npm run test:unit && npm run build`), then tell me
> what you understand the open items to be and which you would do first.

Give it the actual task after that, rather than in the same message —
it should read the briefing before it has an assignment pulling at it.
