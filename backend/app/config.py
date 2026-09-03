"""
app/config.py

OWNER: shared file — anyone may ADD a key; changing an EXISTING value needs a
heads-up in chat first, because the ml/ folder imports this too (WORKFLOW.md
§4.5). This is what keeps training-time and serving-time preprocessing
identical — skew here is the "works in the notebook, dies in the API" bug.

Keep every tunable number here rather than hardcoded inside a function, so a
judge asking "why 400 pixels?" gets an answer you can point to.
"""

# ---------------------------------------------------------------------------
# Ingest / detection  (B1 — app/ingest/)
# ---------------------------------------------------------------------------

# Sliding-window tiling (app/ingest/tiling.py)
TILE_SIZE = 512
TILE_OVERLAP = 64
INGEST_MAX_DIMENSION = 4096

# Threshold fallback detector (app/ingest/detect_threshold.py)
THRESHOLD_BLOCK_SIZE = 201       # local-threshold neighbourhood, px (must be odd)
THRESHOLD_OFFSET = 2.0           # dB below local mean to call a pixel "dark"
THRESHOLD_MIN_PIXELS = 400       # smaller connected components are speckle, not a slick
THRESHOLD_CONTRAST_SCALE = 6.0   # divisor mapping dB contrast -> pseudo-probability

# Mask -> polygon (app/ingest/geometry.py)
POLYGON_PROB_THRESHOLD = 0.5     # probability cutoff before vectorising

# dB normalisation — ML and the threshold detector must agree on this range,
# or the model that looked great in the training notebook silently degrades
# once it sees API-preprocessed tiles (see B1_INGEST.md §1 calibration note).
SAR_DB_MIN = -30.0
SAR_DB_MAX = 5.0

# ---------------------------------------------------------------------------
# Drift  (B2 — app/drift/)
# ---------------------------------------------------------------------------

WIND_DRIFT_FACTOR = 0.02         # OpenDrift's own default: 2% of wind speed
# Ensemble perturbation range for the wind drift factor. The literature does
# not agree on one value, so we sample a plausible band instead of pretending
# to know it -- this is a genuine source of corridor width.
WIND_DRIFT_FACTOR_MIN = 0.015
WIND_DRIFT_FACTOR_MAX = 0.035
MAX_LOOKBACK_HOURS = 72
SAMPLE_HOURS = (6, 12, 18, 24, 36, 48, 72)   # corridor nodes (B2_DRIFT.md §5)
ENSEMBLE_MEMBERS = 8
ENSEMBLE_PARTICLES = 300
CORRIDOR_RADIUS_PERCENTILE = 90  # NOT max — one stray particle shouldn't inflate uncertainty
DIFFUSIVITY_M2_S = 1.0           # turbulent diffusion added to the ensemble (irreversible)

# ---------------------------------------------------------------------------
# Attribution  (B3 — app/attribution/)
# ---------------------------------------------------------------------------

CORRIDOR_MATCH_SLACK_KM = 6.0    # extra tolerance added to a node's radius_km
CORRIDOR_MATCH_HALF_WINDOW_HOURS = 2.5
AIS_MAX_LOOKBACK_HOURS = 72
AIS_LOOKBACK_PAD_HOURS = 3

# NOTE: the 5-factor scoring WEIGHTS dict deliberately lives in
# app/attribution/score.py, not here — B3 owns it exclusively and it changes
# often during tuning (B3_ATTRIBUTION.md §4, §9 "Your special responsibilities").

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

MOCKS_DIR = "mocks"
CACHE_DIR = "cache"
