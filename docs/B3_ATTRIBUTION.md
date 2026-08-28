# B3 — AIS & Attribution  (+ demo cache)

**You own:** `app/attribution/`, `app/routers/attribution.py`, `cache/`
**You consume:** Contract 2 from B2 (the space–time corridor)
**You produce:** a ranked suspect list with per-factor score breakdown
**Extra duty:** precompute the demo scenes that frontend loads at the venue

---

## 0. Understand your position before you write code

You own the stage that **answers the question the PS actually asks** — who did
it. Detection and drift are means to your end. This is the moat: most competing
teams will build a detector and stop.

You also own the only stage with **no ground truth and no benchmark.**

| Stage | Can it be proven correct? |
|---|---|
| B1 detection | yes — held-out test split, IoU, lookalike FP rate |
| B2 drift | yes — run forward from origin, check it reproduces the observation |
| **B3 attribution** | **no** |

There is no public dataset of "vessel X caused slick Y." So when you choose how
much weight proximity gets versus heading alignment, **nothing tells you the
weights are right.** Scoring against AIS you generated yourself is circular: it
proves the pipeline is self-consistent, not that it finds real polluters.

Do not treat that as a flaw to hide. It dictates your design:

> **Transparency is the deliverable, not the score.** You are building a
> shortlisting tool for a human investigator, not a verdict machine. Every factor
> stays separately visible so an analyst can see *why* a vessel ranked where it
> did and apply their own judgment.

Framed that way, unvalidatable weights become a feature. Framed as "our model
identifies the guilty ship," a sharp judge will take it apart.

---

## 1. The AIS schema

Match NOAA's field names exactly, even for synthetic data. Then the same code
reads recorded and generated tracks, and swapping in real data later is free.

| Field | Meaning | Notes |
|---|---|---|
| `MMSI` | 9-digit vessel identity | your join key |
| `BaseDateTime` | timestamp | **force UTC** via B1's `utc()` |
| `LAT`, `LON` | position, degrees | |
| `SOG` | speed over ground, **knots** | 1 kn = 0.5144 m/s |
| `COG` | course over ground, 0–360° | direction of travel |
| `Heading` | hull heading, 0–360° | often 511 = "not available" |
| `VesselName`, `VesselType` | | may be absent |

⚠️ `SOG` is in **knots**, and B2's fields are in **m/s**. Convert at the boundary
and never let a raw knot value into a physics calculation.

---

## 2. Synthetic AIS generator — day 1

One vessel whose track threads the corridor at a plausible lookback, plus decoys
that are *nearly* right. Easy decoys make your scoring look better than it is.

