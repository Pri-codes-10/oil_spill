"""
app/drift/field_analytic.py

OWNER: B2 (Drift & Metocean).

Constant current + linear meridional shear + steady wind.

Not physically real. It exists so the chain runs before CMEMS/ERA5 clear, and
so Contract 2 has a shape on day 1. Always reported as field_source="analytic"
so nobody mistakes it for measured data (WORKFLOW.md §9, honesty rules).
"""

import numpy as np


class AnalyticField:
    def __init__(self, u0=0.35, v0=0.10, shear=0.004,
                 wind_u=-4.0, wind_v=2.0, wind_factor=0.02):
        self.u0, self.v0, self.shear = u0, v0, shear
        self.wind_u, self.wind_v = wind_u, wind_v
        self.wind_factor = wind_factor

    def velocity(self, lon, lat, when=None):
        """Return (u, v) in m/s at given positions. Arrays in, arrays out."""
        lat = np.asarray(lat, dtype="float64")
        u = self.u0 + self.shear * (lat - lat.mean())
        v = np.full_like(lat, self.v0)
        u = u + self.wind_factor * self.wind_u
        v = v + self.wind_factor * self.wind_v
        return u, np.asarray(v, dtype="float64")
