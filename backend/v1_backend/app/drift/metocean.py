"""B2: metocean integration seam.

Real CMEMS/ERA5 readers can be implemented behind this interface.
The analytic field remains the fallback so the chain is never blocked.
"""


class MetoceanProvider:
    def __init__(self, source="analytic"):
        self.source = source

    def describe(self):
        return {
            "source": self.source,
            "status": "fallback" if self.source == "analytic" else "configured",
        }

    def get_field(self):
        """
        Return the velocity-field object.

        Keep external data acquisition behind this seam. Do not make B3
        depend directly on CMEMS/ERA5 files.
        """
        if self.source == "analytic":
            from app.drift.field_analytic import AnalyticField
            return AnalyticField()

        raise NotImplementedError(
            "Real CMEMS/ERA5 provider is a day-5 integration upgrade."
        )
