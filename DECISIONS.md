# Architecture decisions

Short records of the choices that shaped SmartSync, why they were made, and
what was given up. Written because "why did you build it that way?" is the
question a defence panel actually asks, and "it seemed easier" is not an
answer that scores.

Each record is deliberately honest about its cost. A decision with no
downside is usually a decision nobody thought about.

---

## ADR-001 — Firebase rather than a custom Node + Postgres backend

**Context.** SmartSync needs accounts, shared data, live updates and hosting,
built by one student in roughly two weeks alongside a written report.

**Decision.** Firebase Authentication and Cloud Firestore, deployed on
Firebase Hosting.

**Why.** Live updates are the feature most of the app depends on — the
participant count, the chat, the notification bell. Firestore gives real-time
listeners as a primitive; building the equivalent on Postgres means running a
WebSocket layer and inventing a subscription protocol. Authentication is a
solved problem that is easy to get subtly wrong, and password handling is not
where marks are won. The free Spark plan covers a defence demo comfortably.

**Cost.** Vendor lock-in: the data layer is Firestore-shaped and would not
port to SQL without rewriting queries. Firestore cannot do joins or aggregate
queries, which is why the peer directory is fetched wholesale (see ADR-006).
And a custom backend would have demonstrated more breadth — this is a real
trade of scope for depth, and it should be defended as such rather than
hidden.

**Rejected.** Node + Express + Postgres (more to demonstrate, far more to
build and host); Supabase (equivalent, marginally better relational fit, but
Firebase was the stated preference and has the better free-tier hosting
story).

---

## ADR-002 — Leaflet with OpenStreetMap rather than Google Maps

**Context.** Activities need to be placed at real coordinates and shown on a
map.

**Decision.** Leaflet, with OpenStreetMap raster tiles.

**Why.** Google Maps requires a billing account with a card on file even
inside its free tier. A payment failure, a quota trip, or an unactivated
billing account three days before a defence is an unnecessary way to lose a
demo. Leaflet needs no key and no account. To a marker on a screen the two
look the same.

**Cost.** No Google-quality place search or geocoding, which is why hosts tap
a map instead of typing an address (see the roadmap — geocoding via Nominatim
is a candidate improvement). OSM tiles are served by a volunteer-funded
project with a usage policy; a genuinely popular app would need its own tile
provider.

**Rejected.** Google Maps (billing dependency); Mapbox (also key-and-account).

---

## ADR-003 — Membership as an array on the activity, not a subcollection

**Context.** An activity needs a roster and a participant count, and the
security rules must prevent anyone inflating that count.

**Decision.** `participantUids: string[]` on the activity document. There is
no participants subcollection and no separate counter; the count is the
array's length.

**Why.** This is not a style preference — the first design was a
`participants` subcollection plus a `participantCount` field, and a security
rule test proved it was exploitable. **Firestore rules evaluate each write
independently and cannot see sibling writes in the same batch.** So a rule
protecting the counter cannot tell "increment because I am also creating my
participant document" from "increment because I felt like it". Anyone could
have driven any activity to full and locked everyone else out. Holding the
roster in one field of one document makes each change atomically checkable:
the rule computes the set difference and requires it to be exactly the
caller.

**Cost.** A document has a 1 MB limit, so an activity caps out in the low
tens of thousands of participants — irrelevant here, fatal for a stadium.
Participant names are not denormalised onto the activity, so the participants
screen resolves uids against the user directory.

**Rejected.** Subcollection + counter (exploitable, as above); a Cloud
Function maintaining the counter (Cloud Functions require the paid Blaze
plan, reintroducing exactly the billing dependency ADR-002 avoided).

---

## ADR-004 — Hosts cancel; nothing is hard-deleted

**Context.** A host needs to be able to call off an activity.

**Decision.** Cancelling sets `status: 'cancelled'`. `allow delete` is
`false` for everyone, including the host.

**Why.** Deleting a Firestore document does not delete its subcollections. A
deleted activity would strand its `messages` subcollection as documents no
rule can reach — unreachable, undeletable, and still counting against
storage. It would also erase the chat history of everyone who had joined,
which is their conversation as much as the host's.

**Cost.** Cancelled activities accumulate forever. The discovery query
already filters them out and only fetches from the last day onwards, so this
is a storage question, not a correctness one — but a production system would
need an archival job.

**Rejected.** Recursive client-side delete (racy, and rules would have to
permit message deletion, breaking the append-only guarantee).

---

## ADR-005 — Public and private halves of the user profile

**Context.** Discovery and compatibility matching need to read other people's
interests. Nothing should be able to read their email, their stored position,
or their real name while anonymous mode is on.

