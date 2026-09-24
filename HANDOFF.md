# SmartSync — hand-off

Original hand-off written 2026-09-21 after removing the moderator rank and
shipping the admin console. Later picture-upload, search and map changes are
recorded below; the original session details remain for context. The current
demo-identity change is recorded first.

**Continuing in Claude Code?** Start with [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md)
for the current release, local setup, feature status and continuation steps.
Prepared 2026-09-21 from clean, synchronized `main` at `622ed9c`; later release
records below carry the current state.

## Latest data/source release — renamed admin demo identities (2026-09-24)

**Live and local data migrated and verified; source committed and pushed;
Hosting redeployed at the owner's request.** The existing demo accounts kept
their UIDs and passwords while these identities changed:

- `alex@smartsync.demo` / Alex Chen → `marvin@smart.sync.demo` / Zwe Khat Lin
- `maya@smartsync.demo` / Maya Rahman → `lotus@smart.sync.demo` / Chaw Yadanar Oo

Firebase Auth email/display name, public/private profiles and hosted activity
identity copies were updated in place: four live hosted activities and two
local-emulator activities per account. Old chat messages, notifications and
moderation snapshots deliberately keep the name present when they were
created, matching the normal rename policy. Internal seed keys and the visible
usernames `@alexc` / `@mayar` are unchanged because the owner requested only
email and person-name changes. Both accounts now have exact active-admin rows
`{ role: 'admin', suspended: false }` in production and the running emulator,
assigned through privileged Firebase access rather than an app path.
`demo-credentials.local.txt`, both seed scripts, README and the exhibition
script now carry the new identities. No application, rules or Function change
was required; the checksum-stable Hosting build was released again as requested.

## Latest release — shorter, quieter moderated chat send (2026-09-24)

**LIVE — committed and pushed as `6b323f6`; `sendChatMessageCall` and Hosting
deployed 2026-09-24.** The release shortens the wait without relaxing the
moderation boundary.

While a send is pending, it now looks like the sender's normal message bubble:
their name and message remain in place, with a compact spinner beside the time.
There is no visible **Checking** heading, no long status sentence in the bubble
and no permanent moderation sentence below the composer. The full checking
sentence remains available to screen readers. Once the listener receives a
delivered message, the sender's own bubble shows a subtle check beside its
time. Refused and failed messages keep their existing explanation and actions.

The Function now reads the existing message, activity, role and sender profile
in one Admin SDK `getAll` preflight round trip. The existing-message result is
still considered first, so a retry can confirm a send that already landed
without spending another rate-limit turn. Typed-text moderation, image
moderation and image transcription are independent and now start together. If
transcription returns words, those words are moderated as the dependent second
stage. A captioned picture with OCR can therefore make **four OpenAI requests**
in total — text moderation, image moderation, transcription, then moderation
of the transcription — but the first three no longer wait on one another.
Decision order remains text, image, then image text, regardless of which
request answers first.

The OpenAI adapter's 8-second abort now covers reading and parsing the response
body as well as waiting for response headers. A server that sends headers and
then stalls cannot occupy the Function's longer outer timeout.

The safety invariant is unchanged: clients still cannot write messages or chat
pictures, and the Function writes no message, picture or chat notification
until every required moderation stage has completed and allowed the send. The
release covers text-only sends, captioned-picture OCR, refusal, outage/retry and
the pending-to-delivered visual transition.

Release validation: **957 unit/app tests and 402 Firestore rules
tests pass**; lint, Prettier, Maps configuration and the production build are
clean. Production lists the updated callable as active. Hosting serves
`index-4OXYldmG.js` and `index-iC2Ysgsx.css`; both live files match the local
build byte-for-byte. The signed-in live chat was opened successfully with the
permanent sentence gone and delivered checks in place; no new production
message was submitted during verification.

## Latest release — expanded admin powers (2026-09-24)

**LIVE — committed and pushed as `d7d8595`, then deployed 2026-09-24.** The
admin console now covers the seven powers the owner approved:

1. remove and restore one profile picture, bio or username;
2. remove and restore one activity picture without taking down the activity;
3. remove and restore a message that had already been published;
4. suspend for one day, three days, one week, thirty days or indefinitely,
   then extend, shorten or end the suspension;
5. accept appeals and let an admin uphold or reverse the original action;
6. revoke an account's existing sessions or send its password-reset email;
7. publish expiring announcements for everyone, hosts or participants.

