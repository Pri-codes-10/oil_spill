# B2 — Drift & Metocean  (+ integration duty)

**You own:** `app/drift/`, `app/routers/drift.py`, plus `main.py` assembly
**You consume:** Contract 1 from B1 (polygon + UTC timestamp)
**You produce:** Contract 2 — the space–time corridor
**Extra duty:** you are the integrator. Daily full-chain run is yours.

You have two jobs and they compete. **Integration wins.** A perfect drift model
in a chain that doesn't run is worth nothing; a crude drift model in a chain that
runs every day is a demo.

---

## ⚠️ Read this before writing any drift code

I told the team "OpenDrift supports backward runs via negative time steps." I
could **not verify that** — the tutorial documents `time_step` in seconds or a
`timedelta` and says nothing about sign. Treat it as unconfirmed.

**Day 1, first hour, settle it:**

```bash
pip install opendrift
python -c "import opendrift, inspect, pathlib; print(pathlib.Path(opendrift.__file__).parent)"
grep -rin "backward\|backtrack\|time_step *= *-\|steps_backward" \
     $(python -c "import opendrift,pathlib;print(pathlib.Path(opendrift.__file__).parent)")
```

Then read the `run()` signature directly:

```python
import inspect
from opendrift.models.oceandrift import OceanDrift
print(inspect.signature(OceanDrift.run))
print(inspect.getdoc(OceanDrift.run))
```

Report the answer in standup. It changes nothing downstream — because of the next
section — but knowing on day 1 beats discovering on day 4.

### The decision that de-risks your whole week

**Do not put OpenDrift on the critical path.** Write your own backward
integrator in numpy first. It is ~40 lines, has zero API risk, and produces a
valid Contract 2 on day 1. OpenDrift then becomes a *day-5 upgrade* that adds
weathering and proper turbulent diffusion — not a dependency that can sink you.

This is the same logic as B1's threshold detector: a dumb version that works
today beats a sophisticated one that might work Friday.

---

## 1. The physics, briefly

A particle at the sea surface moves with the current plus a fraction of the wind:

```
v_total = v_current + α · v_wind        α ≈ 0.02–0.035, with a small deflection
```

OpenDrift's own default convention is `wind_drift_factor = 0.02`, i.e. **2 % of
wind speed** — that is the figure to cite, verified from their tutorial.

To go **backward**, integrate `dx/dt = −v(x, t)` stepping time downward.

**What you cannot do:** un-diffuse. Spreading has a deterministic part
(advection, reversible) and a stochastic part (turbulent diffusion, *not*
reversible). Running backward will never contract the cloud to a point. So the
naive idea "integrate back until the particles converge" does not work —
nothing converges.

**What you do instead:** ensemble hindcasting. Run many backward realisations,
perturbing what you are genuinely uncertain about, and take the **spread of
endpoints** as your uncertainty. Spread grows with lookback: a 0.1 m/s current
error sustained 24 h is ≈ 8.6 km of positional error.

---

## 2. Analytic velocity field — your fallback

```python
# app/drift/field_analytic.py
import numpy as np


class AnalyticField:
    """Constant current + linear meridional shear + steady wind.

    Not physically real. It exists so the chain runs before CMEMS/ERA5 clear,
    and so Contract 2 has a shape on day 1. Always reported as
    field_source="analytic" so nobody mistakes it for measured data.
    """

    def __init__(self, u0=0.35, v0=0.10, shear=0.004,
                 wind_u=-4.0, wind_v=2.0, wind_factor=0.02):
        self.u0, self.v0, self.shear = u0, v0, shear
        self.wind_u, self.wind_v = wind_u, wind_v
        self.wind_factor = wind_factor

    def velocity(self, lon, lat, when=None):
        """Return (u, v) in m/s at given positions. Arrays in, arrays out."""
        lat = np.asarray(lat, dtype="float64")
        u = self.u0 + self.shear * (lat - lat.mean())
        v = np.full_like(lat, self.v0)
        u = u + self.wind_factor * self.wind_u
        v = v + self.wind_factor * self.wind_v
        return u, np.asarray(v, dtype="float64")
```

---

## 3. Backward integrator — RK4, no external deps

