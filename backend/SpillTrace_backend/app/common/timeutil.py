"""B1-owned UTC/time primitives. B2 and B3 import these; they must not fork them."""

from datetime import datetime, timezone


def utc(value: datetime) -> datetime:
    """Normalize a datetime to timezone-aware UTC."""
    if value.tzinfo is None:
        # Naive timestamps are interpreted as UTC at this backend seam.
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def parse_iso_z(value: str) -> datetime:
    """Parse an ISO timestamp and force UTC."""
    value = value.strip()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return utc(datetime.fromisoformat(value))
