"""B1: Sentinel-1 SAFE filename parsing."""

import re
from datetime import datetime, timezone
from pathlib import Path

FNAME = re.compile(
    r"^(?P<mission>S1[ABCD])_(?P<mode>IW|EW|SM|WV)_(?P<ptype>GRD[HMF]?)_"
    r"(?P<pol>\w{4})_(?P<start>\d{8}T\d{6})_(?P<stop>\d{8}T\d{6})_"
    r"(?P<orbit>\d{6})_(?P<take>[0-9A-F]{6})_(?P<crc>[0-9A-F]{4})"
)


def parse_safe_name(path):
    """Extract acquisition metadata without opening the product."""
    stem = Path(path).name.replace(".SAFE", "").replace(".zip", "")
    match = FNAME.match(stem)
    if not match:
        raise ValueError(f"not a Sentinel-1 product name: {stem}")

    group = match.groupdict()

    def parse_time(value):
        return datetime.strptime(value, "%Y%m%dT%H%M%S").replace(
            tzinfo=timezone.utc
        )

    return {
        "mission": group["mission"],
        "mode": group["mode"],
        "product": group["ptype"],
        "polarisation": group["pol"],
        "absolute_orbit": int(group["orbit"]),
        "start_time": parse_time(group["start"]),
        "stop_time": parse_time(group["stop"]),
    }