The browser cannot perform the sensitive writes directly. Five callable Cloud
Functions in `functions/index.js` delegate to `functions/lib/admin.js`, where
the caller is checked again as an active admin, self/fellow-admin actions are
refused, inputs are bounded, every action requires a reason and the affected
person is notified. Removed profile, picture and message content is kept in
server-only `moderationVault` documents, while a small lock on the public
parent prevents the owner restoring it around the console. The public copy is
safe immediately: photos disappear, bios are blank, usernames become
`@removed`, and messages show a moderation placeholder. Restore uses the held
copy rather than asking the person to upload or type it again.

Appeals live at `/appeals`, including for a closed account, and the console has
new Appeals and Announcements sections. An appeal can only be filed while the
named action still exists, and its stable id prevents duplicates for the same
action. The action token is checked again at decision time, and a five-minute
review lease prevents two admins deciding the same appeal concurrently; a
failed review reopens safely. Announcement banners apply audience and expiry in
the browser; only an admin Function writes them. Timed suspension expiry is
enforced by the rules even before the scheduled cleanup runs, and
`expireTimedSuspensions` clears the stale role flags every fifteen minutes and
sends the account an update.

Password resets use Firebase's own Identity Toolkit endpoint from the Function;
the email is looked up server-side and never returned to the admin's browser.
Session revocation uses Firebase Auth. Neither capability gives the console a
password or exposes private profile data. On localhost the same operation uses
the Auth emulator endpoint, so owner testing does not contact the production
identity service or send a real email.

New collections are `moderationVault` (server only), `moderationAppeals`
(subject and admins read; Function writes) and `announcements` (active signed-in
accounts read; Function writes). Rules also make every active profile/activity
content lock unskippable. ADR-035 records why trusted Functions, a reversible
vault and an appeal path are one design rather than separate conveniences.

Verification: **952/952 unit and rendering tests**, **402/402 rules
tests**, **8/8 Auth/Firestore integration tests** and both push suites
(**11/11** delivery, **3/3** trigger) pass. Lint, source formatting, Maps
configuration and the production build are clean. The new server unit tests
cover timed expiry, vault preservation, self-action refusal, appeal action-token
and review-lease safety, announcement audit and the password-reset privacy
boundary. The new hostile-client rules tests cover vault denial, appeal and
announcement access, timed suspension enforcement and content locks. The
seeded local browser walkthrough covered the admin navigation, empty appeal
queue, announcement composer, account content/security actions, activity-picture
action, published-message action, every suspension duration and the user appeal
page. No destructive action was submitted.

Release order was Functions, rules, then hosting. All six new Functions are
listed in production: the five callables `adminContentAction`,
`adminSecurityAction`, `submitModerationAppeal`, `resolveModerationAppeal` and
`adminAnnouncementAction`, plus the scheduled `expireTimedSuspensions`. The
rules compiled and released. Hosting serves `index-w5XzjkvV.js` and
`index--EhzI9rv.css`; both match the verified local build byte-for-byte by
SHA-256. The signed-in live `/admin` dashboard loaded real counts and showed
Appeals and Recent announcements. No production moderation action was run.
Firebase's deploy output retained two existing non-blocking warnings: the
`firebase-functions` package is behind the newest release, and
`onNotificationCreated` is in `us-central1` while its Firestore trigger is in
`asia-southeast1`.

## Latest continuation — modern activity schedule picker (2026-09-23)

**LIVE — committed `481ecae`, pushed and hosting deployed 2026-09-23**
(`index-BgOCQDwj.js` and `index-Bb89R7aD.css`, confirmed being served). Create
and edit activity no longer hand date and time selection to the browser's old
native popovers. Both now use the shared
`ActivitySchedulePicker`: two compact summary cards open an in-app calendar or
an alarm-style 24-hour dial. The calendar includes Today/Tomorrow shortcuts,
month navigation, localized day/month names and a past-date floor while
creating. The time panel adjusts hours and five-minute steps and offers 09:00,
14:00 and 19:00 shortcuts. The underlying `YYYY-MM-DD` and `HH:mm` values,
future-date validation, derived time bands and Firebase writes are unchanged.
The controls collapse to one column on narrow phones, support keyboard focus
and Escape, and use the existing light/dark tokens. All four locale files are
current. 945 unit/app tests pass; lint, format and production build are clean.
This is a UI-only component change and does not need an ADR.

## Latest continuation — People for you surfaced and opened up (2026-09-23)

