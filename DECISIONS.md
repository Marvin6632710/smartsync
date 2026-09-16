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

**Decision.** Cancelling sets `status: 'cancelled'`. A host may hard-delete an
activity **only while they are still the only person on the roster**;
anything anyone else has joined can only be cancelled.

**Why.** Deleting a Firestore document does not delete its subcollections. A
deleted activity would strand its `messages` subcollection as documents no
rule can reach — unreachable, undeletable, and still counting against
storage. It would also erase the chat history of everyone who had joined,
which is their conversation as much as the host's.

The narrow delete exists because "I created this by mistake" is a real thing
people do, and leaving a cancelled tombstone in their own history for an
activity nobody ever saw is noise rather than a record.

**Cost.** Cancelled activities accumulate forever. The discovery query
already filters them out and only fetches from the last day onwards, so this
is a storage question, not a correctness one — but a production system would
need an archival job. And a host who posted messages to their own empty
activity before deleting it orphans those messages: a negligible amount of
data, and only ever their own words, but it is a real hole in the guarantee
rather than none.

**Rejected.** Blanket `allow delete: if false` — safest, but it meant a
mistyped activity could never be removed, only tombstoned. Recursive
client-side delete (racy, and rules would have to permit message deletion,
breaking the append-only guarantee).

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

**Cost.** Several places to keep in step, and the audit above shows how easy
one is to miss. Renaming and toggling anonymity are batched writes plus a
sweep of the host's activities, and the sign-in path has to wait for both
profile halves before routing (a bug found the hard way).

**Not covered, deliberately.** Messages keep the sender name they were sent
with. Going anonymous does not rewrite what you already said, because a
conversation is a record of who said what at the time, and silently rewriting
history would be a worse property than the one it fixes. Anonymity applies to
your profile, your hosted activities, and everything you do from then on.

**Rejected.** Hiding fields in the UI (cosmetic, not privacy). Dropping the
denormalised host name entirely — tempting, since the client already holds
every profile, but that reintroduces a lookup on a path that may not always
load the whole directory.

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

## ADR-011 — Two ranks of moderator, and an admin who can only be made in the console

**Context.** People meet strangers off this app in physical places. That makes
a report queue a safety feature rather than housekeeping, and it makes the
moderation powers themselves worth attacking: whoever can take an activity
down can also take a rival's down, and whoever can grant a role can grant
themselves one.

**Decision.** Three states, held in a `roles/{uid}` collection that no user can
write to. Reports route work to whoever holds a rank; an oversight directory
lets them act on what they notice rather than only on what gets flagged.

**The ladder, in order.** Each rung costs the person more than the one before
it, and the system reaches for the cheapest that fits:

| Rung | Who | Costs the person | Reversible by |
| --- | --- | --- | --- |
| Warning | moderator | nothing — a record and a message | nobody; it is a record |
| Remove an activity | moderator | that activity | an admin |
| Suspend | moderator | hosting, joining, messaging; everything they host is stood down | a moderator |
| Close the account | **admin only** | everything except reading why | an admin |

A system whose only options are "nothing" and "you cannot use this any more"
reaches for the second far too readily. The warning is the rung that was
missing, and in practice it is where most of these should end.

- **user** — the default. No row in `roles` at all means this, so nothing is
  written at sign-up and a missing document is never an error.
- **moderator** — reads the report queue, removes activities, suspends and
  restores ordinary users. Cannot change anyone's role, cannot touch a fellow
  moderator or an admin, and cannot undo a removal.
- **admin** — everything a moderator can do, plus appointing and dismissing
  moderators, suspending a moderator without demoting them, and restoring an
  activity that was taken down. Cannot suspend another admin.

`admin` cannot be created from inside the app by anybody, including an admin.
The only way to make one is to write the document in the Firebase console.

**Why.** A role stored anywhere its holder can write is a role its holder can
grant themselves, which is why `roles` is its own collection and not a field
on the profile. Beyond that, each limit answers a specific way the system
could be turned against its users:

- Moderators can suspend, because a moderator who could take down one activity
  while the same account posted ten more would not be moderating anything.
- They cannot act on each other, because two moderators able to disable one
  another is a race whose winner is whoever moves first.
- They cannot reverse a takedown, and admins can, because a mistake has to be
  fixable but not by the rank that might have made it.