```python
# app/attribution/synth.py
import numpy as np
from datetime import timedelta
from pyproj import Geod

GEOD = Geod(ellps="WGS84")
KN = 0.514444


def _track(mmsi, lon0, lat0, bearing_deg, speed_kn, start, hours,
           ping_seconds=180, name=None, vtype=70, gap=None, slow=None,
           rng=None):
    """Straight-line track.

    gap=(from_h, to_h)          drop pings, simulating a silent transponder
    slow=(from_h, to_h, factor) reduce speed over a window, simulating discharge
    """
    rng = rng or np.random.default_rng(0)
    n = int(hours * 3600 / ping_seconds)
    rows, lon, lat = [], lon0, lat0
    for i in range(n):
        t_h = i * ping_seconds / 3600.0
        sog = speed_kn
        if slow and slow[0] <= t_h <= slow[1]:
            sog *= slow[2]
        # Position must follow the reduced speed too, or the track teleports.
        lon, lat, _ = GEOD.fwd(lon, lat, bearing_deg, sog * KN * ping_seconds)
        if gap and gap[0] <= t_h <= gap[1]:
            continue                                  # transponder silent
        rows.append({
            "MMSI": mmsi,
            "BaseDateTime": start + timedelta(seconds=i * ping_seconds),
            "LAT": lat + rng.normal(0, 2e-5),
            "LON": lon + rng.normal(0, 2e-5),
            "SOG": max(0.0, sog + rng.normal(0, 0.25)),
            "COG": bearing_deg % 360.0,
            "Heading": bearing_deg % 360.0,
            "VesselName": name or f"SYN-{mmsi}",
            "VesselType": vtype,
        })
    return rows


def make_scenario(corridor, slick_bearing_deg, rng_seed=0):
    """Build one guilty track through the corridor plus hard decoys.

    Guilty: passes a corridor node, on a heading ALIGNED with the slick axis,
    slows down, and goes dark for a while. That is the discharge signature.
    """
    rng = np.random.default_rng(rng_seed)
    obs = corridor["observed_at"]
    if isinstance(obs, str):
        from app.common.timeutil import parse_iso_z
        obs = parse_iso_z(obs)

    node = corridor["corridor"][len(corridor["corridor"]) // 2]
    t_guilty = obs - timedelta(hours=node["hours_ago"])

    rows = []
    # --- guilty: aligned heading, back-offset so it crosses the node ---
    back_m = 9.0 * 3600 * 8.0 * KN
    lon_s, lat_s, _ = GEOD.fwd(node["lon"], node["lat"],
                               (slick_bearing_deg + 180) % 360, back_m)
    rows += _track(316001234, lon_s, lat_s, slick_bearing_deg, 8.0,
                   t_guilty - timedelta(hours=9), 20,
                   name="MV SYNTHETIC ALPHA",
                   slow=(9.0, 11.0, 0.35),       # throttles to ~2.8 kn AT the node
                   gap=(9.5, 11.0), rng=rng)     # and goes dark for 90 min

    # --- hard decoys: each right in ONE way, wrong in another ---
    # right place, wrong time (12 h too early)
    rows += _track(316005678, node["lon"] - 0.9, node["lat"] - 0.5,
                   slick_bearing_deg, 11.0,
                   t_guilty - timedelta(hours=12), 14, name="MV DECOY TIME", rng=rng)
    # right time, wrong place (far off corridor)
    rows += _track(316009012, node["lon"] + 1.6, node["lat"] + 1.1,
                   40.0, 12.0, t_guilty - timedelta(hours=4), 14,
                   name="MV DECOY SPACE", rng=rng)
    # right place and time, but crossing the slick axis at ~90 deg
    rows += _track(316003456, node["lon"] - 0.3, node["lat"] + 0.4,
                   (slick_bearing_deg + 90) % 360, 9.0,
                   t_guilty - timedelta(hours=5), 14,
                   name="MV DECOY CROSS", rng=rng)

    for k in range(12):                              # ambient traffic
        rows += _track(
            316100000 + k,
            node["lon"] + rng.uniform(-2.5, 2.5),
            node["lat"] + rng.uniform(-2.0, 2.0),
            rng.uniform(0, 360), rng.uniform(6, 16),
            obs - timedelta(hours=rng.uniform(2, 70)), 12, rng=rng)
    return rows
```

**Why hard decoys matter:** if every wrong answer is obviously wrong, your
scoring is untested. `DECOY TIME` specifically checks that the corridor's *time*
dimension is doing work — flatten the corridor to a single point and that vessel
wrongly rises to the top.

---

## 3. The filter funnel — cheap and hard, before expensive and soft

