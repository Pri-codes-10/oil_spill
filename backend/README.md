# backend/

See the top-level `../README.md` for the day-1 quickstart, and `../docs/`
for the full design docs (`WORKFLOW.md`, `B1_INGEST.md`, `B2_DRIFT.md`,
`B3_ATTRIBUTION.md`) this code was built from.

Quick version:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python mocks/generate.py
python scripts/run_chain.py synthetic
pytest tests/ -v
uvicorn app.main:app --reload --port 8000
```

Ownership (one directory each, `WORKFLOW.md` §2-3):

| Person | Owns |
|---|---|
| **B1** | `app/ingest/`, `app/common/`, `app/routers/ingest.py`, `tests/test_roundtrip.py` |
| **B2** | `app/drift/`, `app/routers/drift.py`, `app/main.py`, `scripts/run_chain.py`, `tests/test_contracts.py` — **+ integration duty** |
| **B3** | `app/attribution/`, `app/routers/attribution.py`, `scripts/build_cache.py`, `scripts/ais_collector.py`, `tests/test_scoring.py` — **+ demo cache** |
| Shared | `app/config.py`, `app/contracts.py` (frozen after day 1), `requirements.txt`, `mocks/generate.py` |

Every file's docstring starts with an `OWNER:` line — when in doubt, open the
file.