**LIVE — committed `ad394d4`, pushed and hosting deployed 2026-09-23**
(`index-CgmWREws.js` and `index-BDc6-pic.css`, confirmed being served). The
People for you entry moved from the very bottom of AI Picks
to directly below the page introduction, before activity rankings and interest
groups. Its larger accent card now reads as a destination rather than a footer.
The matching page keeps the same compatibility calculation, reporting and
notification controls, but its cards have larger avatars and names, grouped
top-right actions, roomier chips and facts, and a separate notification panel.
Laptop cards use a wider 24 px grid gap and 22 px internal padding. No data,
matching, following, reporting or notification behaviour changed. All visible
copy was reused, so the four locale files remain current; this UI-only change
does not need an ADR.

## Latest continuation — larger activity facts on laptops (2026-09-23)

**LIVE — included in `ad394d4`, pushed and hosting deployed 2026-09-23.** On
activity details at 1024 px and wider, the right-side
decision card now gives its time, place and joined count a 17 px type scale,
20 px icons, stronger text colour and more space between rows. The card itself
has slightly more padding. The coloured activity banner is unchanged, as are
the phone and tablet layouts. This is a desktop-only CSS change in
`src/styles.css`; it changes no wording, data, rules or application behaviour,
so no locale or ADR change is required.

## Latest continuation — a minimum age of fifteen (2026-09-23)

**LIVE — committed `bc49f2c`, pushed, rules and hosting deployed
2026-09-23** (`index-Zb3WFv1n.js`, confirmed being served). 941 unit/app
tests and 395 rules tests pass; lint, format and build clean. The chat
moderation callables were re-checked afterwards and still answer with
the app's own wording, so the rules change did not disturb them.

SmartSync puts strangers in touch and arranges for them to meet in
person, and had no minimum age at all. It has one now: **fifteen and
over**, asked at sign-up and — for accounts made before the gate
existed — on a screen above every other route except a closed account.

### The four decisions

**A date of birth, not an age.** An age is true for a year; somebody who
typed 15 would still be 15 at thirty, and the staleness would be in the
one number the minimum depends on. The date sits in the _private_ half
of the profile with the email and the real name, and is never public
under any setting.

**The database enforces it.** `firestore.rules` refuses a private-profile
write carrying a date of birth under the minimum, so a client that skips
the screen is refused exactly as one that uses it. Rules have no date
arithmetic — only durations, and fifteen years is not a fixed number of
days — so the cut-off is built as a `YYYY-MM-DD` string from
`request.time` and compared as a string, which for that format _is_ a
date comparison and needs no timezone agreed.

**The gate is in the router**, above onboarding. Interests, a picture and
a bio are things somebody makes; whether they should be making them here
is answered first.

**The age is public only by consent, and consent means absence.**
`showAge` is off by default. On, the public profile carries a number;
off, that field is `null` — the number _leaves_ rather than being hidden
at render time, because Firestore has no field-level read rules and a
value in a public document is readable whatever the screen draws (the
same argument ADR-005 makes for a name under anonymous mode). The
owner's own card shows their age either way, labelled "only you" when
nobody else can see it, so it is never quietly different from what
others get.

### Files

|                   |                                                                                  |
| ----------------- | -------------------------------------------------------------------------------- |
| The whole policy  | `src/utils/age.js` — `MIN_AGE` is the one number to change                       |
| The gate          | `src/App.jsx`, `src/pages/AgeCheckPage.jsx`, `src/components/TooYoungScreen.jsx` |
| Enforcement       | `firestore.rules` — `ageCutoff()`, `oldEnough()`, `validAge()`                   |
| Data              | `src/firebase/users.js` — `saveDateOfBirth`, `setShowAge`, `refreshPublicAge`    |
| Sign-up           | `src/pages/SignUpPage.jsx`, `src/firebase/auth.js` (`pendingSignUpDetails`)      |
| Consent + display | `src/pages/PrivacyPage.jsx`, `src/pages/ProfilePage.jsx`                         |

`pendingSignUpName` became `pendingSignUpDetails` and returns
`{ name, dateOfBirth }`. Both the sign-up and the auth observer race to
create a profile; if the date did not travel with the name, the observer
winning would make a profile with no date and its owner would be sent
to the age screen straight after filling the field in.

### Verified in the emulator

An account with no date on file gets the screen, and cannot reach
`/home`, `/profile`, `/map`, `/settings`, `/admin` or a chat by typing
the address. An under-15 date is refused **with nothing written** and
"Come back in about 1 year." A valid one lets them through. The profile
card reads "25 years old · only you". The consent switch puts `age: 25`
on the public document and takes it back to `null`, while the private
`dateOfBirth` stays put.