- Nobody can close a report about themselves or about something they host. The
  rules refuse the write; the client also hides those reports from that
  reviewer's queue, so they stay in everyone else's.
- Admin is console-only, so compromising any in-app account — moderator or
  admin — cannot mint more admins.
- **A rank cannot touch what a user wrote.** A moderator can make an activity
  disappear and say why. They cannot change a word of it — not the title, the
  place, the time, the capacity or the roster — because an activity quietly
  rewritten by somebody other than its host is worse than one taken down, and
  the host would have no way to tell. Fourteen fields are named individually
  in the tests, for both ranks.
- **Oversight reaches public behaviour and stops there.** Moderators browse
  every account and can act without waiting for a report, but the private half
  of a profile — email, real name behind anonymous mode, stored position — is
  readable by its owner and by nobody else, an admin included. Neither is
  anybody's block list, and neither is a chat they did not join. A rank buys
  reach over what is posted in public, never over private conversation.
- A role document holds exactly two fields and the rules refuse any third.
  It is the most consequential row in the database, and anything else on it
  would be state nobody validates, nobody reads, and nobody would notice
  arriving.

**Two things that only appeared when the ranks were tested against each
other**, and both are the reason this ADR is worth reading:

- *Suspension had to reach the accounts a person hosts.* Somebody is suspended
  because they may be a danger to the people they would be meeting — and their
  existing activities stayed live, in discovery, still accepting strangers. The
  suspension protected nobody from the thing it was for. The rules now refuse a
  join when the host is suspended, and suspending an account stands down
  everything it is hosting, telling everyone who had joined. The client could
  not have done this filtering itself: roles are readable only by their owner
  and by moderators, so discovery genuinely cannot tell.
- *A report had to name a person, not a thing.* Reports recorded what was
  reported — a user, an activity, a message — and the Suspend button acted on
  that id. For a message report that id is a message, so suspending wrote a
  role document keyed by message and suspended nobody. Reports now carry
  `subjectId`: the person answerable. The rules verify it against the activity
  or the message itself, so a reporter cannot quote one person's message and
  name somebody else as its sender.

**Cost.** Bootstrapping the first admin is a manual step in the console —
the only one, now that appointing and dismissing moderators happens in the
app. Suspension is blunt — it is not scoped to a
single activity or conversation, and standing down a host's activities is not
reversed when the suspension is lifted; an admin restores them one at a time,
which is deliberate but is extra work after a mistake. And a moderator can
still read a report filed about themselves, and so learn who filed it:
Firestore has no field-level read rules and refuses a whole query if any
document in it fails, so hiding those is a courtesy in the client, not a
control. What is enforced is that they cannot act on it.

**Rejected.** A single `isAdmin` flag (no room for the routine work); storing
the role on the user profile (self-grantable); letting moderators undo each
other's decisions (no ladder, so no accountability); deleting reported content
outright rather than marking it `removed` (the evidence goes with it, and a
wrongly-removed activity becomes unrecoverable).

---

# Questions you will be asked

Read this before you walk in. Each answer is short on purpose — say the short
version, and let them ask for more. Every one is backed by something in this
repository, so you are never guessing.

### "Why Firebase? Why not build your own backend?"

Live updates are the feature most of the app depends on — the participant
count, the chat, the notification bell. Firestore gives real-time listeners as
a primitive; on Postgres you build a WebSocket layer and invent a subscription
protocol. Authentication is a solved problem that is easy to get subtly wrong.

**Own the trade honestly:** a custom backend would have demonstrated more
breadth. The choice bought depth — a measured recommendation engine and a
tested security model — instead. That is ADR-001, and it is a defensible
trade rather than an avoidance.

### "What stops someone joining an activity fifty times, or overselling it?"

The database, not the interface. Membership is a single array on the activity
document, and the rules check that any change adds or removes exactly the
caller and never exceeds capacity.

**The good part of this answer is that it was wrong first.** The original
design had a participants subcollection plus a counter. Rules evaluate each
write independently and cannot see sibling writes in a batch, so "increment
because I joined" and "increment because I felt like it" were
indistinguishable — anyone could fill any activity and lock everyone out. A
security rule test caught it and the design changed. ADR-003.

### "What if two people take the last place at the same moment?"

Exactly one wins. `arrayUnion` is resolved on the server before the capacity
rule is evaluated, so the second request is rejected rather than the activity
being oversold. This was run ten times concurrently and gave one winner every
time, with the roster never exceeding capacity.