```python
# app/drift/integrate.py
import numpy as np

M_PER_DEG_LAT = 111_320.0


def _to_deg(u, v, lat):
    """m/s -> deg/s. Longitude degrees shrink with cos(latitude)."""
    dlat = v / M_PER_DEG_LAT
    dlon = u / (M_PER_DEG_LAT * np.cos(np.radians(lat)))
    return dlon, dlat


def step_rk4(field, lon, lat, when, dt, backward=True):
    """One Runge-Kutta 4 step. dt in seconds. backward negates the field."""
    s = -1.0 if backward else 1.0

    def f(lo, la):
        u, v = field.velocity(lo, la, when)
        dlon, dlat = _to_deg(s * u, s * v, la)
        return dlon, dlat

    k1x, k1y = f(lon, lat)
    k2x, k2y = f(lon + 0.5 * dt * k1x, lat + 0.5 * dt * k1y)
    k3x, k3y = f(lon + 0.5 * dt * k2x, lat + 0.5 * dt * k2y)
    k4x, k4y = f(lon + dt * k3x, lat + dt * k3y)

    lon = lon + (dt / 6.0) * (k1x + 2 * k2x + 2 * k3x + k4x)
    lat = lat + (dt / 6.0) * (k1y + 2 * k2y + 2 * k3y + k4y)
    return lon, lat


def advect(field, lon, lat, start_time, hours, dt_seconds=900,
           backward=True, diffusivity=0.0, rng=None):
    """Integrate a particle cloud for `hours`, sampling the path.

    Returns list of (hours_elapsed, lon_array, lat_array).
    diffusivity (m^2/s) adds a random walk -- use it to widen the ensemble, and
    remember it is NOT reversible, so it only ever grows the cloud.
    """
    rng = rng or np.random.default_rng(0)
    lon = np.asarray(lon, dtype="float64").copy()
    lat = np.asarray(lat, dtype="float64").copy()
    n_steps = int(hours * 3600 / dt_seconds)
    track = [(0.0, lon.copy(), lat.copy())]

    for i in range(1, n_steps + 1):
        lon, lat = step_rk4(field, lon, lat, start_time, dt_seconds, backward)
        if diffusivity > 0:
            sigma_m = np.sqrt(2.0 * diffusivity * dt_seconds)
            lat = lat + rng.normal(0, sigma_m / M_PER_DEG_LAT, lat.shape)
            lon = lon + rng.normal(
                0, sigma_m / (M_PER_DEG_LAT * np.cos(np.radians(lat))), lon.shape)
        track.append((i * dt_seconds / 3600.0, lon.copy(), lat.copy()))
    return track
```

Use **RK4, not Euler**. Euler's error accumulates badly over a 72-hour
integration, and this costs you nothing.

---

## 4. Seeding from B1's polygon

Seed across the **whole polygon**, not just the centroid. The slick's extent is
information.

```python
# app/drift/seed.py
import numpy as np
from shapely.geometry import Polygon, Point


def seed_in_polygon(coords, n=500, rng=None):
    """Rejection-sample n points uniformly inside a lon/lat polygon."""
    rng = rng or np.random.default_rng(0)
    poly = Polygon(coords[0] if isinstance(coords[0][0], (list, tuple)) else coords)
    minx, miny, maxx, maxy = poly.bounds
    lons, lats = [], []
    guard = 0
    while len(lons) < n and guard < n * 200:
        x = rng.uniform(minx, maxx, 256)
        y = rng.uniform(miny, maxy, 256)
        for xi, yi in zip(x, y):
            if poly.contains(Point(xi, yi)):
                lons.append(xi)
                lats.append(yi)
                if len(lons) >= n:
                    break
        guard += 256
    return np.array(lons), np.array(lats)
```

⚠️ **If you later use OpenDrift's `seed_elements(..., radius=)`:** their docs are
explicit that radius is **one standard deviation** of a normal distribution, so
only ~68 % of particles land inside it and they cluster toward the centre. Report
that radius as your uncertainty and you understate it badly.

---

## 5. Ensemble → corridor  (Contract 2)

This is your actual deliverable. Sweep lookback, perturb the uncertain
parameters, take the spread.