### Known limitation, said plainly

**It is self-declared and unverified.** A determined fourteen-year-old
types a different year. Nothing short of an identity document would
change that, and asking for one would collect far more than this needs.
The refusal screen deliberately offers no way to edit the date — a retry
button would make it a guessing game with unlimited tries, which would
stop nobody and pretend to. README §13 and ADR-034 say so rather than
implying otherwise; it is a better answer at a defence than a claim that
does not survive one question.

### ⚠ Do this before the exhibition, not during it

**Every existing live account is now asked for a date of birth on next
entry, once — the demo accounts included.** That is intended: a minimum
that applies only to new accounts is not a minimum. But it means each
demo account needs answering once before anybody demonstrates with it,
and the seeded production data carries no dates. Sign in to each demo
account on the live site once and give it a date; otherwise the first
thing an audience sees is the age screen.

## Chat moderation: credits on, floors calibrated, ready to deploy (2026-09-23)

The earlier hold is lifted. **$5 of credit was added on 2026-09-23 and
the whole path now runs against the real API.** `/v1/moderations` and
`/v1/responses` both answer 200.

**One floor moved, and it mattered.** The floors had never been measured.
Against the real model, ordinary messages this app exists to carry score
far higher than the old harassment floor of 0.5 — criticism of an idea
0.807, friendly teasing 0.803, board-game trash talk 0.804 — while real
abuse starts at 0.889. At 0.5 the chat would have refused all three on
day one. The floor is now **0.85**, pinned by a test naming the measured
scores. README §11 carries the full measurements.

**What it cannot do is written down rather than hidden.** Threats and
trash talk are the same thing to this model ("I will end you" about a
card deck scores _higher_ than "I will kill you" to a person); calmly
worded stalking and weapon threats come back clean; "go back to your own
country" is not classified as hate at all; coercive sexual pressure and
indirect suicide instructions are not flagged by the API in the first
place, so no threshold reaches them. On a held-out set of nineteen, all
twelve that had to pass did, and five of seven that should have blocked
did not. Report and the admin console are still the path for the rest —
that is the honest architecture, and it is the answer to give if a panel
asks what the model misses.

**Verified against the live API, through the real callable:** seven of
seven — five ordinary messages delivered (including swearing, blunt
criticism, teasing and somebody saying they are struggling), two
personal attacks refused and absent from the thread.

**Local setup now points at the real API**, not the stand-in:
`functions/.secret.local` holds the real `OPENAI_API_KEY` and the
`OPENAI_BASE_URL` line is gone from `functions/.env.local`.
`CHAT_IMAGE_OCR=off` is still set, so pictures are moderated as images
but their text is not read — turn it on by deleting that line if the
meme gap matters more than a fraction of a cent per picture. To go back
to the offline stand-in (useful if the venue wifi fails), restore
`OPENAI_BASE_URL=http://127.0.0.1:5699/v1` and run
`node scripts/fake-openai.mjs`.

### DEPLOYED — 2026-09-23

Live. Deployed in three steps rather than one command, deliberately:
**Functions first, then rules, then hosting.** The single-command form
gives no ordering guarantee, and if rules had landed first and the
Functions deploy then failed, every chat message on the live site would
have been refused with nothing able to write one — a dead chat for as
long as the fix took.

| step                                                               | result                                                                             |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `functions:sendChatMessageCall,requestChatReview,resolveChatBlock` | all three created; Secret Manager access to `OPENAI_API_KEY` granted automatically |
| `firestore:rules`                                                  | compiled and released                                                              |
| `hosting`                                                          | `index-zxYnK4zD.js`, confirmed being served                                        |

Verified after the deploy: all three functions `ACTIVE` with
`OPENAI_API_KEY` version 1 bound as a secret environment variable, at
60 s / 512 MiB / max 10 instances; an unauthenticated call to each
returns the app's own "Sign in…" wording rather than a 500, which is
what proves the module loaded rather than merely uploaded.

### Verified on the live site — 8/8

`node scripts/live-chat-check.mjs d2OhixGqJ7THyQdjFLDB`, signed in as a
real account against the deployed Functions, the deployed rules and the
real Moderation API:

|                                                         |                              |
| ------------------------------------------------------- | ---------------------------- |
| ordinary note                                           | sent, in the thread          |
| swearing                                                | sent, in the thread          |
| "your idea is rubbish and you did not think it through" | sent, in the thread          |
| "you are so bad at this game it is actually impressive" | sent, in the thread          |
| somebody saying they feel low                           | sent, in the thread          |
| a personal attack                                       | blocked · harassment, absent |
| a pile-on                                               | blocked · harassment, absent |
| **writing straight to the thread, moderation skipped**  | **permission-denied**        |