### "Is anonymous mode real, or are you just hiding the name?"

Real. The name genuinely leaves the document other people can read — Firestore
has no field-level read rules, so the private fields live in a separate
document only the owner can read. ADR-005.

**Also worth volunteering:** an audit found it was only doing half the job.
The host's name is copied onto each activity for cheap listing, and turning on
anonymity rewrote the profile but left the real name on every hosted activity.
It now sweeps those too. Say this before they find it.

### "How do you know your recommendations are any good?"

Measured, not asserted. Against a synthetic population of 400 people whose
true preferences are known, over seven independent populations: **39.3%
precision@5, against 18.0% for the best single signal and 5.2% for random.**

Then say the uncomfortable half: **three of the six signals earn nothing.**
History was scoring the same fact as interest — 59% overlap — so it was
changed to measure only what interests do not say. Popularity is still in the
model and the evidence says it is not paying for itself.

If asked why you did not simply retune the weights: because the search ran
against our own simulation, and adopting its answer would tune the product to
a generator rather than to people. EVALUATION.md §5.

### "Can I see the algorithm?"

Settings → Matching weights. Six sliders, ranking reorders live. It is the
same mechanism the evaluation harness uses to ablate each signal, so what they
can try is exactly what was measured.

### "Who can read the chat?"

Only people who joined that activity, enforced in the rules — a non-participant
querying the database directly is refused, which was verified against the live
project. Threads also close 30 days after the activity.

**Be precise:** that is expiry of _access_, not deletion. Scheduled deletion
needs Cloud Functions and the paid plan. Claiming "the chat is deleted" would
be false; "nobody can open it, and here is the rule" is true and checkable.
ADR-010.

### "Who watches the moderators?"

Ask this one of yourself before they do, because it is the real question about
any reporting system. Four answers, all enforced in the rules rather than the
UI:

- A moderator cannot close a report about themselves, or about an activity
  they host. They could never have suspended themselves, but before this they
  could have dismissed the complaint — the same power, exercised quietly.
- A moderator cannot suspend another moderator or an admin, so they cannot
  disable the people who could review them. An admin cannot suspend a fellow
  admin, or delete their role row — deleting it is demotion by another name.
- A moderator cannot rule on a report they filed themselves. Prosecutor and
  judge is the other half of the conflict of interest, and it is the half
  that is easy to forget.
- A moderator cannot undo a takedown. An admin can, and both decisions stay on
  the record: the activity carries the restore, the report carries the
  removal.
- A suspended account exercises no rank at all. It keeps the rank, so the
  suspension is reversible, but a suspended moderator moderates nothing —
  otherwise suspending one who was abusing the queue would take nothing away.
- `admin` cannot be created from inside the app at all. It is written in the
  Firebase console, so compromising any account in the app cannot mint one.

**Own the gap:** a moderator can still read a report filed about themselves,
and learn who filed it. Firestore has no field-level read rules and refuses a
whole query if any single document in it fails, so those are hidden in the
client, which is a courtesy and not a control. ADR-011 says so in writing.

### "How did you test it?"

367 tests. 81 over the pure functions — the recommendation engine, and now
the date and distance maths, which was entirely untested and where a bug
silently reorders what everybody is shown — 161 attacking the security rules
feature by feature, and 125 more in
`roles-matrix.test.js` that test the one thing cutting across every feature:
who may do what to whom, at every combination of the caller's rank, the
target's rank, and the relationship between them.

Be precise about what found what. Three holes were caught by the rule tests
feature by feature. Three more were caught by driving the running app as each
kind of user. Nine more were caught by the matrix, and they are the
interesting ones, because every single one is a **collision** — two rules that
are each correct alone and wrong together. An admin who could not suspend a
fellow admin could delete their role row instead, which is demotion. A
suspended account could still write notifications directly into anyone's
list, which is every other rule bypassed. A suspended host kept accepting
strangers. Somebody you blocked could still reach you through a notification.
A moderator could rule on a report they filed themselves.

None of those is visible from reading a single rule, which is the argument for
having written the matrix at all.

Beyond that: 16 authenticated attacks run against the live project, a fuzzer
over the scorer, and an integrity sweep checking invariants on the real data.

### "What was the hardest bug?"

Pick one and tell it as a story. Good candidates:

