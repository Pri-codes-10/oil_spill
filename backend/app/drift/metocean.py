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

from app.config import WIND_DRIFT_FACTOR_MIN, WIND_DRIFT_FACTOR_MAX
from app.drift.field_analytic import AnalyticField

# Sources this file can actually produce today. Add to this set only when a
# reader exists and has been run against real data -- not when it is stubbed.
IMPLEMENTED = {"analytic"}

# Sources that are recognised but deliberately not wired yet (day-5 upgrade).
PLANNED = {"cmems_era5"}


class MetoceanProvider:
    """Resolves a field_source name into perturbed velocity fields.

    Usage in an ensemble loop:

        provider = MetoceanProvider("analytic")
        for _ in range(n_members):
            field = provider.make_field(rng)      # perturbed per member
        ...
        contract2["field_source"] = provider.source   # the HONEST label
    """

    def __init__(self, source="analytic"):
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
        self.source = source

    def make_field(self, rng):
        """One ensemble member's field, with genuinely-uncertain params perturbed.

        The RNG draw ORDER is load-bearing: tests pin a seed and assert the
        guilty vessel ranks first. Reordering these three draws changes every
        downstream number even though the physics is unchanged.
        """
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