The last row is the one that matters: without it the other seven are a
courtesy rather than a control.

The Function's own log agrees — `auth: VALID` throughout, five "chat
message sent", two "chat message blocked" with `source: text` and
`reason: harassment`, no errors, no rate limits, and 1.5–2.3 s per
text-only callable invocation, which is a real round trip to OpenAI rather
than something short-circuiting. Note the three middle passes: every one of them scores
as harassment to some degree, and at the original floor of 0.5 all three
would have been refused on the live site.

**One difference from localhost worth knowing.** There is no
`functions/.env`, so production runs the defaults — which means
`CHAT_IMAGE_OCR` is **on** in production, while `functions/.env.local`
still has it off for the emulator. So the live site reads the words
inside pictures and localhost does not. That is the more protective
setting and costs about $0.0007 a picture; to turn it off live, add
`CHAT_IMAGE_OCR=off` to `functions/.env` and redeploy the functions.

Watch the credit balance for the first day. Text moderation is free, so
the balance should fall only with pictures, and slowly.

## Latest continuation — chat is moderated before delivery (2026-09-23)

**Live since 2026-09-23.** The three chat callables, rules and Hosting were
deployed in that order. The original local checkpoint had 908 unit/app tests
and 390 rules tests passing; current totals are recorded in the latest release
section above.

Built to the owner's 12-point specification: text and image moderation
for activity chat, enforced on the server, with rules that prevent
bypass, clear feedback, safe failure handling, usage control, human
review, four languages, verification and documentation.

### The one decision everything else follows from

**The database refuses every client-written message.**
`activities/{id}/messages` is now `allow create: if false`, and so is
the new `chatPictures/{messageId}`. The only writer is
`sendChatMessageCall`, a callable Function using the Admin SDK, which
bypasses rules because it _is_ the rule for a chat message now: `gate()`
re-checks membership, the activity's existence, suspension, closure and
the 30-day retention window before anything is moderated or written.

This is what makes the check impossible to skip. A client-side check
before `addDoc` would have been walked around by anyone who opens the
network tab — which is exactly the population that matters — so there
is no longer any request, from the app or from a script holding a real
token, that puts words in a thread.

### What is checked, and what is deliberately not

`omni-moderation-latest` checks up to three content sources: the typed
text; the picture as an image; and the picture's words. Those are three
sources, not three API requests: a captioned picture with OCR can use
four requests because transcription and moderation of that transcription
are separate. The API applies only six of thirteen categories to images
and `hate`, `harassment` and threats are not among them, so a picture is
transcribed by a small vision model (`gpt-5.6-luna`) and the transcription
is moderated as text. In the 2026-09-24 latency release, typed-text
moderation, image moderation and transcription start concurrently; any
transcribed words are moderated in a second stage. A transcription failure
is logged and does **not** block: a model that cannot read a photograph of
a beach is not evidence of anything.

Nine categories block, and only when the API's boolean is true **and**
its score clears a floor kept in `functions/lib/moderation.js` —
harassment 0.85, threats 0.35/0.3, hate 0.45, sexual 0.5, graphic
violence 0.5, violent wrongdoing 0.5, self-harm instructions 0.4. The
booleans alone fire on mild cases; a heated argument about a football
match reads as harassment at 0.12, and a moderator that blocks that
teaches people to stop using the chat.

Four categories deliberately do not block: `violence` without `graphic`,
`illicit` without violence, and `self-harm` / `self-harm/intent`. That
last pair is the one to be ready to defend: somebody telling the group
they are struggling is not abuse, and blocking it would take the message
away from the one person in the thread who might have helped, and hide
it from the Report button too.

Ordinary swearing is allowed; `CHAT_PROFANITY_POLICY=block` changes that
without a code change, and `CHAT_PROFANITY_WORDS` extends the list.

### What a refusal looks like

The message never reaches the thread, so nothing has to be taken back.
It stays in the sender's own composer area as an unsent bubble with a
general reason — never the category, never a score, because a refusal
that reads like a scorecard is an invitation to tune a message until it
passes — and three choices: **Edit** (words and picture go back to the
composer), **Discard**, **Ask for a review**.

An appeal reaches `/admin/chat`. **Uphold** closes it; **Overturn and
post** posts the message the person actually wrote, from the held copy,
and deletes that copy in the same write — so putting right a false
positive is the message appearing in the thread rather than an apology.

