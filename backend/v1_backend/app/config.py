"""
Shared configuration.

B1, B2 and ML should import common constants from this file rather than
copying normalization/threshold values into their own folders.
"""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
CACHE_DIR = BASE_DIR / "cache"

# B1 detector defaults.
DETECTOR_THRESHOLD = 0.50
TILE_SIZE = 512
TILE_OVERLAP = 64
MIN_SLICK_PIXELS = 400

# B2 corridor defaults.
SAMPLE_HOURS = (6, 12, 18, 24, 36, 48, 72)
MAX_LOOKBACK_HOURS = 72
WIND_DRIFT_FACTOR_MIN = 0.015
WIND_DRIFT_FACTOR_MAX = 0.035

# B3 attribution defaults.
AIS_KNOT_TO_MPS = 0.514444
AIS_TIME_PAD_HOURS = 3
CORRIDOR_SLACK_KM = 6.0
TOP_SUSPECTS = 5
# app/config.py

MIN_SLICK_PIXELS = 400

# These are engineering judgments, not measured optimum weights.
ATTRIBUTION_WEIGHTS = {
    "heading_alignment": 0.30,
    "proximity": 0.25,
    "temporal": 0.20,
    "speed_anomaly": 0.15,
    "transponder_gap": 0.10,
}
