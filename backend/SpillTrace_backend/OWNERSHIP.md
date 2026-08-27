# Backend Ownership Map

| Person | Owns | Main work |
|---|---|---|
| **B1** | `app/ingest/`, `app/common/`, `app/routers/ingest.py` | Sentinel-1 SAFE parsing, GCP georeferencing, tiling, fallback detector, polygon geometry, UTC helpers |
| **B2** | `app/drift/`, `app/routers/drift.py`, `app/main.py` | analytic field, RK4 backward integrator, ensemble corridor, CMEMS/ERA5 seam, API integration |
| **B3** | `app/attribution/`, `app/routers/attribution.py`, `cache/` | AIS schema/generator, filter funnel, five-factor scoring, ranking, demo cache |

## Shared / frozen

- `app/contracts.py`: agree on day 1; changes require affected-party approval.
- `app/config.py`: shared constants; do not silently change existing values.
- `requirements.txt`: append-only, alphabetical.
- `mocks/`: agree on the initial API shape, then freeze.
- `app/main.py`: B2 assembles routers on day 1; avoid unrelated edits afterward.

## Interface flow

`Sentinel-1 SAFE -> B1 Contract 1 -> B2 Contract 2 corridor -> B3 ranked suspects -> FastAPI -> frontend`

## Important boundaries

- B2 must consume B1's polygon + UTC timestamp.
- B3 must consume B2's **space-time corridor**, not a single point.
- AIS `SOG` is knots; do not feed raw knots into physics calculations.
- Slick orientation is modulo 180° because the axis is undirected.
- Attribution is a shortlist, not a guilt verdict.