```python
# app/drift/corridor.py
import numpy as np
from pyproj import Geod
from app.drift.field_analytic import AnalyticField
from app.drift.integrate import advect
from app.drift.seed import seed_in_polygon

GEOD = Geod(ellps="WGS84")
SAMPLE_HOURS = (6, 12, 18, 24, 36, 48, 72)


def build_corridor(contract1, field_source="analytic", n_members=8,
                   n_particles=300, max_hours=72, rng_seed=0):
    """Backward ensemble -> list of (hours_ago, lat, lon, radius_km) nodes."""
    rng = np.random.default_rng(rng_seed)
    lon0, lat0 = seed_in_polygon(contract1["polygon"], n=n_particles, rng=rng)

    per_hour = {h: {"lon": [], "lat": []} for h in SAMPLE_HOURS}

    for m in range(n_members):
        # perturb exactly what we are genuinely unsure about
        field = AnalyticField(
            u0=0.35 * rng.normal(1.0, 0.20),
            v0=0.10 * rng.normal(1.0, 0.30),
            wind_factor=rng.uniform(0.015, 0.035),   # 1.5-3.5 %
        )
        track = advect(field, lon0, lat0, contract1["observed_at"],
                       hours=max_hours, backward=True,
                       diffusivity=1.0, rng=rng)
        by_hour = {round(h, 3): (lo, la) for h, lo, la in track}
        for h in SAMPLE_HOURS:
            key = min(by_hour, key=lambda k: abs(k - h))
            lo, la = by_hour[key]
            per_hour[h]["lon"].append(lo)
            per_hour[h]["lat"].append(la)

    nodes = []
    for h in SAMPLE_HOURS:
        lo = np.concatenate(per_hour[h]["lon"])
        la = np.concatenate(per_hour[h]["lat"])
        clon, clat = float(lo.mean()), float(la.mean())
        # radius = 90th percentile geodesic distance from the ensemble centre
        _, _, dist_m = GEOD.inv(np.full_like(lo, clon), np.full_like(la, clat), lo, la)
        radius_km = float(np.percentile(dist_m, 90) / 1000.0)
        nodes.append({
            "hours_ago": h,
            "lat": round(clat, 5),
            "lon": round(clon, 5),
            "radius_km": round(max(radius_km, 1.0), 2),
        })

    return {
        "observed_at": contract1["observed_at"],
        "corridor": nodes,
        "field_source": field_source,
    }
```

**Use the 90th percentile, not the max.** One stray particle should not inflate
your uncertainty. State which statistic you used — a judge may ask, and "90th
percentile of ensemble spread" is a real answer.

**Sanity check:** `radius_km` must increase monotonically with `hours_ago`. If it
doesn't, your ensemble is too small or the perturbations are too narrow.

---

## 6. Why a corridor, not a point

The corridor is the best idea in the design. Do not flatten it.

A vessel must match in **both** space and time. A ship that crossed the right
area 12 hours ago is **excluded** if the drift says the oil needed 30 hours to
reach where it was seen. Right place, wrong time. That joint constraint is far
tighter than either alone, and it is exactly what separates *the origin* from
*the sighting*.

If you hand B3 a single origin point, you throw that away and the whole pitch
weakens to "we found oil near some ships."

---

## 7. Upgrading to OpenDrift (day 5, optional)

Two features map onto this problem unusually well, both confirmed from their
tutorial:

- **`seed_from_gml`** seeds particles inside satellite-detected slick contours.
  That is Contract 1 as a library call.
- **`seed_cone`** takes two lon/lat points and, given two datetimes, spreads the
  release **linearly over that interval** — a vessel discharging while steaming.
  Exactly the geometry of a deliberate dump.

Config lines worth knowing:

```python
o.set_config('seed:wind_drift_factor', 0.02)   # 2 % of wind speed
o.set_config('drift:advection_scheme', 'runge-kutta')
```

Readers: **wind and current are mandatory** (no fallback). Waves, Stokes drift,
salinity, temperature and `ocean_vertical_diffusivity` (fallback 0.02) are
optional — so CMEMS currents + ERA5 winds is a legitimate minimum.

OpenOil also gives you weathering: `water_content`, elements deactivating as
`evaporated`, and `plot_oil_budget()`. That is the route to the PS's "age if
feasible" — but it is finale work, not this week.

---

## 8. Metocean data — register on day 1

