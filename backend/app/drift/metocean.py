"""
app/drift/metocean.py

OWNER: B2 (Drift & Metocean) — exclusive, per WORKFLOW.md §3.

THE METOCEAN SEAM. Every velocity field the corridor uses is resolved through
this file, for one reason: it is the only place that can guarantee the label on
Contract 2 matches the data that actually produced it.

Before this existed, build_corridor() echoed its `field_source` argument
straight into its output while AnalyticField was hardcoded below it. Asking for
"cmems_era5" with no reader wired returned a corridor LABELLED as real ocean
data, silently. That is precisely the failure WORKFLOW.md §9 forbids:

    "Never let the demo imply real ocean data when the fallback is running."

So the rule here is: an unimplemented source RAISES. It never degrades quietly
into the analytic field wearing a real source's name. A caller that wants a
fallback must ask for one explicitly and will get it labelled "analytic".
"""

from pathlib import Path

from app.config import (
    WIND_DRIFT_FACTOR_MIN, WIND_DRIFT_FACTOR_MAX, METOCEAN_CACHE_DIR,
    METOCEAN_BBOX_PAD_DEG,
)
from app.drift.field_analytic import AnalyticField
from app.drift.field_real import RealField

# Sources this file can actually produce today. Add to this set only when a
# reader exists and has been run against real data -- not when it is stubbed.
IMPLEMENTED = {"analytic", "cmems_era5"}

# Sources that are recognised but deliberately not wired yet (day-5 upgrade).
PLANNED = set()


def _bbox_from_polygon(polygon, pad_deg=METOCEAN_BBOX_PAD_DEG):
    """Must match scripts/fetch_metocean.py's _bbox_from_polygon exactly --
    this is how a cache dir written by that script gets found again here."""
    rings = polygon[0] if isinstance(polygon[0][0], (list, tuple)) else polygon
    lons = [pt[0] for pt in rings]
    lats = [pt[1] for pt in rings]
    return (min(lons) - pad_deg, max(lons) + pad_deg,
            min(lats) - pad_deg, max(lats) + pad_deg)


def _cache_dir_for(contract1):
    """Must match scripts/fetch_metocean.py's _cache_key exactly."""
    observed_at = contract1["observed_at"].replace(":", "").replace("-", "")
    min_lon, max_lon, min_lat, max_lat = _bbox_from_polygon(contract1["polygon"])
    key = f"{observed_at}_{min_lon:.2f}_{max_lon:.2f}_{min_lat:.2f}_{max_lat:.2f}"
    return Path(__file__).resolve().parents[2] / METOCEAN_CACHE_DIR / key


class MetoceanProvider:
    """Resolves a field_source name into perturbed velocity fields.

    Usage in an ensemble loop:

        provider = MetoceanProvider("analytic")
        for _ in range(n_members):
            field = provider.make_field(rng)      # perturbed per member
        ...
        contract2["field_source"] = provider.source   # the HONEST label

    contract1 is required when source="cmems_era5" -- it is how this file
    finds the cache dir scripts/fetch_metocean.py wrote for this scene.
    """

    def __init__(self, source="analytic", contract1=None):
        if source in PLANNED and source not in IMPLEMENTED:
            raise NotImplementedError(
                f"field_source={source!r} is a planned day-5 upgrade, not yet "
                f"wired. Implement a reader behind MetoceanProvider first. "
                f"Do NOT relabel analytic output as {source!r} -- see "
                f"WORKFLOW.md §9."
            )
        if source not in IMPLEMENTED:
            raise ValueError(
                f"unknown field_source={source!r}; implemented: "
                f"{sorted(IMPLEMENTED)}, planned: {sorted(PLANNED)}"
            )
        if source == "cmems_era5" and contract1 is None:
            raise ValueError(
                "field_source='cmems_era5' needs contract1 to locate its "
                "metocean cache dir -- pass it to MetoceanProvider(...)"
            )
        self.source = source
        self._cache_dir = _cache_dir_for(contract1) if source == "cmems_era5" else None

    def make_field(self, rng):
        """One ensemble member's field, with genuinely-uncertain params perturbed.

        The RNG draw ORDER is load-bearing: tests pin a seed and assert the
        guilty vessel ranks first. Reordering these three draws changes every
        downstream number even though the physics is unchanged.
        """
        if self.source == "cmems_era5":
            # The current itself is real data, not a guess -- only wind_factor
            # is genuinely uncertain here, so only it is perturbed per member.
            return RealField(
                self._cache_dir,
                wind_factor=rng.uniform(WIND_DRIFT_FACTOR_MIN, WIND_DRIFT_FACTOR_MAX),
            )
        return AnalyticField(
            u0=0.35 * rng.normal(1.0, 0.20),
            v0=0.10 * rng.normal(1.0, 0.30),
            wind_factor=rng.uniform(WIND_DRIFT_FACTOR_MIN, WIND_DRIFT_FACTOR_MAX),
        )

    def describe(self):
        """For /api/health and the UI footer -- surface this, never hide it."""
        return {
            "source": self.source,
            "is_real_ocean_data": self.source != "analytic",
            "status": "fallback" if self.source == "analytic" else "configured",
            "attribution": (
                None if self.source == "analytic"
                else "Generated using E.U. Copernicus Marine Service Information"
            ),
        }