- **The stored XSS.** Leaflet builds markers from an HTML string inserted with
  `innerHTML`, and the activity category was interpolated into it. JSX escapes
  attribute values; a template literal does not, and the two read almost
  identically. A host could have run script on every viewer's session. Fixed
  by whitelisting against the fixed category vocabulary and constraining the
  category in the rules.
- **The join that looked like it worked offline.** Firestore queues the write
  and applies it locally, so the count went up and the button changed — but
  `await` never resolves offline, so there was no confirmation and the success
  message fired minutes later on reconnect.

### "How would this scale?"

It would not, in one specific place, and you should name it before they do:
every signed-in client downloads every user profile to compute compatibility.
Fine for a cohort, absurd for a city. Scoring also runs on the client, so it
is visible to anyone who opens devtools. Both are in ADR-006 with the reason —
server-side scoring needs Cloud Functions and the paid plan.

### "What would you do differently?"

- Build the security rules and their tests **first**. Two of the three holes
  they caught were designed in, not typed in, and would have been cheaper to
  find before the data model set around them.
- Not denormalise the host's name onto activities without a plan for keeping
  it in step. That one decision caused both a stale-data bug and a privacy
  leak.
- Give the collaborative signal something content features cannot say. It is
  computed from interests, times and history — the very things the other
  signals already use — which is why it earns nothing.

### "What doesn't it do?"

Answer this one first, unprompted, at the end of the demo. README section 12:
no push notifications to a closed phone, no photo uploads, no address search,
Android untested, chat closed rather than deleted, and anonymity is not
retroactive for messages already sent.

Known limitations disclosed first are a strength. Discovered by the panel,
they are a weakness.

---

## ADR-012 — The peer directory is readable by every signed-in user

**Context.** An audit asked whether the app exposes more than it needs to. It
does, and the shape of it is worth writing down rather than rediscovering:
any signed-in user can list `users` and read every activity, including its
`participantUids`. Between the two, the whole social graph — who exists, and
who joined what — is enumerable from a phone.

**Why it is that way.** Two separate constraints, neither of which is
incidental.

Matching runs on the client (ADR-006), and compatibility is computed against
other people's interests, preferred times and joined-category history. A
client that cannot read peers cannot rank anybody, so the directory has to be
readable for the feature to exist at all.

The roster lives on the activity document as an array, not in a subcollection,
because that is the only shape in which Firestore's rules can verify a
membership change atomically — the note at the top of firestore.rules explains
why the alternative lets anyone inflate an activity to full and lock others
out. Anything that can read an activity can therefore read who is on it.

**What is not exposed.** The public half is deliberately thin: name, avatar,
username, bio, interests, preferred time, joined categories. Email, real name
and precise location live in `users/{uid}/private/profile`, which only its
owner can read — an admin included. Anonymous mode rewrites the public
identity at the source, so a person in anonymous mode is anonymous in the
directory too, not merely on screens that remember to check. `notifications
Enabled` is the one setting deliberately kept public, because the sender's
rules have to read it for it to mean anything.

**Decision.** Accept it, and say so. The exposure is the cost of client-side
matching plus atomically-verifiable membership, both of which were chosen on
their merits.

**What would change it.** Moving scoring to a Cloud Function, which would let
the directory stop leaving the server — the same change ADR-006 already names
as the thing to do if scoring ever needs data the client should not hold. At
that point `users` could be closed to listing, and participation could move
behind a function too. It is a deliberate trade now rather than an oversight,
and it should be revisited the moment the app is used by people who did not
choose to be in a directory with each other.

## ADR-013 — A follow is stored twice, and the host's copy does the work

**Context.** The People screen's "Notify me" said *"you'll be alerted when
they post an activity"*. A follow was stored as `users/{me}/following/{them}`,
readable by nobody but me, and nothing ever read it to send anything. The
promise could not be kept from where the data lived: the only client that
knows something was posted is the host's, and the host could not see who was
listening. There is no server here to look across accounts (ADR-006).

**Decision.** Mirror the follow to `users/{them}/followers/{me}` in the same
batch. The follower writes it, about themselves, with a timestamp and nothing
else; the host may read the list; nobody else can see a row; nobody may edit
one. When the host creates an activity, their own client reads its followers
(bounded at two hundred) and writes each a `follow` notification whose id is
derived from the activity — so a repeat is a write to a document that exists,
which the rules refuse, and nobody is told twice. A refusal (notifications
off, or the follower blocked the host) is a decline, not an error. Follows
made before the mirror existed get their host-side half written once per
session by the follower's client.

