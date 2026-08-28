"""
app/ingest/safe.py

OWNER: B1 (Ingest & Geospatial).

Parses a Sentinel-1 SAFE product FILENAME to recover acquisition time, mode,
polarisation and orbit — before opening a single byte of imagery
(B1_INGEST.md §1).
"""

import re
from datetime import datetime, timezone
from pathlib import Path

FNAME = re.compile(
    r"^(?P<mission>S1[ABCD])_(?P<mode>IW|EW|SM|WV)_(?P<ptype>GRD[HMF]?)_"
    r"(?P<pol>\w{4})_(?P<start>\d{8}T\d{6})_(?P<stop>\d{8}T\d{6})_"
    r"(?P<orbit>\d{6})_(?P<take>[0-9A-F]{6})_(?P<crc>[0-9A-F]{4})"
)


def parse_safe_name(path):
    """Pull mission, mode, polarisation, orbit and UTC times from the SAFE name.

    Sentinel-1 encodes all of this in the product filename, so we get the
    acquisition timestamp without opening a single byte of imagery.
    """
    stem = Path(path).name.replace(".SAFE", "").replace(".zip", "")
    m = FNAME.match(stem)
    if not m:
        raise ValueError(f"not a Sentinel-1 product name: {stem}")
    g = m.groupdict()

    def _t(s):
        return datetime.strptime(s, "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)

    return {
        "mission": g["mission"],
        "mode": g["mode"],
        "product": g["ptype"],
        "polarisation": g["pol"],
        "absolute_orbit": int(g["orbit"]),
        "start_time": _t(g["start"]),
        "stop_time": _t(g["stop"]),
    }