Approval and licence acceptance have lead time you cannot compress later.

**CMEMS — verified free.** Their licence page states it is *"granted free of
charge"*, a *"worldwide, non exclusive, royalty free, perpetual licence"*, funded
through **30 June 2028**.

⚠️ **Attribution is mandatory and it is your job to capture it:** the required
credit is *"Generated using E.U. Copernicus Marine Service Information"* plus
**product DOIs**, visible where the data is accessed. Record the DOI at download
time — retrofitting it later is annoying. Hand the string to frontend for the
dashboard footer.

**ERA5 — unverified.** I could not confirm licensing; the CDS domain was
unreachable from here. Check the Terms tab at
`cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels`. Low
exposure: OpenDrift reads wind from several sources, so NOAA GFS is a config
swap, not a redesign.

**Pick a demo scene older than ~3 months.** Final ERA5 replaces the preliminary
ERA5T after roughly two months (ERA5T itself runs ~5 days behind real time).
Using final ERA5 sidesteps the ERA5T question entirely and is better science.

---

## 9. Integration duty

This is the part nobody else can cover for you.

### Day 1: `main.py`, then freeze it

```python
# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import ingest, drift, attribution

app = FastAPI(title="SpillTrace API")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"],       # demo only
    allow_methods=["*"], allow_headers=["*"],
)
app.include_router(ingest.router, prefix="/api")
app.include_router(drift.router, prefix="/api")
app.include_router(attribution.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"ok": True}
```

Register all three routers on day 1 **even though two are empty stubs**. Then
nobody touches this file again, and nobody ever merge-conflicts on it.

### Publish mocks by lunch on day 1

Two frontend people are blocked until they have JSON. This is the most
time-critical thing backend does all week.

```python
# mocks/generate.py  -- run once, commit the JSON, tell frontend the paths
import json, pathlib
from datetime import datetime, timezone

OBS = datetime(2026, 3, 14, 5, 42, 11, tzinfo=timezone.utc)

polygon = {
    "observed_at": OBS.isoformat().replace("+00:00", "Z"),
    "crs": "EPSG:4326",
    "polygon": [[[72.60, 18.40], [72.66, 18.46], [72.70, 18.45],
                 [72.64, 18.39], [72.60, 18.40]]],
    "area_km2": 12.4, "major_axis_km": 8.1, "minor_axis_km": 1.9,
    "orientation_deg": 70.2, "centroid": [72.65, 18.43],
    "confidence": 0.87, "detector": "threshold",
}
corridor = {
    "observed_at": polygon["observed_at"],
    "corridor": [
        {"hours_ago": 6,  "lat": 18.47, "lon": 72.55, "radius_km": 4.2},
        {"hours_ago": 12, "lat": 18.55, "lon": 72.48, "radius_km": 8.1},
        {"hours_ago": 24, "lat": 18.79, "lon": 72.19, "radius_km": 17.6},
    ],
    "field_source": "analytic",
}
out = pathlib.Path(__file__).parent
for name, obj in [("polygon", polygon), ("corridor", corridor)]:
    (out / f"{name}.json").write_text(json.dumps(obj, indent=2))
```

### Daily chain runner

```python
# scripts/run_chain.py  -- you run this every day and report in standup
import sys, json, time
from app.ingest.pipeline import detect_scene       # B1
from app.drift.corridor import build_corridor      # you
from app.attribution.rank import rank_suspects     # B3
from app.attribution.synth import make_scenario    # B3
from app.attribution.funnel import to_frame        # B3

def main(scene):
    t0 = time.time()
    c1 = detect_scene(scene)
    print(f"[1] polygon  area={c1['area_km2']} km2  bearing={c1['orientation_deg']}")
    c2 = build_corridor(c1)
    radii = [n["radius_km"] for n in c2["corridor"]]
    assert radii == sorted(radii), f"radius must grow with lookback: {radii}"
    print(f"[2] corridor nodes={len(c2['corridor'])} src={c2['field_source']}")
    # Attribution needs three things, not just the corridor: the AIS frame, the
    # corridor, and the slick axis bearing from Contract 1. You thread them --
    # that is what integration duty means in practice.
    ais = to_frame(make_scenario(c2, c1["orientation_deg"]))
    sus = rank_suspects(ais, c2, c1["orientation_deg"])
    print(f"[3] suspects={len(sus)} top={sus[0]['mmsi'] if sus else None}")
    print(f"OK in {time.time()-t0:.1f}s")

if __name__ == "__main__":
    main(sys.argv[1])
```