**What the host learns.** A list of ids. Nothing in the app shows it, and the
follower's own list stays private as before.

**What would change it.** The same thing as ADR-012: a Cloud Function that
fans out server-side, at which point the mirror could go and the cap could
too.

## ADR-014 — A notification has to be earned

**Context.** Any signed-in account could write a notification of any `type`
into anybody's inbox. The screen files them by type, so a `moderation` one —
"your account has been closed, email us to appeal" — rendered under Safety
looking exactly like a decision SmartSync had made, pointing at whatever
listing the writer liked.

**Decision.** The shape is fixed to the six fields the app writes. A
notification about an activity (`activity`, `chat`, `follow`) has to come
from somebody on that activity's roster; a `moderation` notice has to come
from a moderator. Nothing else exists. Chat notifications also carry a
per-thread ten-minute bucket in their id, so a thread notifies a person at
most six times an hour however many messages there are and whoever sends
them — the first write in a window creates the document and every later one
is refused. The inbox keeps the newest twenty moderation notices in view
through a second small listener, whatever the rest of the inbox is doing; it
needs a composite index (`notifications`: `type` asc, `createdAt` desc),
which must be deployed before the client that uses it.

## ADR-015 — A write is waited for, not waited on

**Context.** A Firestore write's promise settles only when the server has
acknowledged it — which, offline, is never. Firestore applies the write
locally at once and queues it, which is the behaviour the app wants on
patchy wifi; but every screen that awaited a write behind a busy flag sat
on "Creating…", "Saving…" or "Setting up…" until the connection came back,
with nothing saying why. Joining had already solved this by not waiting and
saying "Joined — will sync". The same connection dying quietly (the browser
can report "online" for a minute after the wifi has gone) held a button
hostage for as long as the SDK took to notice.

**Decision.** Every awaited write goes through `awaitWrite`
(`src/utils/writes.js`): the write is raced against a budget — nothing
when the app already knows it is offline, ten seconds otherwise — and when
the budget wins the caller gets `QUEUED`. The write stays in Firestore's
queue and is sent when it can be; the screen moves on as if it had landed
(the local cache already shows it); the toast says "— will sync"; and a
refusal that arrives later is still shown as a toast wherever the person is
by then, so a queued write that eventually fails is reported, not lost. An
online write that lands or fails within the budget looks exactly as it did.
`createActivity` mints its id locally (`doc()` + `setDoc`, not `addDoc`) so
an offline host can be sent to their new activity's page.

**What a queued write carries is kept.** A queued write that the server
refuses later rolls its local copy back, and the content — the chat
message, the activity, the profile edit, the report — used to go with it,
announced by a toast and gone. The context now keeps every queued write
that carries what somebody typed (`unsent`, per account, in localStorage):
`pending` until the server answers, `failed` with the reason once it
refuses, gone once it lands. A failed row is offered back on the screen it
came from — a "Not sent" bubble with Retry and Discard in the chat, a
"couldn't be saved — Restore / Discard" notice on the create, edit,
profile and report forms — and is never written over anything typed since.
Messages and reports mint their ids locally (`doc()` + `setDoc`, like
activities) so a row can be checked after a reload: rows from an earlier
page load are settled, once the server has answered and the queue has
drained, by asking the database whether each landed. Two tabs of one
account merge their registries rather than overwrite each other's.

