"""
tests/test_drift_integrate.py

OWNER: B2 (Drift & Metocean).

Guards the backward integrator -- the piece the whole corridor rests on. Four
claims, in order of how badly a regression would hurt:

  1. a backward run undoes a forward run on a steady field  (the integrator
     is correct)
  2. diffusion does NOT undo                                 (the physics that
     makes Contract 2 a corridor rather than a pin)
  3. the clock ADVANCES through the integration               (regression guard)
  4. a backward run walks the clock BACKWARDS                 (regression guard)

3 and 4 exist because the clock was frozen once: advect() passed start_time
into every RK4 step unchanged, so a 72-hour hindcast asked the field for one
single instant 1152 times. AnalyticField ignores `when`, so nothing failed and
no number moved -- it would have surfaced as a confidently wrong corridor the
day a real CMEMS reader was wired in. A spy field is the only way to catch it.
"""

from datetime import timedelta

import numpy as np
import pytest
from pyproj import Geod

from app.common.timeutil import iso_z, parse_iso_z
from app.drift.field_analytic import AnalyticField
from app.drift.integrate import advect

GEOD = Geod(ellps="WGS84")

OBSERVED_AT = "2026-03-14T05:42:11Z"
LON0, LAT0 = 72.65, 18.43          # offshore Mumbai, matching mocks/polygon.json


def _cloud(n=50, seed=0):
    """A small ensemble, so the field's shear term is actually exercised."""
    rng = np.random.default_rng(seed)
    return LON0 + rng.normal(0, 0.02, n), LAT0 + rng.normal(0, 0.02, n)


def _closure_m(lon0, lat0, lon2, lat2):
    """Per-particle distance between where we started and where we came back to."""
    return np.array([GEOD.inv(a, b, c, d)[2]
                     for a, b, c, d in zip(lon0, lat0, lon2, lat2)])


def _round_trip(hours, diffusivity=0.0, rng_fwd=None, rng_bwd=None):
    """Advect forward `hours`, then backward `hours` from where we landed."""
    field = AnalyticField()
    lon0, lat0 = _cloud()
    t0 = parse_iso_z(OBSERVED_AT)

    fwd = advect(field, lon0, lat0, OBSERVED_AT, hours, dt_seconds=900,
                 backward=False, diffusivity=diffusivity, rng=rng_fwd)
    _, lon1, lat1 = fwd[-1]

    # The backward leg starts at the LATER timestamp -- that is the whole point
    # of a hindcast: you observe at t1 and integrate back toward t0.
    t1 = iso_z(t0 + timedelta(hours=hours))
    bwd = advect(field, lon1, lat1, t1, hours, dt_seconds=900,
                 backward=True, diffusivity=diffusivity, rng=rng_bwd)
    _, lon2, lat2 = bwd[-1]

    return lon0, lat0, lon1, lat1, lon2, lat2


class SpyField:
    """Records every timestamp it is asked for. Velocity values are arbitrary."""

    def __init__(self):
        self.times = []

    def velocity(self, lon, lat, when=None):
        self.times.append(when)
        lat = np.asarray(lat, dtype="float64")
        return np.full_like(lat, 0.30), np.full_like(lat, 0.05)


@pytest.mark.parametrize("hours", [12, 24, 72])
def test_backward_inverts_forward_on_steady_field(hours):
    """Forward then backward returns to the start, with diffusion OFF.

    Tolerance is 1 cm, which looks absurdly tight for a 79 km round trip and
    is not: on THIS field the inversion is exact to machine precision, because
    v is constant and u depends only on latitude, so every particle's latitude
    advances at the same rate, (lat - lat.mean()) is invariant, and RK4's
    symmetric (1,2,2,1) weights resample the same latitudes in reverse order
    on the way back. Measured closure is 0.000000 m at 12, 24 and 72 h.

    So a failure here is a real defect -- a sign error, an off-by-one in the
    step count, or a broken _to_deg -- not accumulated arithmetic drift. If a
    future time-varying analytic field makes this loosen legitimately, widen
    the bound deliberately and say why; do not just bump the number.
    """
    lon0, lat0, lon1, lat1, lon2, lat2 = _round_trip(hours)

    travelled_km = GEOD.inv(lon0[0], lat0[0], lon1[0], lat1[0])[2] / 1000.0
    assert travelled_km > hours * 0.5, (
        f"forward leg barely moved ({travelled_km:.2f} km in {hours} h) -- the "
        f"field or the step count is wrong, so the inversion below is vacuous")

    closure = _closure_m(lon0, lat0, lon2, lat2)
    assert closure.max() < 0.01, (
        f"backward run did not invert forward run: max closure "
        f"{closure.max():.6f} m after a {travelled_km:.1f} km round trip")


def test_diffusion_does_not_invert():
    """Diffusion is irreversible -- this is the honest core of the pitch.

    Advection is reversible; turbulent diffusion is not. Run the same round
    trip with diffusivity on and the cloud must NOT come home, because each
    leg adds an independent random walk. This is precisely why Contract 2 is a
    corridor of widening nodes instead of a single origin point, and why
    radius_km has to grow with hours_ago.

    If this test ever passes with a small closure, the diffusion term has
    stopped doing anything and every corridor radius is understated.
    """
    lon0, lat0, _, _, lon2, lat2 = _round_trip(
        24, diffusivity=1.0,
        rng_fwd=np.random.default_rng(1),
        rng_bwd=np.random.default_rng(2))

    closure = _closure_m(lon0, lat0, lon2, lat2)
    assert closure.mean() > 100.0, (
        f"diffusion appears reversible (mean closure {closure.mean():.1f} m) -- "
        f"the random walk is not being applied, so corridor radii are too small")


def test_clock_advances_through_the_integration():
    """The field must be sampled across the window, not frozen at one instant.

    REGRESSION GUARD. advect() once passed start_time into every step, so a
    time-varying field would have been asked for a single hour across the whole
    lookback. Nothing raised, because AnalyticField ignores `when`.
    """
    spy = SpyField()
    hours = 12
    advect(spy, [LON0], [LAT0], OBSERVED_AT, hours, dt_seconds=900)

    stamps = sorted(set(spy.times))
    assert len(stamps) > 1, (
        "field was asked for exactly one timestamp -- the clock is frozen "
        "again; see advect() in app/drift/integrate.py")

    span_h = (stamps[-1] - stamps[0]).total_seconds() / 3600.0
    assert span_h == pytest.approx(hours, abs=0.5), (
        f"clock spanned {span_h:.2f} h but the run was {hours} h")


def test_backward_run_walks_the_clock_backwards():
    """A hindcast samples times BEFORE the observation, never after.

    REGRESSION GUARD for the sign on the clock specifically. Negating the
    field and walking the clock are two separate things, and getting the
    second one backwards would sample the future to explain the past.
    """
    t0 = parse_iso_z(OBSERVED_AT)

    back = SpyField()
    advect(back, [LON0], [LAT0], OBSERVED_AT, 12, dt_seconds=900, backward=True)
    assert max(back.times) <= t0, "backward run sampled times after observed_at"
    assert min(back.times) < t0, "backward run never went before observed_at"

    fwd = SpyField()
    advect(fwd, [LON0], [LAT0], OBSERVED_AT, 12, dt_seconds=900, backward=False)
    assert min(fwd.times) >= t0, "forward run sampled times before observed_at"
    assert max(fwd.times) > t0, "forward run never went after observed_at"
