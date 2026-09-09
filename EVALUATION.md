# Does the recommendation engine work?

```bash
npm run evaluate
```

About 75 seconds. Seeded, so the numbers reproduce exactly. `EVAL_SEED=<n>`
runs a different population; `EVAL_QUICK=1` skips the tuning search.

"We built a weighted scorer" describes the code; it is not evidence the
ranking is any good. This measures it, and then measures what each part of it
is contributing.

**Short answer: yes, and by a wide margin** — about twice the best single
signal and seven times chance. **But only three of the six signals earn their
place**, and finding that out changed the model twice.

---

## 1. Method

400 simulated people and 200 activities per population, repeated over **seven
independent populations**, because a difference of half a point on one seed is
noise until it survives a few.

The obvious way to get a flattering result is to define "relevant" using the
function under test. Four things keep this honest:

**The ranker sees less than the truth.** Each person has a continuous latent
affinity in `[0,1]` for all twelve categories, a home coordinate, and a
personal distance tolerance. The model never sees any of it. It sees what the
app actually stores — about three interest strings, one preferred time band, a
history list — a deliberately lossy sample. People omit interests they hold
and list ones they rarely act on; a quarter never set a preferred time; a
third refuse location entirely.

**There is no single correct weighting.** Every simulated person weighs
interest, distance, time and crowd differently. One will cross the city for
the right activity; another will not cross the road.

**Attendance is generated, not assigned.** People join what they would
genuinely most want. This matters: an earlier version assigned participants at
random, which left no homophily for the collaborative signal to find and no
meaning in how full a room was. It duly reported both as useless — a fact
about the simulation, not the model.

**Nothing is claimed from one run.** Every figure below is a mean over seven
populations, with the spread shown.

An activity is **relevant** to a person if it is in their true top ten of 200.

## 2. Results

Mean precision@5 over seven populations:

| Ranker                     | mean P@5  | range           |
| -------------------------- | --------- | --------------- |
| Random                     | 5.2%      | 4.6 – 5.8       |
| Most popular first         | 6.2%      | 5.6 – 7.3       |
| Nearest first              | 16.7%     | 15.1 – 18.1     |
| Interest match only        | 18.0%     | 16.3 – 19.3     |
| **SmartSync (full model)** | **39.3%** | **36.2 – 40.8** |

- **About seven times chance.** Two of the top five recommendations are
  things the person genuinely wanted, against one in twenty at random.
- **About twice the best single signal.** Combining is doing real work, not
  decorating a category filter.
- **Popularity alone barely beats random** (6.2% vs 5.2%) — worth knowing
  before anyone proposes a trending feed.

On a single seed, MRR is 0.606: the first genuinely relevant activity sits at
about rank 1.6, usually first or second.

## 3. What each signal is worth

Each removed in turn, mean change in precision@5 over the same seven
populations:

| Signal removed | mean ΔP@5 | sd  | Verdict           |
| -------------- | --------- | --- | ----------------- |
| interest       | −19.2     | 1.5 | carries the model |
| distance       | −12.0     | 1.6 | carries the model |
| time           | −4.4      | 0.7 | contributes       |
| history        | −0.1      | 0.2 | earns nothing     |
| popularity     | +0.5      | 0.6 | earns nothing     |
| behavior       | +0.3      | 0.2 | earns nothing     |

Three signals carry the model; three are dead weight holding 30% of it.

Note also that **distance contributes almost as much as interest while holding
20% of the weight against interest's 35%**. On this population the model
over-weights what people say they like relative to how far they will travel.

## 4. What the measurements changed

Two findings were specific enough to act on, and acting on them was itself
measured.

**History was repeating what interests already said.** 59% of a person's
history categories are also among their stated interests, so most of its
weight was scoring the same fact twice — and the ablation had it _actively
hurting_ (+0.8 points when removed). It now counts only where interests do
not: what you keep doing that you never claimed to like. Revealed preference,
rather than a second copy of stated preference.

The result is not mainly in the total. History went from hurting to neutral,
the overall model gained about a point — but the striking part is what it did
to **interest**, whose ablation went from −7.2 to −19.2. The two signals had
been overlapping; now that they say different things, losing either costs far
more. The redundancy had been hiding how much interest was worth.

Honest about the strength of the evidence: the direct improvement measured
+0.8 points with a standard deviation of 1.2 across seven populations. The
direction is supported and the magnitude is not. It is kept on the structural
argument — a signal should not spend its weight restating another — rather
than on the size of the number.

**The collaborative signal was binary and almost never fired.** It asked "is
anyone here at least 50% compatible with you", which is true for only **9%**
of activities. On the other 91% it contributed the same constant to
everything and could not separate two activities at all — while the
compatibility scores it needed were already being computed and thrown away.
It is now the continuous best-match compatibility among the people going.

**This did not produce a measurable win.** It stopped the signal actively
hurting, but it still earns nothing (+0.3 when removed). The reason is a limit
of the study rather than of the idea: in this simulation a person's taste _is_
their category affinities, so "people who like football joined the football
game" tells you nothing the interest signal has not already said.
Collaborative filtering earns its keep when it finds taste that content
features miss, and this generator has no such structure to find. The change is
kept because it is strictly more informative than a threshold, not because
the experiment vindicated it.

## 5. Can the weights be improved?

A random search over 150 weight vectors, **searched on half the population and
scored on the other half**, so the gain is not the search memorising the
people it tuned against:

| Weights              | P@5 (held-out) | NDCG@10 |
| -------------------- | -------------- | ------- |
| Shipped defaults     | 36.7%          | 0.331   |
| Best found by search | 37.8%          | 0.335   |

```
shipped : interest 35, distance 20, time 15, history 15, popularity 10, behavior  5
tuned   : interest 40, distance 40, time 35, history 37, popularity  3, behavior 17
```

The gap has narrowed from 2.4 points to 1.1 since the two changes above, which
is what you would expect if the model moved towards a better shape.

**The shipped weights are still deliberately unchanged.** The search ran
against my own generator, and adopting its answer would tune the product to a
simulation rather than to people. What it supports is narrower: distance is
probably underweighted, and popularity — which the search cuts to 3 and the
ablation says is worthless — is probably not worth its 10. The settings screen
exposes all six as sliders, so the claim can be tested live rather than taken
on trust.

## 6. What this does not establish

- **It does not show the six signals are the right six.** The generator
  assumes interest, distance, time and crowd-fit matter, so this measures how
  well the model combines and weights those factors, not whether the choice of
  factors is correct. Settling that needs real users.
- **Synthetic people are not people.** Real preference is not a weighted sum
  of four terms with Gaussian noise. The figures show relative ordering
  between rankers, not what precision to expect in Bangkok.
- **The collaborative signal remains untested in substance**, for the reason
  given in section 4. A world where taste is exactly its category affinities
  cannot reward finding taste that categories miss.
- **Seven populations, one shape of city.** The ordering is stable across
  seeds; the absolute percentages would move under a different density or
  category mix and should not be quoted as properties of the algorithm.

## 7. What follows from this

1. **Reconsider the distance weight.** Consistently the second most
   informative signal across every population, holding 20%.
2. **Drop or repurpose popularity.** It costs 10% of the weight, the ablation
   says it is worth nothing, and alone it barely beats random. Capacity
   pressure — "2 places left" — is more useful shown as information than
   folded into a score.
3. **Give the collaborative signal something content cannot say.** It is
   continuous now, but it is still computed from interests, times and history
   — the very things the other signals already use. Co-attendance itself
   (who turns up with whom, independent of category) would be genuinely new
   information, and would need attendance history the app does not yet keep.