Sexual content involving minors is handled differently on purpose:
blocked, **nothing retained**, no appeal, no console view. The
provider's guidance forbids sending suspected CSAM to the API, and the
obligation it creates is a report to an authority, not a button. README
§11 says that rather than implying the console covers it.

**A failure is never a delivery.** Outage, quota, revoked key: the
message is kept, the screen says the check could not be completed, and
Retry is offered.

### Files

| Area             | Files                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Policy (pure)    | `functions/lib/moderation.js` — categories, floors, `judge`, `decide`, the transcription prompt                              |
| API adapter      | `functions/lib/openai.js` — `moderate()`, `readImageText()`, error classification and the body-inclusive 8 s abort           |
| Request checking | `functions/lib/chat.js` — text cleaning, image sniffing by bytes, `validateSend`                                             |
| The send path    | `functions/lib/sendChat.js` — batched preflight, concurrent first stage, `gate`, `takeTurn`, `checkParts`, send/block/review |
| Callables        | `functions/index.js` — `sendChatMessageCall`, `requestChatReview`, `resolveChatBlock`                                        |
| Rules            | `firestore.rules` — messages, `chatPictures`, `moderationBlocks`, `chatModeration`, `chatModerationUsage`                    |
| Client           | `src/firebase/chat.js`, `src/context/AppContext.jsx` (`chatPending`, retry, review), `src/pages/ChatPage.jsx`                |
| Console          | `src/console/pages/ChatBlocksPage.jsx` + nav/route/feed wiring                                                               |
| Stand-in         | `scripts/fake-openai.mjs`                                                                                                    |

### Verified in the emulator — against the stand-in, not the real API

Driven through the running app at `localhost:5173` with
`scripts/fake-openai.mjs` in place of OpenAI:

| Case                                                                        | Result                                                                              |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Ordinary message                                                            | moderated and delivered, `moderatedAt` stamped                                      |
| `xharassx`                                                                  | refused with a plain reason; in no thread, picture or notification                  |
| Appeal                                                                      | `appealed: true`, queued at `/admin/chat` with a sidebar count                      |
| Overturn                                                                    | the original message posted; held copy deleted                                      |
| Outage (stand-in 503)                                                       | "check could not be completed", nothing written, Retry offered                      |
| Retry after recovery                                                        | delivered                                                                           |
| Picture                                                                     | caption/image/OCR checked, then OCR text checked; stored in `chatPictures`; renders |
| Meme (`OPENAI_FAKE_IMAGE_TEXT=xhatex`)                                      | blocked with `source: image-text` although the caption was clean                    |
| `xmildx` (flagged at 0.12)                                                  | delivered — the floor does its job                                                  |
| Rate limit                                                                  | "try again in 60 minutes", message kept                                             |
| Client writes a message / a picture / its own counter / a chat notification | all four `permission-denied`                                                        |
| Non-participant reads the thread, reads a picture, calls the callable       | refused, refused, `not-allowed`                                                     |
| Non-admin resolves a block; appeals somebody else's                         | 403 "Admins only", 403 "Not your message"                                           |
| Non-admin reads `moderationBlocks`                                          | `permission-denied`                                                                 |

**Real API verification followed on 2026-09-23.** Seven of seven calibration
messages behaved as expected through the real callable: five ordinary messages
were delivered and two personal attacks were refused and absent from the
thread. The measured scores support the `0.85` harassment floor. Automated
tests still use the deterministic stand-in so they do not spend provider quota
or change when a model is updated.

### Production release

`OPENAI_API_KEY` is stored in Secret Manager and the chat callables, rules and
Hosting are live. When a future change affects both Functions and rules, keep
the verified safe order:

1. Deploy the affected Functions.
2. Deploy Firestore rules only after the Functions succeed.
3. Build and deploy Hosting last.

Do not use a combined Functions/rules command: it gives no ordering guarantee,
and rules landing first with a failed Function deploy would leave chat unable
to accept any message.

Costs: the Moderation API is free for text and images both; only the
transcription is billed, about $0.0007 a picture, bounded by
`CHAT_DAILY_CAP`. README §11 has the full setup, the env knobs and the
limitations. ADR-033 has the reasoning and what was rejected.

## Latest continuation — the Gemini key, the model and the timeouts (2026-09-22)

