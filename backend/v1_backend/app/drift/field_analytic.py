"""B2: deterministic fallback velocity field."""

import numpy as np


class AnalyticField:
    """
    Constant current + linear meridional shear + steady wind.

    This is NOT real ocean data. Its purpose is to keep the chain runnable
    before CMEMS/ERA5 access is available.
    """

    def __init__(
        self,
        u0=0.35,
        v0=0.10,
        shear=0.004,
        wind_u=-4.0,
        wind_v=2.0,
        wind_factor=0.02,
    ):
        self.u0 = u0
        self.v0 = v0
        self.shear = shear
        self.wind_u = wind_u
        self.wind_v = wind_v
        self.wind_factor = wind_factor

    def velocity(self, lon, lat, when=None):
        """Return u/v in m/s. Arrays in, arrays out."""
        lat = np.asarray(lat, dtype="float64")

        u = self.u0 + self.shear * (lat - lat.mean())
        v = np.full_like(lat, self.v0)

        u = u + self.wind_factor * self.wind_u
        v = v + self.wind_factor * self.wind_v

        return u, v
