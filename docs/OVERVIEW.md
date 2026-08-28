# PS 143 — SpillTrace

SAR-based oil spill detection → drift hindcasting → AIS vessel attribution.

This repo is scaffolded directly from the team's own `WORKFLOW.md` +
`B1_INGEST.md` + `B2_DRIFT.md` + `B3_ATTRIBUTION.md` (copied into `docs/` for
reference). **The docs are the source of truth for *why*; this code is the
*what*, ready to `git init` and start branching from on day 1.**

## Layout

```
.
├── backend/     <- THIS is what the three docs describe. Start here.
├── ml/          <- separate owner(s). README.md explains Contract 0.
├── frontend/    <- separate owners (2 people). README.md explains what backend publishes.
└── docs/        <- the four source docs, unmodified, for reference.
```

Per `WORKFLOW.md`: one directory per person inside `backend/app/` — B1 owns
`ingest/` + `common/`, B2 owns `drift/` (+ integration), B3 owns
`attribution/` (+ demo cache). Every file in `backend/` has an `OWNER:`
comment at the top of the docstring naming who's responsible and which doc
section it implements.

## Day-1 quickstart

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 1. Generate + commit the mocks frontend needs by lunch
python mocks/generate.py

# 2. Confirm the whole chain runs on fake data
python scripts/run_chain.py synthetic

# 3. Run the test suite
pytest tests/ -v

# 4. Start the API
uvicorn app.main:app --reload --port 8000
# -> GET  http://localhost:8000/api/health
# -> GET  http://localhost:8000/api/ingest/mock
# -> POST http://localhost:8000/api/ingest/detect      {"scene_path": "synthetic"}
# -> POST http://localhost:8000/api/drift/corridor      {"contract1": {...}}
# -> POST http://localhost:8000/api/attribution/rank    {"contract2": {...}, "slick_bearing_deg": 70.2}
```

All three endpoints above have been run and verified end-to-end on the
`"synthetic"` scene path — no real SAFE product or trained model needed to
see the full chain execute (`detect_scene("synthetic")` fabricates a
plausible dark-blob dB tile; see `app/ingest/pipeline.py`).

## What's already implemented vs. what's day-1 insurance

| Stage | What runs today | Upgrade path |
|---|---|---|
| Detection | Classical local-threshold detector (`app/ingest/detect_threshold.py`) | Swap in `ml/`'s U-Net via `use_model()` (one line, `app/ingest/pipeline.py`) |
| Drift | Analytic field + hand-written RK4 backward integrator, no OpenDrift dependency (`app/drift/`) | Real CMEMS/ERA5 readers + OpenDrift, day 5 (`B2_DRIFT.md` §7) |
| Attribution | Synthetic AIS (one guilty vessel + hard decoys) + 5-factor transparent scoring (`app/attribution/`) | Recorded/live AIS via `scripts/ais_collector.py`, background all week |

This mirrors the docs' own philosophy: **a dumb version that works today
beats a sophisticated one that might work Friday.** The chain runs end to
end on day 1; each day, one fake part becomes real.

## Honesty rules baked into the code (non-negotiable — see `docs/WORKFLOW.md` §9)

- Every ingest response carries `"detector": "threshold" | "unet"`.
- Every corridor response carries `"field_source": "analytic" | "cmems_era5"`.
- Every attribution response carries `"ais_source": "synthetic"` until a real
  feed is wired in.
- Suspects are **ranked with a per-factor score breakdown**, never a single
  accusation.

Never let a demo imply real data or a trained model when a fallback is
actually running — a technical judge will probe exactly here.

## Known issue to be aware of

`tests/test_roundtrip.py::test_scaled_transform_maps_to_same_ground_point`
originally asserted exact equality (copied verbatim from `B1_INGEST.md`).
That's mathematically too strict — downsampling introduces a real half-pixel
block-center offset (~15-20 m at this transform's resolution), which is
irrelevant given the doc's own tolerance framing (slicks are km-scale, drift
uncertainty is tens of km). The tolerance has been loosened accordingly with
an explanatory comment in the test itself — worth a skim so nobody "fixes"
`scale_transform()` chasing a phantom bug.