**Why:** hours after AI Picks shipped, every model call started coming
back `403 "Your project has been denied access. Please contact
support."` What was ruled out, in order: the key (it authenticates —
listing models answers 200), the app and the request shape (a raw curl
on both the Interactions and the legacy `generateContent` endpoint gets
the same refusal), and the project (a second key, then a third from a
brand-new project with no billing, were refused identically). It was the
**Google account**: the keys were being made under the university
account. A key made under a different account works.

**What that key can actually do** — measured with the app's own ranker
against the real API:

| model                   | free tier, this account                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `gemini-3.5-flash-lite` | "currently experiencing high demand" on every attempt, over many minutes        |
| `gemini-3.5-flash`      | correct rankings, in 43 s / 49 s / 65 s / 75 s — and sometimes the same refusal |

The time is queuing, not generating: the answers are the usual ~1,100
tokens. On the paid key the same call took two or three seconds.

**The owner's decision.** Attaching billing to the working project (two
seconds again) was recommended and declined; they chose to stay on the
free tier and wait out the latency. So:

- `DEFAULT_MODEL` is now `gemini-3.5-flash` (`functions/lib/gemini.js`);
  `GEMINI_MODEL` in `functions/.env` still overrides it, which is the
  one-line way back to `flash-lite` if capacity returns or billing is
  attached.
- The three budgets go up: the model call 20 s → **90 s**, the Function
  `timeoutSeconds` 30 → **110**, the browser callable 35 s → **115 s**.
  They stay in that order on purpose, so a failure always reaches the
  page as a reason rather than a dead socket.
- The SDK's one retry goes (`maxRetries: 0`): at ninety seconds a second
  attempt cannot fit inside the Function. The page's **Try again** is the
  retry.
- ADR-032 records all of it, including what it costs: AI Picks can now
  say "Asking Gemini…" for a minute on a first load. The ten-minute
  per-person cache means it is instant for the rest of a demo once
  asked.

**Secret:** `GEMINI_API_KEY` is at **version 5** (the working key), set
by the owner and deployed with it. Versions 1–4 are dead (the denied
projects). The key value has never been in a file or a commit.

**Shipped:** see the commit after `6ad1feb`; Function and hosting
deployed, 854 unit/app tests, lint and build clean.

## Latest continuation — cards and columns get an edge (2026-09-22)

**Shipped: `ead3537`, pushed, hosting deployed** (stylesheet
`index-D1379UNV.css`, verified served and carrying both rules). CSS
only — no test, locale or behaviour change; 854 unit/app tests pass.

The owner asked, from screenshots of Discover, Map and Profile on a wide
dark screen, for "the border between different categories to be more
visible", then drew a line down the gutter between the two columns and
said to keep the first change and add that too.

1. **Card edges.** `.activity-card` had `border-color: transparent`, so
   on the dark ground a card's body melted into the page and two
   neighbouring cards read as one slab. It now takes
   `color-mix(in srgb, var(--cat) 45%, var(--line))`, 72% on hover; the
   dark set uses `--cat-2` (the light partner) at 40/62%, because the
   base hues are too dark to draw a line with.
2. **The column seam.** `.discover-page[data-picks='yes']::after`,
   `.smart-map-page::after`, `.profile-page::after` — a 1px
   `--line-strong` gradient, transparent at 0/100% and solid from 5% to
   95%, `justify-self: end` with a negative margin of half that page's
   column gap (16/8/16px), `align-self: stretch`. Inside the 1024px
   media block only: below that the columns stack and there is nothing
   to divide.
   **The trap:** a grid item with a definite position is placed before
   the auto-placed ones, so pinning the pseudo to column 1 pushed the
   map's list into the map's cell and the map out of sight (same for the
   profile). `.map-side`/`.smart-map` and `.profile-column`/
   `.profile-recent` are therefore placed by hand now. Discover was
   never affected — its children already sit in named grid areas.

Verified in the emulator app, light and dark, wide and 375px, and on the
live site by reading the served stylesheet and the computed border of a
card (`color(srgb 0.15 0.42 0.39)` on a Study card) and of the seam.

## Latest continuation — the scoring engine removed (2026-09-22)

**State: SHIPPED 2026-09-22 as `34ae1d4` (pushed, Function + hosting
deployed) — see "Shipped" below; the live model call is currently
refused by Google (403), which is outside the app.** What follows was
written while it was still a working-tree diff on top of `8df38bd`
(with the place-names addition below: 49 modified, 8 deleted, 2 new).

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

### Shipped 2026-09-22 — and what the live site showed afterwards

