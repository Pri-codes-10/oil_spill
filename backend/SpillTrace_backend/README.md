# SpillTrace Backend — PS 143

Backend-only scaffold based on the supplied B1, B2, B3 and WORKFLOW documents.

## Ownership

- **B1 — Ingest & Geospatial:** `app/ingest/`, `app/common/`, `app/routers/ingest.py`
- **B2 — Drift & Metocean + Integration:** `app/drift/`, `app/routers/drift.py`, `app/main.py`
- **B3 — AIS & Attribution + Demo Cache:** `app/attribution/`, `app/routers/attribution.py`, `cache/`

Shared files:
- `app/contracts.py` — freeze after day 1
- `app/config.py` — shared thresholds / paths / normalisation
- `requirements.txt` — append-only, alphabetical
- `mocks/` — agree once, then freeze

The backend owns the path from raw satellite product to ranked suspect list and the API.
ML remains outside this backend and is called through:
`predict(tile: ndarray[512, 512, 2]) -> ndarray[512, 512]`.

## Run

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload
```

Then open `/docs`.

## Demo chain without real satellite/AIS data

```bash
python scripts/run_chain.py
```

This uses:
1. a small synthetic Contract 1,
2. B2 analytic backward drift,
3. B3 synthetic AIS,
4. B3 filter + five-factor ranking.

It is deliberately designed so OpenDrift / real CMEMS / ERA5 / live AIS are not on the critical path.

## Git ownership

Use one branch per person:

```bash
git switch -c be/b1/parse-safe
git switch -c be/b2/rk4-backward
git switch -c be/b3/scoring-factors
```

Never commit `data/`, `cache/`, `.env`, Sentinel-1 products, NetCDF files, model weights, or AIS credentials.

## Important scientific honesty

Synthetic AIS is a pipeline/self-consistency test, not real-world ground truth.
Attribution is a ranked shortlist for a human investigator, not a verdict.
The five scoring weights are engineering judgment and must remain visible.
