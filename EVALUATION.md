# Does the recommendation engine work?

`npm run evaluate` · takes about 75 seconds · seeded, so the numbers below
reproduce exactly

"We built a weighted scorer" describes the code; it is not evidence that the
ranking is any good. This measures it.

**Short answer: yes, and the combination is what does the work** — the full
model ranks more than twice as well as its best single signal. But three of
the six signals contribute nothing, and one of those is measurably redundant.
Both halves of that are reported below.

---

## 1. Method

400 simulated people, 200 activities, one fixed seed.

The obvious way to get a flattering result is to define "relevant" using the
function under test. Three things stop that here:

**The ranker sees less than the truth.** Each person has a continuous latent
affinity in `[0,1]` for all twelve categories, a home coordinate, and a
personal distance tolerance. The model never sees any of it. It sees what the
real app stores — a list of about three interest strings, one preferred time
band, a history list — which is a deliberately lossy sample of the latent
traits. People omit interests they hold and list ones they rarely act on; a
quarter never set a preferred time; a third refuse location entirely.

**There is no single correct weighting.** Every simulated person weighs
interest, distance, time and crowd differently. One will cross the city for
the right activity; another will not cross the road. A fixed set of weights
therefore cannot be right for everybody by construction.

**Attendance is generated, not assigned.** People join the activities they
would genuinely most want. This matters more than it sounds: an earlier
version of the harness assigned participants uniformly at random, which
quietly made two signals untestable — with random attendance there is no
homophily for the collaborative signal to detect, and how full a room is says
nothing about whether it is any good. That version duly reported both signals
as useless, which was a fact about the simulation rather than about the model.

An activity counts as **relevant** to a person if it is in their true top ten
of the two hundred.

## 2. Results

| Ranker                     | P@5       | P@10      | R@10      | MRR       | NDCG@10   |
| -------------------------- | --------- | --------- | --------- | --------- | --------- |
| Random                     | 5.0%      | 5.0%      | 5.0%      | 0.153     | 0.041     |
| Most popular first         | 5.7%      | 5.7%      | 5.7%      | 0.185     | 0.055     |
| Nearest first              | 15.4%     | 13.3%     | 13.3%     | 0.329     | 0.147     |
| Interest match only        | 16.3%     | 16.1%     | 16.1%     | 0.343     | 0.133     |
| **SmartSync (full model)** | **34.5%** | **29.4%** | **29.4%** | **0.599** | **0.311** |

Reading these:

- **Against chance: about seven times better.** Roughly one in three of the
  top five recommendations is something the person genuinely wanted, against
  one in twenty at random.
- **Against the best single signal: about twice as good.** Interest alone
  reaches 16.3%. Combining signals is doing real work, not decorating a
  category filter.
- **MRR 0.599** means the first genuinely relevant activity sits at about
  rank 1.7 on average — usually first or second in the list.
- **Popularity alone is barely better than chance** (5.7% vs 5.0%), which is
  worth knowing before anyone proposes a trending feed.

## 3. Which signals actually earn their weight

Each signal removed in turn, everything else unchanged:

| Signal removed | P@5   | NDCG@10 | Change in P@5 |
| -------------- | ----- | ------- | ------------- |
| distance       | 25.0% | 0.218   | **−9.5 pts**  |
| interest       | 29.0% | 0.261   | **−5.5 pts**  |
| time           | 30.2% | 0.274   | **−4.3 pts**  |
| history        | 35.4% | 0.320   | +0.9 pts      |
| popularity     | 35.5% | 0.318   | +1.0 pts      |
| behavior       | 35.0% | 0.315   | +0.5 pts      |

Three signals carry the model. Three do nothing, and marginally hurt.

The ordering is not what the weights assume. **Distance carries the most
information while holding 20% of the weight; interest holds 35% and
contributes less.** On this population the model over-weights what people say
they like relative to how far they will actually travel.

## 4. Why the weak signals are weak

"This does not help" is a result. "This cannot help, and here is why" is a
finding — and both were cheap to measure.

**History is largely redundant.** 59% of a person's history categories are
already in their stated interests. The signal is mostly re-stating what the
interest term already said, so its 15% of the weight buys little that is new.

**The collaborative signal almost never fires.** "Similar users are going" is
true for only **9%** of activities. This surprised me — I had assumed the
opposite, that it would saturate to true everywhere and stop discriminating.
It is the reverse problem: the signal is too sparse to move a ranking, because
it needs a peer above the 50-point compatibility threshold to have already
joined. It is also binary, so it cannot express _how_ similar those peers are.

**Popularity is not a preference.** People differ in whether they want a full
room or a quiet one, so ranking by fullness assumes a taste that only some
people have. The standalone baseline confirms it: popularity alone barely
beats random.

## 5. Can the weights be improved?

A random search over 150 weight vectors, **searched on half the population and
scored on the other half**, so the improvement is not the search memorising
the people it tuned against:

| Weights              | P@5 (held-out) | NDCG@10   |
| -------------------- | -------------- | --------- |
| Shipped defaults     | 34.3%          | 0.313     |
| Best found by search | **36.7%**      | **0.337** |

```
shipped : interest 35, distance 20, time 15, history 15, popularity 10, behavior  5
tuned   : interest 15, distance 35, time 31, history 26, popularity  5, behavior  9
```

**The shipped weights have deliberately not been changed to match.** The
tuning was done against a simulation, and adopting its answer would be tuning
the product to my own generator rather than to people. What the result
supports is narrower and worth saying out loud: distance is probably
underweighted, and popularity is probably overweighted. The settings screen
exposes all six as sliders, so the claim can be tested live rather than taken
on trust.

## 6. What this does not establish

Stated plainly, because being caught by these is worse than admitting them.

- **It does not show the six signals are the right six.** The generator
  assumes interest, distance, time and crowd-fit matter, so the experiment
  measures how well the model _combines and weights_ those factors — not
  whether the choice of factors is correct. Settling that needs real users.
- **Synthetic people are not people.** Real preferences are not a weighted sum
  of four terms with Gaussian noise. The numbers show relative ordering
  between rankers, not what precision to expect in Bangkok.
- **One seed, one population shape.** The absolute figures would move under a
  different city density or category mix; the ordering is stable, but the
  percentages should not be quoted as a property of the algorithm.
- **The collaborative signal has not really been tested.** At 9% firing rate
  there is barely anything to measure, so its ablation is close to a no-op
  either way.

## 7. What follows from this

In the order I would do them:

1. **Reconsider the distance weight.** It is the strongest signal and holds
   the second-smallest share of the informative weight.
2. **Make the collaborative signal continuous rather than binary** — the
   compatibility score is already computed and then thrown away in favour of a
   yes/no at threshold 50. Using the value would let it contribute on the 91%
   of activities where it currently says nothing.
3. **Drop or repurpose popularity.** It costs 10% of the weight and, on this
   population, is worse than nothing. Capacity pressure ("2 places left") is
   probably better shown as information than folded into a score.
4. **Reduce history, or make it mean something different.** Being 59%
   redundant with interests, it would be more useful measuring _recency_ or
   _frequency_ of attendance than mere category overlap.
