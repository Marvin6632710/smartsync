# SmartSync — roadmap

**Live at <https://smartsync-c1f07.web.app>.**
Defence: **Wednesday 23 September 2026** — 13 days from 10 September.

Status as of 10 September: **88% of tracked work complete (38 of 43 items).**

| Tier                                       | Done | Open |     |
| ------------------------------------------ | ---- | ---- | --- |
| Quick (Q) — UI and logic fixes             | 15   | 0    | ✅  |
| Medium (M) — engine and UX                 | 11   | 0    | ✅  |
| Large (L) — algorithm, privacy, evaluation | 6    | 0    | ✅  |
| Backend & operations (B)                   | 6    | 3    |     |
| Deliverables (D)                           | 3    | 2    |     |

**All application code is finished.** Everything remaining is either
operational hygiene or written work, and two of the five open items can only
be done by you.

---

## What was actually built

Not a feature list — the things that would be hard to claim without evidence.

**A real multi-user application.** Accounts, a shared database, live updates,
group chat, real GPS distance and real maps. Two people in different places
see each other's activities and each other's messages.

**A security model that has been attacked.** 71 rule tests behave like a
hostile client, plus 16 authenticated attacks run against the live project.
They have caught three genuine holes, each fixed by redesign rather than
patching:

- membership could be inflated by anyone, because rules cannot see sibling
  writes in a batch
- a stored XSS through Leaflet marker HTML, where a category could carry an
  event handler
- anonymous mode left the real name on every activity a person hosted

**A measured recommendation engine.** 39.3% precision@5 against 18.0% for the
best single signal and 5.2% for random, over seven independent populations —
and an honest finding that three of the six signals earn nothing, two of which
were then redesigned because of it.

**Deployed, and verified on a real iPhone.**

---

## What is left

### You only — start with these

| #                  | Task                                                                                                                                                                        | Effort |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **D-03**           | **Record the backup demo video.** If the venue's wifi fails you present anyway. Follow DEMO_SCRIPT.md and screen-record it.                                                 | 1 hr   |
| **D-04**           | **Report and slides** to the department template. Check the brief for required artefacts — an SRS, UML, a test matrix — most of which can be pulled out of this repository. | —      |
| **D-02 rehearsal** | The script is written; running it three times against a timer is not something anyone else can do for you.                                                                  | 1 hr   |

### Can be done for you

| #        | Task                                                                                                                         | Effort |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| **B-09** | **Accessibility sweep** — keyboard-only run through the main flow and a contrast check. Frequently on rubrics, cheap to fix. | 1 hr   |
| **B-07** | **Quota sanity check** — confirm a demo session is nowhere near the Spark plan's 50k reads/day.                              | 20 min |
| **B-08** | **Data export** — a snapshot of the database before the defence, so a bad write is recoverable.                              | 30 min |

### Optional, if time allows

From `EVALUATION.md` §7, in value order:

1. **Reconsider the distance weight.** Consistently the second most
   informative signal while holding 20% of the weight.
2. **Drop or repurpose popularity.** Worth nothing in every ablation, and
   alone it barely beats random.
3. **Give the collaborative signal something content cannot say.** It is
   computed from interests, times and history — the very things the other
   signals already use — which is exactly why it earns nothing.

None of these are needed for a complete project. They are the difference
between "we built it and measured it" and "we measured it and then acted on
what we found", and the first two are one-line changes whose effect can be
demonstrated live on the weights screen.

---

## The two weeks

**Now → 13 Sep.** Finish B-07, B-08, B-09. Record the backup video. Start the
report while the work is fresh.

**14 → 19 Sep.** Report and slides. Rehearse the demo three times, timed,
writing the real numbers into the log at the end of DEMO_SCRIPT.md.

**20 → 22 Sep.** **Code freeze.** Nothing new goes in; crash fixes only. Read
`DECISIONS.md` end to end, including the questions section. Re-run
`npm run seed:production -- --confirm --refresh` the night before, and check
the four figures the demo script quotes still match the screen.

**23 Sep.** Phone charged and on mobile data, not venue wifi. Backup video on
the laptop. Two browser windows open before you speak.

---

## Risks

| Risk                                          | Mitigation                                                                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demo data has expired and the app looks empty | `--refresh` the night before. This has already caught us once: ten of eighteen activities, including the one holding the chat thread, would have been gone by the 23rd. |
| Venue wifi fails                              | The recorded video. Do not debug in front of a panel.                                                                                                                   |
| Scope creep in the final week                 | Code freeze on the 20th, no exceptions. Everything in "optional" above is genuinely optional.                                                                           |
| A question about something not built          | README section 11 lists every limitation. Say them first, unprompted.                                                                                                   |
| Firestore quota trips mid-demo                | B-07. Spark allows 50k reads a day; a demo uses a tiny fraction, but do not leave tabs holding listeners open overnight.                                                |

---

## Tracking

- **`FIXLIST.md`** — every task, by tier, with status
- **`DECISIONS.md`** — why the architecture is what it is, and the questions
  a panel asks. Read before the defence.
- **`EVALUATION.md`** — does the ranking work, and what each signal is worth
- **`DEMO_SCRIPT.md`** — the seven-minute click path
- **`README.md`** — how to run it, the data and security models, limitations
