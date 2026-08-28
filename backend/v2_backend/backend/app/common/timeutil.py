"""
app/common/timeutil.py

OWNER: B1 — UTC discipline for the whole system (B1_INGEST.md §6).

Every timestamp anywhere in this codebase is UTC and timezone-aware. A naive
datetime is a bug. `utc()` raises on naive input deliberately: it converts
an invisible off-by-hours bug into a loud crash at the boundary, instead of
a hindcast that is silently wrong by several hours.

B2 and B3: always route incoming timestamps through `utc()` / `parse_iso_z()`
rather than parsing datetimes yourselves.
"""

from datetime import datetime, timezone


def utc(dt):
    """Force any datetime to timezone-aware UTC. Reject nothing silently."""
    if dt.tzinfo is None:
        raise ValueError(f"naive datetime not allowed: {dt!r}")
    return dt.astimezone(timezone.utc)


def iso_z(dt):
    return utc(dt).isoformat().replace("+00:00", "Z")


def parse_iso_z(s):
    return utc(datetime.fromisoformat(s.replace("Z", "+00:00")))