```python
# app/attribution/funnel.py
import numpy as np
import pandas as pd
from datetime import timedelta
from pyproj import Geod

GEOD = Geod(ellps="WGS84")


def to_frame(rows):
    df = pd.DataFrame(rows)
    df["BaseDateTime"] = pd.to_datetime(df["BaseDateTime"], utc=True)
    return df.sort_values(["MMSI", "BaseDateTime"]).reset_index(drop=True)


def filter_temporal(df, observed_at, max_hours=72, pad_hours=3):
    """Stage 1: drop anything outside the lookback window. Cheap, decisive."""
    lo = observed_at - timedelta(hours=max_hours + pad_hours)
    return df[(df.BaseDateTime >= lo) & (df.BaseDateTime <= observed_at)].copy()


def _dist_km(lon1, lat1, lon2, lat2):
    lon1 = np.atleast_1d(lon1); lat1 = np.atleast_1d(lat1)
    _, _, d = GEOD.inv(lon1, lat1,
                       np.full_like(lon1, lon2), np.full_like(lat1, lat2))
    return d / 1000.0


def match_corridor(df, contract2, slack_km=6.0):
    """Stage 2: keep vessels matching a corridor node in BOTH space and time.

    This is the heart of attribution. For each node we look only at pings near
    that node's own hours_ago, then ask whether the vessel was inside its
    radius. A ship in the right place at the wrong lookback is rejected.
    """
    obs = contract2["observed_at"]
    if isinstance(obs, str):
        from app.common.timeutil import parse_iso_z
        obs = parse_iso_z(obs)

    best = {}
    for node in contract2["corridor"]:
        centre = obs - timedelta(hours=node["hours_ago"])
        half = timedelta(hours=2.5)
        win = df[(df.BaseDateTime >= centre - half) &
                 (df.BaseDateTime <= centre + half)]
        if win.empty:
            continue
        d = _dist_km(win["LON"].values, win["LAT"].values,
                     node["lon"], node["lat"])
        lim = node["radius_km"] + slack_km
        win = win.assign(_d=d, _dn=d / lim)          # _dn = normalised distance
        inside = win[win["_dn"] <= 1.0]
        for mmsi, grp in inside.groupby("MMSI"):
            row = grp.loc[grp["_dn"].idxmin()]
            cand = {
                "mmsi": int(mmsi),
                "hours_ago": node["hours_ago"],
                "distance_km": float(row["_d"]),
                "norm_distance": float(row["_dn"]),
                "radius_km": node["radius_km"],
                "cog": float(row["COG"]),
                "sog": float(row["SOG"]),
                "at": row["BaseDateTime"],
                "name": row.get("VesselName"),
            }
            # Compare NORMALISED distance, not raw km. Corridor radius grows with
            # hours_ago, so raw km would always prefer the newest node and the
            # older, wider part of the corridor could never win a match.
            if mmsi not in best or cand["norm_distance"] < best[mmsi]["norm_distance"]:
                best[mmsi] = cand
    return list(best.values())
```

Two details in there that will bite you if you rewrite it:

- **Use `win["_d"]`, not `win._d`.** Pandas attribute access to a column whose
  name starts with an underscore works by luck, not by contract — it collides
  with internals the moment someone picks a name pandas already uses. Bracket
  notation always means "column".
- **Match on normalised distance.** The corridor's radius grows with
  `hours_ago`, so ranking candidate nodes by raw kilometres silently makes the
  6-hour node win almost every time, and a vessel that genuinely fits a 30-hour
  discharge gets recorded at the wrong lookback. Your evidence string would then
  be confidently wrong about the one number a judge will ask about.

Filter first, score second. Filtering is cheap and defensible; scoring is
expensive and full of judgment calls.

---

## 4. Five-factor scoring — keep the factors unmerged

