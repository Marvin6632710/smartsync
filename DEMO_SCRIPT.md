# Demo script

**Target: 7 minutes.** Rehearse it three times with a timer. Improvising the
click path is the most common way a good project demos badly — you end up
narrating navigation instead of showing the thing you built.

Live at **<https://smartsync-c1f07.web.app>**. Account passwords are in
`demo-credentials.local.txt` (not in this repository).

---

## The night before

1. **Re-date the demo activities.** Activities that have already started are
   hidden from discovery, so a set seeded weeks ago quietly empties out.

   ```bash
   SEED_PASSWORD='...' npm run seed:production -- --confirm --refresh
   ```

2. **Open the live URL and sign in as each account you will use.** Getting a
   password wrong in front of a panel costs a minute and your composure.

   While you are there, check the four numbers the script quotes are still
   what you will say — sign in as each and look at **Weekend Five-a-Side**
   and **Exam Week Study Sprint**. They should read 78 / 37 and 40 / 76.
   If they have moved, use what you see; do not read out a number the screen
   disagrees with.

3. **Record the backup video** (D-03). If the venue's wifi fails you present
   anyway. This is the single highest-value hour of preparation you can do.

4. **Charge the phone**, and put it on mobile data — not the venue wifi.

## Setting up, before you speak

- **Two browser windows side by side**, both at the live URL.
  - **Left = Min Khant Aung** (`you@smartsync.demo`) — interests Football,
    Gaming, Coffee
  - **Right = Maya Rahman** (`maya@smartsync.demo`) — interests Coffee,
    Study, Movies
- Both already signed in and sitting on **Discover**.
- Phone in your hand, same URL, signed in as Min Khant.
- Close every other tab. Nothing kills a demo like a stray notification.

---

## The script

### 0:00 — What it is (30 seconds, no clicking)

> "SmartSync helps people find activities near them and meet by doing things
> together. It is a real application — anyone can sign up, and everything you
> are about to see is live on the internet rather than mock data."

Do not click yet. Let them look at the two screens.

### 0:30 — The same data, ranked differently (90 seconds) ⭐

**This is the whole thesis. Do not rush it.**

Point at the two windows.

> "These two people are looking at the identical set of activities. Same
> database, same moment."

On the **left** (Min Khant), scroll to **Weekend Five-a-Side**.

> "Football. For him it scores 78%, near the top."

On the **right** (Maya), find the same activity — it is far down the list.

> "The same activity, for her: 37%."

Now the reverse. Right window, **Exam Week Study Sprint**: **76%**, near the
top. Left window, same activity: **40%**, far down.

> **Quote the percentages, not the positions.** A score depends only on the
> person and the activity, so 78 / 37 / 76 / 40 will be the same on the day.
> Where each one sits in the list depends on what else is still upcoming, and
> that changes as activities expire.

> "Her interests are coffee, study and films. His are football, gaming and
> coffee. Nothing is filtered — everything is visible to both. It is the
> ranking that differs."

### 2:00 — Why it ranked that way (60 seconds)

Left window: open **Weekend Five-a-Side** → tap **More** under match reasons.

> "Every activity is scored out of 100 against six signals — interest,
> distance, time of day, what you have joined before, how full it is, and
> whether people similar to you are going."

Tap **Adjust these weights**.

Drag **"Matches your interests"** to zero.

> "The ranking reorders as I move it."

Press **Reset to defaults**.

> "We measured what each of these is actually worth — I will come back to
> that."

### 3:00 — It is genuinely multi-user (90 seconds) ⭐

Right window (Maya): open **Weekend Five-a-Side** → **Join activity**.

Point at the **left** window without touching it.

> "I have not touched this window."

The participant count has gone up on its own. Open the notification bell in
the left window — Maya's join is there.

Right window: **Open chat**, send a short message. It appears in the left
window's thread.

> "Two accounts, one database, live updates. This is the part that was not
> possible before there was a backend."

### 4:30 — On a real phone (45 seconds)

Hold up the phone, on mobile data, already signed in.

> "Same URL, same account, no app to install."

Open the **Map**. Real coordinates on a real map; distances computed from
where you actually are.

### 5:15 — How you know it works (75 seconds)

Do not open the app for this. Have `EVALUATION.md` on screen or printed.

> "The obvious question is whether the recommendations are any good. We
> measured it against a synthetic population of 400 people whose true
> preferences we know, over seven independent populations."

| Ranker              | precision@5 |
| ------------------- | ----------- |
| Random              | 5.2%        |
| Most popular first  | 6.2%        |
| Interest match only | 18.0%       |
| **SmartSync**       | **39.3%**   |

> "About twice the best single signal, seven times chance."

Then, deliberately:

> "The more useful result is that three of the six signals earn nothing. The
> history signal was scoring the same fact as the interest signal — 59%
> overlap — so we changed it to measure only what interests do not say.
> Popularity we left in, and the evidence says it is not paying for itself."

**Say this. Do not let them find it.** A student who reports their own
negative results reads as a researcher; one who does not reads as someone who
did not look.

### 6:30 — Close (30 seconds)

> "It is live, it is multi-user, the security rules are tested by 71 tests
> that attack them as a hostile client, and the ranking is measured rather
> than asserted. The limitations are written down in the README — no push
> notifications, no photo uploads, and the collaborative signal still does not
> earn its place."

Stop talking. Take questions.

---

## If something goes wrong

| Problem                                        | What to do                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Wifi dies                                      | Switch to the recorded video. Do not debug in front of the panel.                                                  |
| A screen looks empty                           | You forgot the `--refresh` step. Say so plainly and use the phone, which will have cached data.                    |
| An action seems not to work                    | Firestore queues writes offline and the app shows an offline banner. Point at it — it is a feature, not a failure. |
| Someone asks for a feature that does not exist | "That is on the roadmap and here is why it is not built" beats improvising. README section 11 lists them.          |
| You lose your place                            | Go back to the two-window comparison. It is the strongest thing you have.                                          |

## Do not

- **Do not create an account live.** It works, but it costs ninety seconds of
  typing and shows nothing the seeded accounts do not.
- **Do not tour the settings screens.** Nobody is grading the privacy toggles.
- **Do not open devtools.** Ever.
- **Do not say "just" or "simply".** It invites the question of why it took a
  term.

## Rehearsal log

Three runs, timed. Write the real numbers in — the point is to find out where
you overrun before the panel does.

| Run | Date | Time taken | What went wrong |
| --- | ---- | ---------- | --------------- |
| 1   |      |            |                 |
| 2   |      |            |                 |
| 3   |      |            |                 |
