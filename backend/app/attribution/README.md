# app/attribution/

**Owner: B3.** AIS matching and vessel scoring — the last stage of the chain,
turning a drift corridor (Contract 2) into a ranked suspect list.

## What this does

Given a corridor (a swept lookback of space-time nodes from B2) and the
slick's bearing (from B1's Contract 1), this module finds which vessels
could plausibly be the source of a discharge, and ranks them.

**It never accuses. It ranks.** Every score ships with its five-factor
breakdown, so a human investigator can see *why* a vessel ranked where it
did and overrule the system if the evidence doesn't hold up. That
transparency is the actual deliverable — not the number.

## Pipeline

```
AIS positions (synth.py or real collector)
        │
        ▼
filter_temporal()      -- stage 1: drop anything outside the lookback window
        │
        ▼
match_corridor()        -- stage 2: keep vessels matching a corridor node
        │                  in BOTH space and time (normalised distance,
        │                  not raw km -- radius grows with hours_ago)
        ▼
score_candidate()        -- five factors, kept unmerged
        │
        ▼
rank_suspects()          -- sorts, returns top N with full breakdowns
```

## Files

| File | What's in it |
|---|---|
| `synth.py` | Synthetic AIS generator: one guilty track (aligned heading, slows, goes dark near the corridor) plus three *hard* decoys — each right in exactly one dimension, wrong in another. Easy decoys make scoring look better than it is. |
| `funnel.py` | Two-stage filter. `filter_temporal()` is cheap and decisive; `match_corridor()` is the real test — a vessel in the right place at the wrong lookback is excluded. |
| `score.py` | `WEIGHTS` dict (single source of truth) plus five scoring functions: `axis_alignment`, `proximity`, `temporal`, `speed_anomaly`, `transponder_gap`. |
| `rank.py` | Orchestrates funnel → score → sort. Lives here (not `score.py`) because `scripts/run_chain.py` already imports `rank_suspects` from this path — don't rename. |

## The three hard decoys

| Decoy | Right about | Wrong about | Tests that... |
|---|---|---|---|
| DECOY TIME | position | lookback (12h too early) | the corridor's time dimension is doing work — flatten it to a point and this wrongly wins |
| DECOY SPACE | lookback | position (far off corridor) | the funnel's spatial check works at all |
| DECOY CROSS | position and time | heading (~90° off the slick axis) | the scoring's heading-alignment factor works — this one survives the funnel on purpose, then loses on `heading_alignment: 0.0` |

## Weights

```python
WEIGHTS = {
    "heading_alignment": 0.30,   # strongest physical signal
    "proximity":         0.25,
    "temporal":          0.20,
    "speed_anomaly":     0.15,
    "transponder_gap":   0.10,
}
```

These are **engineering judgment, not measured optima.** There is no
ground-truth attribution dataset — real spills don't come with a labelled
guilty vessel — so there's no accuracy figure to report. What we do report
is a **self-consistency check**: does the guilty vessel rank #1 across a
handful of varied synthetic scenarios? That's a sanity check on the scoring
logic, not a claim about real-world accuracy.

If you change a weight, say why in the commit body — a weight change alters
the ranking, and B2/frontend may be looking at a stale screenshot.

## Honesty rules (non-negotiable for the demo)

- Every response from `app/routers/attribution.py` tags `ais_source` so the
  UI can never imply real-world data when synthetic AIS is running.
- Synthetic AIS validates pipeline logic only — it is never real-world
  ground truth.
- Suspects are ranked, never accused.
- If asked for an accuracy number: there isn't one. Say so. "Not yet
  measured" costs nothing at the idea stage; an invented number costs
  everything if a judge checks.

## Running it

```bash
pytest tests/test_scoring.py -v
python scripts/run_chain.py synthetic
python scripts/build_cache.py demo_scene_1 synthetic
```