```python
# app/attribution/score.py
import numpy as np
import pandas as pd

# Judgment, not measurement. Documented here so it is auditable and tunable.
WEIGHTS = {
    "heading_alignment": 0.30,   # strongest physical signal
    "proximity":         0.25,
    "temporal":          0.20,
    "speed_anomaly":     0.15,
    "transponder_gap":   0.10,
}


def axis_alignment(cog_deg, slick_bearing_deg):
    """1.0 = vessel course parallel to the slick axis, 0.0 = perpendicular.

    A slick axis is UNDIRECTED, so fold into 0-90 deg. B1 gives bearing mod 180;
    a ship steaming 070 and one steaming 250 lie on the same axis.
    """
    d = abs((float(cog_deg) % 180.0) - (float(slick_bearing_deg) % 180.0))
    d = min(d, 180.0 - d)                     # -> 0..90
    return float(1.0 - d / 90.0)


def proximity(norm_distance):
    """1.0 at the corridor centre, 0.0 at the filter's own boundary.

    Takes the NORMALISED distance the funnel already computed, so the filter and
    the score share one definition of "too far". Defining the edge twice is how
    a vessel ends up passing the filter and then scoring a flat 0 here.
    """
    return float(np.clip(1.0 - float(norm_distance), 0.0, 1.0))


def temporal(hours_ago, max_hours=72.0):
    """Mild preference for recent origins: less drift, so less uncertainty."""
    return float(np.clip(1.0 - hours_ago / max_hours, 0.0, 1.0)) * 0.5 + 0.5


def speed_anomaly(track, at, window_h=3.0):
    """Slowing relative to the vessel's OWN median -- not a global threshold.

    Discharge often happens at reduced speed. Comparing a vessel to itself
    avoids penalising slow ship types.
    """
    if track.empty:
        return 0.0
    med = float(track.SOG.median())
    if med <= 0.5:
        return 0.0
    lo = at - pd.Timedelta(hours=window_h)
    hi = at + pd.Timedelta(hours=window_h)
    near = track[(track.BaseDateTime >= lo) & (track.BaseDateTime <= hi)]
    if near.empty:
        return 0.0
    drop = (med - float(near.SOG.min())) / med
    return float(np.clip(drop, 0.0, 1.0))


def transponder_gap(track, at, window_h=6.0, min_gap_min=25.0):
    """Score AIS silence around the candidate time. Going dark is a known tell."""
    if len(track) < 2:
        return 0.0
    lo = at - pd.Timedelta(hours=window_h)
    hi = at + pd.Timedelta(hours=window_h)
    near = track[(track.BaseDateTime >= lo) & (track.BaseDateTime <= hi)]
    if len(near) < 2:
        return 0.0
    gaps_min = near.BaseDateTime.diff().dt.total_seconds().dropna() / 60.0
    if gaps_min.empty:
        return 0.0
    worst = float(gaps_min.max())
    if worst < min_gap_min:
        return 0.0
    return float(np.clip((worst - min_gap_min) / 90.0, 0.0, 1.0))


def score_candidate(cand, track, slick_bearing_deg):
    f = {
        "heading_alignment": axis_alignment(cand["cog"], slick_bearing_deg),
        "proximity":         proximity(cand["norm_distance"]),
        "temporal":          temporal(cand["hours_ago"]),
        "speed_anomaly":     speed_anomaly(track, cand["at"]),
        "transponder_gap":   transponder_gap(track, cand["at"]),
    }
    total = sum(WEIGHTS[k] * v for k, v in f.items())
    return {
        "mmsi": cand["mmsi"],
        "name": cand.get("name"),
        "score": round(total, 4),
        "factors": {k: round(v, 4) for k, v in f.items()},
        "weights": WEIGHTS,
        "fits_hours_ago": cand["hours_ago"],
        "distance_km": round(cand["distance_km"], 2),
        "matched_at": cand["at"].isoformat().replace("+00:00", "Z"),
        "evidence": (f"fits a {cand['hours_ago']}h-old discharge, "
                     f"{cand['distance_km']:.1f} km from corridor centre"),
    }


```

Then the orchestrator. **This lives in `rank.py`, not `score.py`** — B2's
`scripts/run_chain.py` already imports `from app.attribution.rank import
rank_suspects`, so the name and path are fixed by an existing caller.

```python
# app/attribution/rank.py
from app.attribution.funnel import filter_temporal, match_corridor
from app.attribution.score import score_candidate
from app.common.timeutil import parse_iso_z


def rank_suspects(df, contract2, slick_bearing_deg, top_n=5):
    obs = contract2["observed_at"]
    obs = parse_iso_z(obs) if isinstance(obs, str) else obs

    windowed = filter_temporal(df, obs)
    cands = match_corridor(windowed, contract2)

    out = []
    for c in cands:
        track = windowed[windowed.MMSI == c["mmsi"]]
        out.append(score_candidate(c, track, slick_bearing_deg))
    out.sort(key=lambda r: r["score"], reverse=True)

    for i, r in enumerate(out, 1):
        r["rank"] = i
    return out[:top_n]
```

**Ship `factors` and `weights` in the response.** The breakdown *is* the product
— it lets frontend draw a bar per factor, and it lets an analyst disagree with
you intelligently. A bare score is a black box and loses the argument.

---

## 5. Two invariants to assert

```python
# tests/test_scoring.py
from app.attribution.score import axis_alignment


def test_axis_is_undirected():
    """070 and 250 are the same axis -- must score identically."""
    assert abs(axis_alignment(70, 70) - axis_alignment(250, 70)) < 1e-9
    assert axis_alignment(70, 70) == 1.0
    assert axis_alignment(160, 70) == 0.0          # perpendicular


def test_guilty_vessel_outranks_hard_decoys():
    """The scenario's guilty MMSI must come first, or scoring is not working."""
    # build corridor + synth scenario, run rank_suspects, assert rank 1
    ...
```

That second test is your regression guard. If a refactor breaks the corridor's
time dimension, `DECOY TIME` overtakes the guilty vessel and this catches it.

---

## 6. aisstream collector — start it, then ignore it

