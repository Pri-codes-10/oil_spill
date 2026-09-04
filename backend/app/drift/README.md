# `app/drift/` — the drift stage

**Owner:** B2. Produces **Contract 2** (the space-time corridor) from
**Contract 1** (B1's detected slick polygon).

One sentence: seed particles across the whole detected slick, integrate them
*backwards* for up to 72 hours over an ensemble of plausible velocity fields,
and report where the ensemble was at each lookback hour plus how spread out it
had become.

The output is a **corridor of widening nodes, not a single origin point.** That
is the design, not a limitation — see [Why a corridor](#why-a-corridor-and-not-a-point).

---

## Inputs and outputs

**In** — Contract 1, validated by `app.contracts.validate_contract1`. Only two
fields are actually read by this stage:

| Field | Used for |
|---|---|
| `polygon` | seeding particles across the slick's real extent |
| `observed_at` | ISO-8601 UTC string ending in `Z`; anchors the whole lookback |

Everything else in Contract 1 is carried by the API layer, not consumed here.
(`orientation_deg` goes to B3 for heading scoring, not to drift.)

**Out** — Contract 2, validated by `app.contracts.validate_contract2`:

```json
{
  "observed_at": "2026-03-14T05:42:11Z",
  "corridor": [
    {"hours_ago": 6,  "lat": 18.47, "lon": 72.55, "radius_km": 4.78},
    {"hours_ago": 12, "lat": 18.55, "lon": 72.48, "radius_km": 5.70}
  ],
  "field_source": "analytic"
}
```

`radius_km` **must** grow with `hours_ago`. Both `validate_contract2` and
`scripts/run_chain.py` assert it.

---

## How to run

```bash
cd backend
source .venv/Scripts/activate      # Windows; use bin/activate elsewhere

# whole chain: ingest -> drift -> attribution
python scripts/run_chain.py

# drift stage alone, against the realistic mock polygon
python -c "
import json
from app.drift.corridor import build_corridor
c1 = json.load(open('mocks/polygon.json'))
print(json.dumps(build_corridor(c1), indent=2))"

# the tests that guard this stage
python -m pytest tests/test_drift_integrate.py tests/test_contracts.py -v
```

A corridor takes about **0.4 s** at 8 members x 300 particles x 72 h. This
stage is not a bottleneck; do not optimise it.

---

## Files

| File | What it does |
|---|---|
| `corridor.py` | the deliverable. Sweeps lookback, runs the ensemble, takes the spread, emits Contract 2. |
| `integrate.py` | RK4 backward integrator. No external deps, no OpenDrift API risk. |
| `seed.py` | rejection-samples particles uniformly inside the polygon. |
| `metocean.py` | **the seam.** Every velocity field resolves through here, so the label on Contract 2 cannot lie. |
| `field_analytic.py` | constant current + meridional shear + steady wind. Not physically real; it exists so the chain runs before CMEMS clears. |
| `field_real.py` | real reader: CMEMS `uo`/`vo` + ERA5 `u10`/`v10` off local cache files, via `scipy.RegularGridInterpolator`. |

Flow: `seed.py` → `metocean.py` (one field per member) → `integrate.py`
(backward RK4) → `corridor.py` (spread → nodes).

---

## The numbers, and where they come from

All in `app/config.py`. Change them there, never inline.

| Constant | Value | Why |
|---|---|---|
| `SAMPLE_HOURS` | 6, 12, 18, 24, 36, 48, 72 | the corridor nodes |
| `ENSEMBLE_MEMBERS` | 8 | enough spread to mean something, fast enough to iterate |
| `ENSEMBLE_PARTICLES` | 300 | per member, seeded across the polygon |
| `CORRIDOR_RADIUS_PERCENTILE` | 90 | **not max** — one stray particle must not inflate the uncertainty |
| `DIFFUSIVITY_M2_S` | 1.0 | turbulent diffusion; irreversible, so it only ever grows the cloud |
| `WIND_DRIFT_FACTOR_MIN/MAX` | 0.015 / 0.035 | perturbed per member. OpenDrift's own default is 0.02. |
| `MAX_LOOKBACK_HOURS` | 72 | matches `AIS_MAX_LOOKBACK_HOURS`, so B3 never receives a node it has no AIS for |

Reference outputs, for spotting a regression at a glance:

| Input | Corridor radii (km) |
|---|---|
| `detect_scene("synthetic")` — 0.27 km² slick | 1.8 → 18.6 |
| `mocks/polygon.json` — 12.4 km² slick | 4.78 → 22.8 |

The 6 h radius nearly triples between those two while the 72 h radius barely
moves. That is correct, not a bug: a bigger slick seeds a wider cloud
immediately, but by 72 h diffusion dominates and the initial extent stops
mattering.

---

## Why a corridor and not a point

Spreading has two parts.

**Advection** is deterministic and reversible — run the field backwards and
particles retrace their path exactly. `tests/test_drift_integrate.py` asserts
closure under 1 cm over a 79 km round trip.

**Turbulent diffusion** is stochastic and **not** reversible. Running backwards
adds more random walk; it never un-mixes.

So a backward run can never converge to a point, and any UI drawing one is
claiming precision we do not have. The honest output is a chain of widening
circles, where the growth *is* the uncertainty. A vessel must then match in
**both** position and time — that joint constraint is what separates "the
origin" from "a sighting."

---

## What's fragile

Ordered by how quietly it fails.

**1. `field_source` must never lie.** `cmems_era5` is now in `IMPLEMENTED`
(day-5 upgrade landed — see below), backed by `field_real.py`. Any *other*
unimplemented source must still raise `NotImplementedError` rather than
falling back to analytic silently. Do not add a name to `IMPLEMENTED` until a
reader for it has actually run against real data.

**2. All 8 members share identical seed positions.** `seed_in_polygon()` is
called *once*, outside the member loop, so ensemble spread comes only from field
perturbation and diffusion — not from seeding. That is defensible, since the
polygon extent is measured rather than uncertain, but it is a **choice** and the
day-2 plan's wording implies otherwise. Moving the call inside the loop will
grow every radius.

**3. The RNG draw order in `metocean.make_field()` is load-bearing.**
`tests/test_scoring.py` pins a seed and asserts the guilty vessel ranks first.
Reordering those three draws changes every downstream number even though the
physics is unchanged. Add new draws *after* the existing ones.

**4. Node matching assumes `dt` divides `SAMPLE_HOURS` evenly.** `corridor.py`
picks each node with `min(by_hour, key=lambda k: abs(k - h))` — the nearest
recorded step. At `dt_seconds=900` every sample hour lands on an exact step
(6 h = 24 steps, 72 h = 288), so "nearest" is currently "exact". Change `dt` to
something that does not divide evenly, or add a sample hour like 7, and nodes
begin silently reporting a neighbouring time.

**5. `radius_km` has a 1.0 km floor** (`max(radius_km, 1.0)`). Sensible against
absurd false precision, but it also means a completely broken ensemble — every
particle identical — still reports a plausible-looking 1.0 km instead of 0. If
several nodes read exactly 1.0, suspect the ensemble, not the ocean.

**6. `seed_in_polygon()` can silently return fewer particles than requested.**
Its guard is `guard < n * 200`; a pathological polygon (a sliver far thinner
than its bounding box) exhausts it and returns a short array with no warning,
which understates spread. Verified fine at 3.84% of bounding box; below roughly
0.5%, expect trouble.

**7. `mocks/corridor.json` is hand-written and is NOT derived from
`mocks/polygon.json`.** Its radii (4.2 / 8.1 / 17.6) differ from what that
polygon actually produces (4.78 / 5.70 / 8.57). Fine as a frontend fixture,
wrong as a test oracle — never assert real output against it.

**8. A real SAFE scene will fail upstream before reaching this stage.**
`app/ingest/reader.py` does `src.read(1)` with no `out_shape` — roughly 6.7 GB
peak once VV and VH are stacked for an IW GRDH product. `app/common/geo.py`
already has `scale_transform()` for a decimated read, but it was never wired in.
That is B1's file: tell them, do not patch it here.

---

## Day-5 upgrade path — landed

`"cmems_era5"` is now in `IMPLEMENTED`. `MetoceanProvider.describe()` returns
the mandatory attribution string ("Generated using E.U. Copernicus Marine
Service Information") for it — this must now show in the UI footer whenever
`field_source == "cmems_era5"`.

- **CMEMS** supplies currents (`uo`, `vo`), dataset
  `cmems_mod_glo_phy_anfc_merged-uv_PT1H-i` (hourly, so RK4's four sub-stage
  calls per step get genuine time interpolation, not nearest-hour snapping).
  No observed availability lag — confirmed fetchable up to the current day.
- **ERA5** supplies 10 m wind (`u10`, `v10`), which is what `wind_factor`
  multiplies, same as `AnalyticField`. **Has a real availability lag**,
  observed empirically at ~5 days behind "now". A request whose 72 h lookback
  falls inside that gap fails loudly (`RuntimeError` naming the constraint) —
  it does not fall back to analytic wind silently.
- **Fetch-ahead, not live-fetch.** `scripts/fetch_metocean.py
  mocks/polygon.json` downloads both sources into
  `data/metocean/<observed_at>_<bbox>/` before a request ever runs.
  `field_real.py` only opens those local files — a live CDS/CMEMS call takes
  10–90+ s, far too slow to block a synchronous
  `POST /api/drift/corridor`. Run the fetch script once per real scene before
  asking for `field_source="cmems_era5"`; a missing cache raises
  `FileNotFoundError` naming the fetch command to run.
- Interpolation is `scipy.interpolate.RegularGridInterpolator`, built once per
  field and reused across all RK4 sub-stage calls — not xarray's `.interp()`,
  which benchmarked two orders of magnitude too slow for this workload (~90 s
  vs ~1.8 s for a full ensemble). Confirmed value-identical to `.interp()` to
  1e-5. ERA5's latitude axis comes back descending; `field_real.py` flips it
  before building the interpolator, since `RegularGridInterpolator` requires
  strictly ascending axes.
- **OpenDrift** is still optional/unused. Backward runs are confirmed supported
  natively via a negative `time_step` (`docs/WORKFLOW.md` §8), but
  `integrate.py` remains the critical path — this upgrade did not need it.

The clock in `advect()` is now load-bearing for real: it advances per step and
walks backwards on a backward run, so `field_real.py` is asked for the right
hour at each RK4 sub-stage. Two spy-field tests guard that this wiring is
correct, because no numeric assertion can see it while `AnalyticField` ignored
its `when` argument.