The owner tested locally ("ok it works, commit and deploy"): committed
as one commit, `34ae1d4` ("The scoring engine goes: Gemini ranks, and
place names go by name"), pushed (main == origin), the Function
deployed first (`recommendActivities`, successful update), then hosting
(bundle `index-BmzwjMUp.js`, verified equal to the local build and free
of the engine's strings). Rules unchanged, not deployed.

**Live check: the code runs, but Gemini is refusing the project.** The
page showed "Not ranked… soonest first" with Try again, and the Function
log said `ai picks model call failed … status 403 "Your project has been
denied access. Please contact support."` A direct probe with the
deployed key (read from Secret Manager, never printed): the key is
valid (`GET /v1beta/models` → 200) but every generation call answers
`permission_denied` with that text. That is a Google-side block on the
AI Studio / Cloud project behind the key — it worked at 15:00 UTC on
2026-09-21 — most likely the new prepay billing account under review,
or the project flagged. **Nothing in the app can fix it**; the owner
has to look in AI Studio (Billing / the project's notices), contact
support as the message says, or create a key in a different project
(a no-billing one runs on the free tier) and re-set the secret
(`npx firebase functions:secrets:set GEMINI_API_KEY`, answer Y to the
redeploy prompt).

Follow-up, so the page tells the truth meanwhile: `classifyError` now
maps 401/402/403 to a new kind `refused` (was `invalid`, whose wording
"gave an answer the app could not use" was wrong for a denied project);
`picks.fallback.refused` = "Gemini is refusing this server's access
right now…" in four languages. Committed and deployed after `34ae1d4`
(see git log; Function + hosting).

### To finish, when the owner says so — done above; kept for the record

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
state remains outstanding. The signed-in live `/admin` dashboard walkthrough
was completed with the expanded-admin release above.

## 1. Where things stand

|                  |                                                                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live             | <https://smartsync-c1f07.web.app> — `index-4OXYldmG.js` + `index-iC2Ysgsx.css`, built from `6b323f6`, released and checksum-verified 2026-09-24                                                                         |
| Repo             | `github.com/Marvin6632710/smartsync`, branch `main`; chat release `6b323f6` is pushed                                                                                                                                   |
| Deployed         | Hosting through `6b323f6`, rules through `d7d8595`; nine callable Functions and `expireTimedSuspensions` are active                                                                                                     |
| **Not** deployed | Browser-push Functions `onNotificationCreated` and `cleanupPushTokens`; they still need the push release decision and a `VITE_FCM_VAPID_KEY`. The live site has inbox notifications but no closed-browser push delivery |
| Local state      | Firebase CLI signed in as the owner. The dev emulators and Vite server are running for localhost review (see §7)                                                                                                        |

Recent commits, newest first:

- `6b323f6` Shorten moderated chat sends — batched preflight, overlapping
  independent checks and quieter pending/delivered UI; callable and Hosting
  deployed.
- `d7d8595` Expand admin moderation controls — reversible content actions,
  timed suspensions, appeals, security actions and announcements.
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

One thing is still **not** verified:

1. **Index build state in production.** `firebase deploy --only
firestore:indexes` returns when the indexes are _submitted_; they build
   asynchronously and there is no `gcloud` on this machine to poll them.
   Firebase console → Firestore → Indexes: both new composite indexes should
   read _Enabled_. Until they do, the Reports filters `resolved`/`everything`
   (`watchResolvedReports`) and the Overview counts (`fetchCounts`, which
   queries `activities` by `status` + `startsAt`) fail with a
   `failed-precondition` "index is building" error. On a dataset this size it
   takes minutes.

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
  `package.json` now specifies `react-router-dom ^7.18.3`. The browser-push
  Functions remain undeployed (VAPID release decision still pending).
- Original console browser checks in the emulator app found no console
  errors, including at 375px and in Thai.

## 5. Original console test results

Historical baseline for `0ba6e0b`, all green. The latest fast results are
recorded at the top of this file: 957 unit/app and 402 rules tests; the last
auxiliary integration run recorded 8 passing tests. Individual suite timing
for the original baseline is noted below:

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
  `you@smartsync.demo` (Min Khant Aung), `marvin@smart.sync.demo` (Zwe Khat
  Lin), `lotus@smart.sync.demo` (Chaw Yadanar Oo), `narin@smartsync.demo` and
  `june@smartsync.demo`. The seed creates **no** roles, reports or log.
  Zwe and Chaw were granted admin out of band in the current emulator; recreate
  those role rows after any emulator reset.
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

1. Check the two new indexes are _Enabled_ in the Firebase console. The live
   `/admin` dashboard and new navigation already loaded with real data.
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