Verified free: sign in with GitHub, create a key. Limits are **3 open connections
per IP and 3 per account**; direct browser connections are disallowed, so connect
from your own process. Slow consumers get dropped, so keep the bounding box
tight.

```python
# scripts/ais_collector.py  -- run in the background all week
import asyncio, json, os, websockets, asyncpg

KEY = os.environ["AISSTREAM_KEY"]
BBOX = [[[8.0, 68.0], [23.0, 78.0]]]        # [[lat,lon],[lat,lon]] -- verify order!


async def main():
    pool = await asyncpg.create_pool(os.environ["PG_DSN"])
    async with websockets.connect("wss://stream.aisstream.io/v0/stream") as ws:
        await ws.send(json.dumps({
            "APIKey": KEY,
            "BoundingBoxes": BBOX,
            "FilterMessageTypes": ["PositionReport"],
        }))
        async for raw in ws:
            m = json.loads(raw)
            pr = m.get("Message", {}).get("PositionReport")
            if not pr:
                continue
            meta = m.get("MetaData", {})
            async with pool.acquire() as con:
                await con.execute(
                    """INSERT INTO ais_positions
                       (mmsi, ts, lat, lon, sog, cog, heading, name)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                       ON CONFLICT DO NOTHING""",
                    pr.get("UserID"), meta.get("time_utc"),
                    pr.get("Latitude"), pr.get("Longitude"),
                    pr.get("Sog"), pr.get("Cog"),
                    pr.get("TrueHeading"), (meta.get("ShipName") or "").strip())

asyncio.run(main())
```

```sql
CREATE TABLE IF NOT EXISTS ais_positions (
  mmsi BIGINT, ts TIMESTAMPTZ, lat DOUBLE PRECISION, lon DOUBLE PRECISION,
  sog REAL, cog REAL, heading REAL, name TEXT
);
CREATE INDEX IF NOT EXISTS ais_ts_idx   ON ais_positions (ts);
CREATE INDEX IF NOT EXISTS ais_mmsi_idx ON ais_positions (mmsi, ts);
```

⚠️ **Verify the bounding-box coordinate order against aisstream's docs before
trusting output.** I have not confirmed whether it is `[lat,lon]` or `[lon,lat]`,
and getting it wrong yields a silently empty stream.

**Do not let this eat sprint hours.** Its value is purely elapsed time — start it
day 1, check it Friday. **The demo uses synthetic AIS.**

⚠️ **Honest coverage limit:** AIS is VHF, so a shore station hears roughly 40–70
nautical miles. Crowdsourced networks are terrestrial, so **open-ocean coverage
is thin to absent** — exactly where deliberate discharge happens. Say this
plainly: demo near-coast on recorded data, and state that operational deployment
needs satellite AIS, which NTRO can source. A judge who knows maritime data will
test whether you understand this, and knowing it counts in your favour.

---

## 7. Demo cache duty

Venue wifi is shared and unreliable, and a 90-second wait is where a judge's
attention drains away.

```python
# scripts/build_cache.py
import json, pathlib
from app.ingest.pipeline import detect_scene
from app.drift.corridor import build_corridor
from app.attribution.synth import make_scenario
from app.attribution.funnel import to_frame
from app.attribution.rank import rank_suspects

CACHE = pathlib.Path("cache")

def build(scene_id, safe_path):
    d = CACHE / scene_id
    d.mkdir(parents=True, exist_ok=True)
    c1 = detect_scene(safe_path)
    c2 = build_corridor(c1)
    df = to_frame(make_scenario(c2, c1["orientation_deg"]))
    sus = rank_suspects(df, c2, c1["orientation_deg"])

    (d / "polygon.json").write_text(json.dumps(c1, indent=2))
    (d / "corridor.json").write_text(json.dumps(c2, indent=2))
    (d / "suspects.json").write_text(json.dumps(sus, indent=2))
    df.to_json(d / "ais.json", orient="records", date_format="iso")
    print(f"cached {scene_id}: {len(sus)} suspects, top={sus[0]['mmsi']}")
```

Cache **2–3 scenes** by day 6. Keep one live path on a small scene so you can
prove it isn't a video. `cache/` is gitignored — commit the script, not the
output.

---

## 8. Your week