That `assert` is a real bug-catcher — non-monotonic radii means the ensemble is
broken, and it is easy to miss by eye.

**In standup you demonstrate, not describe.** Run the script. Three questions:
does the chain run, what is still a mock, what broke since yesterday.

---

## 10. Your week

| Day | Deliverable |
|---|---|
| 1 | `main.py` + 3 routers + **mocks published by lunch** · CMEMS/ERA5 registration · OpenDrift backward-API answer · analytic field |
| 2 | RK4 backward integrator · polygon seeding · corridor from B1's real Contract 1 |
| 3 | Ensemble spread → radii · **Contract 2 published to B3** · monotonicity assert |
| 4 | **Integration only.** Chain runs 3× identically. Fix what standup surfaced. |
| 5 | Real CMEMS/ERA5 if cleared, else stay analytic and label it. Forward run if time. |
| 6 | Help B3 precompute `cache/`. Freeze. |

---

## 11. Git

```bash
git switch -c be/b2/rk4-backward
git push -u origin be/b2/rk4-backward
```

Prefixes: `feat(be/drift):`, `fix(be/drift):`, `chore(be):` for `main.py` and
deps.

```
feat(be/drift): RK4 backward integrator with lon/lat metric conversion
feat(be/drift): ensemble corridor with 90th-percentile spread radius
chore(be): register ingest/drift/attribution routers, freeze main.py
```

**Reviewers:** B1 reviews your Contract 1 consumption; B3 reviews Contract 2.

**Your special responsibilities:**

- `contracts.py` is **frozen after day 1**. You are the gatekeeper — a change
  needs a dedicated PR plus approval from both affected parties, never a quiet
  edit inside a feature branch.
- `requirements.txt` is **append-only, alphabetical, one per line, pinned**. That
  formatting is what lets git auto-merge instead of conflicting when three people
  add deps the same day.
- Never commit `*.nc`. CMEMS and ERA5 NetCDF files are large; they belong in
  `data/`, which is gitignored.

---

## 12. Resources

**Verified this session**

- [OpenDrift](https://api.github.com/repos/OpenDrift/opendrift) — GPL-2.0, 316
  stars, "Open source framework for ocean trajectory modelling". No API key, it
  is a pip library.
- [OpenDrift tutorial](https://opendrift.github.io/tutorial.html) — `run()`
  params, `seed_elements` (radius = 1 σ), `seed_cone`, `seed_from_gml`,
  `wind_drift_factor` default 0.02, runge-kutta option, OpenOil required
  variables and fallbacks.
- [CMEMS licence](https://marine.copernicus.eu/user-corner/service-commitments-and-licence)
  — free of charge, funded to 30 June 2028, attribution mandatory.

**Not verified — check yourself**

- OpenDrift **backward-run mechanism** (see §0)
- ERA5 licensing at `cds.climate.copernicus.eu`
- `copernicusmarine` Python client for CMEMS subsetting

**Search terms:** "OpenDrift backward simulation", "OpenOil wind drift factor",
"Lagrangian backtracking oil spill origin", "oil spill source inversion",
"copernicusmarine subset python".

---

## 13. Failure modes

| Symptom | Likely cause |
|---|---|
| Particles barely move | forgot m/s → deg/s conversion, or dt too small |
| Longitude drifts wrong near high latitude | missing `cos(lat)` in the lon conversion |
| Radii not monotonic | ensemble too small, or perturbations too narrow |
| Corridor runs the wrong way | sign error — backward means `-v`; sanity-check that it moves *upwind* |
| Uncertainty implausibly tiny | reported a 1 σ radius as if it were full coverage |
| Hindcast off by hours | naive datetime — always route through B1's `utc()` |

**Sharpest sanity check:** run **forward** from your computed origin and confirm
you land back on B1's observed polygon. If forward-from-origin doesn't reproduce
the observation, your backward run is wrong. That round-trip is also your
validation story for judges — and on a documented spill with a published source,
it is genuine evidence the model works.