**Decision.** `users/{uid}` is public to signed-in users;
`users/{uid}/private/profile` is readable only by its owner. Anonymous mode
_rewrites_ the public document's `name` and `avatar`, keeping the real name
in the private half.

**Why.** **Firestore has no field-level read rules.** A rule can only allow
or deny a whole document. So "everyone can read your profile except your
email" is not expressible — the only way to make it real is to put the
private fields in a different document. Doing anonymity at render time
instead would be theatre: anyone can read the database directly and would see
the real name sitting there.

**Cost.** Two documents to keep in step. Renaming and toggling anonymity are
therefore batched writes, and the sign-in path has to wait for both halves
before routing (a bug found the hard way).

**Rejected.** Hiding fields in the UI (cosmetic, not privacy).

---

## ADR-006 — Recommendation scoring runs on the client

**Context.** Every activity is scored out of 100 for the current user.

**Decision.** `recommendationService.js` is a pure module in the browser. It
takes the user, the activities and the peer list and returns numbers.

**Why.** Server-side scoring needs Cloud Functions, which need the paid plan.
More importantly, purity is what makes the algorithm testable: 41 tests,
including a fuzzer, run in under a second with no database and no browser.
For a project whose marks live in the algorithm, being able to demonstrate it
in isolation is worth more than where it executes.

**Cost.** It does not scale. Every signed-in client downloads every user
profile to compute compatibility, which is fine for a cohort and absurd for a
city. Scoring is also visible to anyone who opens devtools — acceptable here,
not if the ranking were commercially sensitive. Say this plainly in the
defence rather than being caught by it.

**Rejected.** Cloud Functions (billing); precomputed scores in Firestore
(stale the moment a profile changes).

---

## ADR-007 — Time band is derived, not entered

**Context.** Whether an activity is Morning, Afternoon or Evening is 15% of
its match score.

**Decision.** Derived from the start time. The host picks a time; the band
follows.

**Why.** It was previously a separate dropdown, which meant a 7 AM activity
could be tagged "Evening" — and the scorer trusted the tag. A typo silently
corrupted 15% of that activity's score for every user. Two fields that can
disagree about the same fact will eventually disagree.

**Cost.** The boundaries (12:00, 17:00) are fixed and arbitrary. A 16:55
start is "Afternoon" by one minute.

---

## ADR-008 — Filters live in localStorage, everything else in Firestore

**Context.** Discovery filters are state; so is the rest of the app.

**Decision.** Filters persist per-device in `localStorage`. All shared data
is in Firestore.

**Why.** A filter is a view preference, not account data — you might
reasonably want a different distance limit on your laptop than your phone.
Writing it to Firestore would also mean a database write on every drag of a
slider.

**Cost.** Filters do not follow you between devices. This is a defensible
default rather than an obviously correct one.

---

## ADR-009 — Emulator-first development

**Context.** The backend has to be developed, tested and demonstrated without
depending on a live cloud project.

**Decision.** The whole stack runs against the Firebase Emulator Suite. A
`demo-` prefixed project id never contacts Google. `npm run seed` loads demo
data _through the ordinary client SDK while signed in as each user_, so it is
subject to the same security rules as production.

**Why.** Anyone can clone the repo and run the real backend with no account,
no credentials and no billing — including an examiner. Seeding through the
rules rather than around them means the seed script doubles as a smoke test:
if the rules are wrong, seeding fails.

**Cost.** The emulator needs Java. Firebase Cloud Messaging has no emulator,
so push notifications cannot be developed this way at all — which is part of
why they are not built.

---

## ADR-010 — Chat expires by losing access, not by being deleted

**Context.** An activity's chat should not live forever. The Privacy page had
promised expiry in writing long before anything implemented it.

**Decision.** Thirty days after an activity starts, its message thread stops
being readable and writable — enforced in `firestore.rules` by comparing the
activity's `startsAt` against `request.time`. The documents are not deleted.

**Why.** Enforcement had to be in the rules rather than the client, or it
would be decoration: a client-side filter is stepped around by querying
Firestore directly. Deleting the documents on a schedule would need Cloud
Functions, which need the paid plan — the same billing dependency ADR-002
avoided. Given that constraint the honest options were to enforce access
expiry and say so precisely, or to claim deletion we could not perform.

**Cost.** "The chat is deleted" would be a stronger privacy claim, and it is
not the one being made. The data remains in the database and would be
visible to anyone with console access to the project — which is the project
owner, and nobody else. Storage also grows without bound. Both are worth
saying out loud rather than letting someone assume otherwise.

**Rejected.** Client-side hiding (unenforceable); a scheduled Cloud Function
(billing); refusing to expire anything (the Privacy page would have kept
promising something untrue).