An edit is judged three ways, not two. A row for an edit carries what the
form was seeded with as well as what it saved, so after a reload the
document showing the save is *landed*, the document still showing the
seed is *refused*, and the document showing neither is *superseded* — an
edit made elsewhere since, which is offered back as a choice ("is not
what it shows now"), never as a failed save to be restored over somebody's
newer version. Comparing fields alone had called a landed-then-re-edited
save a failure. A second edit of the same document while the first is
still pending replaces the first: the form was seeded from the document
as the first edit left it, so the newer row carries everything.

The registry survives storage that is blocked or full. Rows live in memory
for the life of the page and in the most durable browser store that will
take them — localStorage, else this tab's sessionStorage, else memory
alone — chosen again on every write, with a store that refused the write
cleared of its older copy so a stale one is never read back in preference.
When memory is the only copy, leaving the page is put to the person first
through the browser's own "leave this page?" — a browser that blocks this
storage blocks Firestore's queue too, so the queued writes would go with
the rows.

**Moderation waits differently.** Moderation writes are transactions and
need the server. Offline, nothing is started and the person is told
nothing changed — which is true. Online, an action is given twenty
seconds; past that the screen is unblocked with "still trying", and the
real outcome is announced when it arrives. Every action is idempotent, so
repeating one is always safe advice, and nothing reports a success it has
not seen.

**Silence is named as silence.** The connection banner has two sentences.
The device having no connection, or a feed that was answered by the
server and then was not, is "Offline". Nothing heard from any listener for
twenty seconds is "No answer from the server yet — showing what was last
loaded" — because, measured against a server whose every answer was held
for five seconds, the banner came up at the threshold and went down
thirteen seconds later when the first answer arrived. That is a slow
server, not an absent one, and the screen says what is known rather than
a verdict. Either way the first server word clears it.

**Sign-up makes one profile, whoever gets there first.** Two things
create a new account's profile — the sign-up, with the typed name, and
the auth observer, which covers accounts made outside the form — and they
run at once. The create is a transaction that writes only if the document
is still missing at commit time, so the second finds the first's and
writes nothing; the sign-up leaves the name where the observer can read
it before the account exists, so whichever writes carries the name; and
both write with the same patience — a refusal or a blink of the connection
buys a fresh credential and another try, twice, under two seconds in all.

**The identity sweep from the cache.** Renaming or switching anonymous
mode stamps every hosted activity in the same batch as the profile. Offline
the list of activities comes from the cache and can be short; the batch
still goes — the switch must not wait for a server that is not there — and
the profile records that the sweep is unfinished, in that same batch. Once
the server has answered, the app reads the host's activities from the
server and stamps whichever still disagree, clearing the note with the last
of them; a failure leaves the note for the next connection.

**Also decided alongside.** The feed's first server answer is waited for
before an activity the cache lacks is called missing (`syncing`). Twenty
seconds of nothing but cache from *anyone* is treated as offline
(`SERVER_SILENCE_MS`) so a stream that never connects still produces the
banner — but the three profile listeners are tiny and answered first on
any link that works, so a feed that is merely slow on a link the profile
came down is not called a dead server (`serverSeen` in AuthContext); the
wait for the feed simply ends. A route chunk the server no longer has —
every tab left open across a deploy — reloads the page once, since
React.lazy keeps the rejection and no in-place retry can help; a chunk
that is still missing after that reaches the boundary with a Reload
button and no loop. Working a report is claim, act, record — ADR-016.

## ADR-016 — A report is claimed before it is acted on

**Context.** Working a report was act, then record. Two moderators could
act on the same report at once: the record kept whichever decision landed
second, and — worse — a suspension could be taken on a complaint a
colleague had dismissed a second earlier. Closing the report once (the
first fix) made the record honest and left the action wrong.

**Decision.** A report carries a claim — `{ by, at }`, stamped with the
server's clock — and working one is two writes in order: claim, then act
and record in one transaction. The rules refuse a claim while somebody
else's is fresh (five minutes), refuse a decision without the claim, and
refuse any decision on a closed report. Every action taken from the queue
reads the claim in the same transaction that writes its consequence — the
roles row for a suspension, the activity for a takedown, the warning — so
a claim that was lost aborts the action before anything changes. Where the
action can name its report, the rules check the claim on that write too: a
takedown, and a warning, which must also be about the report's subject. A
roles row cannot name a report — it is three fields and nothing else, on
purpose — so the decision is committed *in the same transaction* as the
action, and the decision needs the claim: a transaction lands whole or not
at all, which makes a suspension recorded against a report impossible to
commit without holding its claim, and leaves no moment at which the
account is suspended and the report still open. A warning lets the claim
go in the same step. An action that fails releases the claim so a
colleague can finish; a claim that is simply abandoned expires, and its
holder's late writes are refused because it is no longer theirs. The queue
shows "In review by …" for a colleague's fresh claim and waits; a refusal
is told apart as "being handled", "already handled", "already done" (the
moderator's own decision landed while its acknowledgement was lost), or
the ordinary refusal.

**Consequences.** The moderator who acts is the one whose claim is fresh
at commit time — verified by transaction, and for everything attributed to
a report, by the rules. Abandoned work costs a colleague at most five
minutes. A moderator whose claim went stale without anyone taking over may
still finish. What this does not do: prevent two moderators from *reading*
the same report, or stop a moderator from acting on somebody through the
People directory without a report at all — that was always allowed, is
unchanged, and is judged by the roles and warnings rules alone.

## ADR-017 — The interface speaks four languages; the database speaks one

**Context.** The app was written in English, with its words inside the
components and a handful of them inside the database: categories and time
bands on activities, report reasons, the text of every notification, the
context line on a report. The people it is for read Thai, Burmese and
Chinese as often as English, and a language switch that changed only the
labels would still leave them a Thai screen with English notifications —
or, worse, a database whose categories differ by who created the record.

**Decision.** Bundled i18next resources, one JSON file per language, no
translation service: the strings are reviewed text, present at first
paint, and work offline. The chosen language lives on the device
(`smartsync:language`), like the other preferences, and the first paint
is already in it; other open tabs follow a change as it is made; the
browser's language is the first-run default and English is the fallback
for anything missing. The database keeps English
everywhere it already had it — every category, band, reason, signal id
and default name is stored as before and translated only at the moment it
is shown, so filters, rules and the evaluation harness see what they
always saw. Text the rules fix to plain strings (a notification's title and
body, a report's context) is still *written* in English, from a template
table shared with the reader; the reader recognises the template in the
stored text, lifts the names and titles out of it, and words the sentence
afresh. A text it does not recognise — an older wording, a hand-written
one — is shown as stored. Recommendation reasons are attached as facts
(`reasonKeys`) beside the sentences the scorer always produced, and the
screen words the facts; the scorer's output and weights are unchanged.
Dates, clocks, distances, percentages and lists follow the language with
Latin digits throughout; day and month names and the list joiner come from
the translation rather than `Intl`, because a browser may lack calendar
data for a language (desktop Chrome has none for Burmese and answers in
English without saying so) and a date must read the same on every device.
Native `required` validation is switched off on the auth forms in favour
of the app's own messages, for the same reason. Names, titles,
descriptions, messages and a moderator's own words are never translated.

**Consequences.** Adding a language is a file plus one row in `LANGUAGES`;
a key-parity test refuses a file that lacks a key or a placeholder.
Everything English in the database is a display concern, not a migration.
What this does not do: translate what people wrote; carry the language
choice between devices (it is a device preference, not a profile field —
a profile field would be a schema and rules change for a setting the
device already remembers); or word a warning's seeded reason in the
recipient's language — the moderator edits and sends that text, so it is
their words, in their language, like any reason they type.

## ADR-018 — Two token sets, one attribute, and a script that runs first

**Context.** The app had one palette, declared as custom properties on
`:root` and used everywhere; the only literal colours outside that block
were white on category gradients, which are the same in any theme. People
asked for a dark appearance, and for the choice to follow the device when
they had no preference of their own.

**Decision.** The theme is a second token set under
`:root[data-theme='dark']` — the same warm hue at rising lightness, the
accent lifted two stops so it reads as text on a dark card and takes dark
ink on filled controls — and nothing else: no component knows which theme
it is in, and no rule is duplicated. The few rules that carried literals
that mattered (the dialog scrim, loading skeletons, two urgency pills, the
per-category chip tints, shadows, the map ground) were given tokens so the
dark set could turn them over. The preference is one word on the device
(`smartsync:theme`: light, dark or system), like the language; the
resolved theme is stamped on the root element, and `system` resolves
through `prefers-color-scheme` and re-resolves on the device's `change`
event, attached once for the life of the page. Because the hosting policy
allows no inline scripts, `public/theme-boot.js` — a classic script
served from this origin, first in `<head>`, ahead of the stylesheet —
stamps the same attribute before the first paint, so the page opens in the
theme it was left in; hosting serves it `no-cache` because its name carries
no hash. `color-scheme` follows the attribute so native pickers and
scrollbars match. The map's tiles are OpenStreetMap's and cannot be
re-drawn; in the dark set they are inverted and turned back through the
hue wheel, and the pins, in their own pane, keep their colours.

**Consequences.** Adding a colour means declaring it in both sets; a
literal in a component rule is now a bug. The choice is per device, not
per profile, for the same reason as the language. What this does not do:
re-theme the category gradients (they are saturated grounds that already
read in the dark) or the OpenStreetMap tiles beyond a filter.