| Day | Deliverable |
|---|---|
| 1 | Synthetic generator emitting NOAA-schema rows · collector running in background · PostGIS table |
| 2 | Filter funnel: temporal + corridor intersection against B2's mock Contract 2 |
| 3 | Five-factor scoring · ranked output · **published to frontend** · guilty-outranks-decoys test |
| 4 | **Integration only.** Verify the corridor contract matches B2's real output. |
| 5 | Tune weights on scripted scenarios. Add `transponder_gap` if it slipped. |
| 6 | **Build `cache/` for 2–3 scenes.** Freeze. |

---

## 9. Git

```bash
git switch -c be/b3/scoring-factors
git push -u origin be/b3/scoring-factors
```

```
feat(be/attribution): NOAA-schema synthetic AIS with hard decoys
feat(be/attribution): corridor intersection matching space AND time
fix(be/attribution): fold axis alignment to 0-90, slick axis is undirected
test(be/attribution): guilty vessel must outrank right-place-wrong-time decoy
```

**Reviewer:** B2 (you share Contract 2).

**Your special responsibilities:**

- **Never commit `cache/`, `*.json` dumps of AIS, or your aisstream key.** The
  key goes in `.env`, which is gitignored. A leaked key in git history is
  permanent — rotate it immediately if it happens.
- `WEIGHTS` lives in one dict, in one file. Never scatter magic numbers through
  the scoring functions; a judge may ask to see them, and tuning is easier.
- When you change a weight, say so in the commit body. Weight changes alter the
  ranking, and B2 or frontend may be looking at a stale screenshot.

---

## 10. Resources

**Verified this session**

- [aisstream.io](https://aisstream.io/) — free, GitHub sign-in for a key,
  WebSocket `wss://stream.aisstream.io/v0/stream`, typed JSON. 3 connections per
  IP / 3 per account, no browser connections, tight filters recommended.
- [AISHub](https://www.aishub.net/) — free but **reciprocal**: you must
  contribute your own receiver feed. 1,657 stations, 84 countries, ~102k
  vessels/24 h. Effectively closed to you without hardware.
- NOAA AIS archive — `coast.noaa.gov/htdata/CMSP/AISDataHandler/`, daily zips
  `AIS_YYYY_MM_DD.zip`, **110.4 GB for 2023**, ~300 MB/day. **US waters only.**
  Pull 2–3 days for the schema.

**Not verified — check yourself**

- aisstream bounding-box coordinate order and exact message field names
- Whether `PositionReport` alone is enough, or you also want `ShipStaticData`
  for vessel type and name

**Search terms:** "AIS message types 1 2 3 position report", "AIS dark vessel
detection gap analysis", "bilge dumping AIS satellite detection", "vessel
attribution oil spill AIS correlation".

Worth reading for framing: SkyTruth and Global Fishing Watch have published on
bilge-dumping detection from SAR plus AIS. That is the closest public prior art
to this PS, and citing it shows you know the field.

---

## 11. Failure modes

| Symptom | Likely cause |
|---|---|
| No candidates at all | corridor radius too tight, or AIS timestamps not UTC |
| Every vessel scores ~identically | weights too flat, or all factors saturating at 1.0 |
| `DECOY TIME` ranks first | corridor's time dimension not being used — check `match_corridor` windows by node |
| Heading score flips between runs | forgot mod 180; a course of 250 must equal 70 |
| Speed anomaly always 0 | comparing to a global threshold instead of the vessel's own median |
| Collector silent | bounding-box order wrong, or key not sent in the subscribe message |
| Ranking shifts on re-run | unseeded RNG in the synthetic generator — pass `rng_seed` |

---

## 12. Honesty rules — non-negotiable

- **Synthetic AIS validates pipeline logic and internal consistency only. It is
  not real-world ground truth.** Never describe it otherwise, in the UI, the
  deck, or answers to questions.
- **Ranked, never accused.** Top suspect at 0.87, second at 0.64. Presenting one
  certain culprit from probabilistic evidence is the fastest way to be taken
  apart in Q&A.
- **Weights are engineering judgment, not measured optima.** If asked, say so —
  and say that the per-factor breakdown exists precisely so a human analyst can
  overrule you.
- If asked for accuracy: there is no ground-truth dataset for spill attribution,
  so no accuracy figure exists. What you *can* report is rank-1 hit rate on
  scripted scenarios, clearly labelled as a self-consistency check.
