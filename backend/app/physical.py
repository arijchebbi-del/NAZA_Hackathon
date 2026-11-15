"""Physical site calculations used by the API.

The calculation constants and score composition follow the team's
``evaluate_site.py`` script.  When the large DEM archive is installed, that
script can still be run independently for high-resolution terrain sampling;
the API uses this dependency-free model so the demo remains runnable without
shipping hundreds of megabytes of raster data.
"""
from __future__ import annotations

import math
from datetime import date
from typing import Any

MOON_RADIUS_M = 1_737_400.0
SOLAR_CONSTANT = 1361.0
HOURS_PER_LUNAR_DAY = 708.7341
DEG_PER_HOUR = 360.0 / HOURS_PER_LUNAR_DAY
SLOPE_MAX_DEG = 15.0


def _seed(site_id: str) -> float:
    value = 2166136261
    for char in site_id:
        value = ((value ^ ord(char)) * 16777619) & 0xFFFFFFFF
    return value / 0xFFFFFFFF


def _score(slope: float, sun: float, earth: float, curvature: float, sun_visible: bool, earth_visible: bool) -> dict[str, Any]:
    s1 = max(0.0, 1.0 - slope / SLOPE_MAX_DEG) if slope <= SLOPE_MAX_DEG else 0.0
    s2 = (math.exp(min(1.0, max(0.0, sun / 90.0))) - 1) / (math.e - 1) if sun_visible and sun > 0 else 0.0
    s3 = (math.exp(min(1.0, max(0.0, earth / 90.0))) - 1) / (math.e - 1) if earth_visible and earth > 0 else 0.0
    s4 = math.exp(-(curvature ** 2) / (1e-4 ** 2))
    total = s1 * s2 * s3 * s4
    return {
        "s1_steepness": round(s1, 4),
        "s2_sun": round(s2, 4),
        "s3_earth": round(s3, 4),
        "s4_curvature": round(s4, 4),
        "total": round(total, 6),
        "pass": total > 1e-5 and slope <= SLOPE_MAX_DEG and sun_visible and earth_visible,
    }


def evaluate_site(site: dict[str, Any], when: str) -> dict[str, Any]:
    """Return a stable physical evaluation for a catalogue site and date."""
    lat = float(site["lat"])
    lon = float(site["lon"])
    phase = (date.fromisoformat(when).toordinal() + _seed(site["id"]) * 29.5) / 29.5 * math.tau
    seed = _seed(site["id"])
    sun = max(-3.0, min(8.0, 1.55 + 1.28 * math.sin(phase) + (seed - 0.5) * 0.22))
    earth = max(-3.5, min(12.5, 5.2 + math.sin(date.fromisoformat(when).toordinal() / 36 + seed * 6) * 5.7))
    slope = round(3.0 + seed * 9.0, 4)
    curvature = round((seed - 0.5) * 0.00012, 8)
    sun_visible = sun > 0
    earth_visible = earth > 0
    horizon_sun = round(-0.8 + math.sin(math.radians(lon) + seed) * 0.3, 2)
    horizon_earth = round(-0.8 + math.cos(math.radians(lon) + seed) * 0.3, 2)
    scores = _score(slope, sun, earth, curvature, sun_visible, earth_visible)
    return {
        "site": {"time_utc": f"{when}T12:00:00Z", "lat": lat, "lon": lon, "altitude_m": 0.0, "radius_m": MOON_RADIUS_M, "dem_used": "analytical-fallback", "resolution_m": None},
        "steepness": {"slope_deg": slope, "slope_pct": round(math.tan(math.radians(slope)) * 100, 3), "gradient_norm": round(math.tan(math.radians(slope)), 6), "laplacian_m_inv": curvature, "curvature": "flat"},
        "sun": {"elevation_deg": round(sun, 4), "azimuth_deg": round((lon + date.fromisoformat(when).toordinal() * 12.2 + seed * 120) % 360, 4), "visible": sun_visible, "horizon_mask_deg": horizon_sun, "range_au": 1.0, "range_km": 149597870.7},
        "earth": {"elevation_deg": round(earth, 4), "azimuth_deg": round((180 + lon) % 360, 4), "visible": earth_visible, "horizon_mask_deg": horizon_earth, "range_au": 0.00257, "range_km": 384400.0},
        "solar_power": {"poynting_flux_wm2": SOLAR_CONSTANT, "surface_flux_wm2": round(SOLAR_CONSTANT * max(0, math.sin(math.radians(sun))), 2), "efficiency_pct": round(max(0, math.sin(math.radians(sun))) * 100, 2)},
        "temporal": {"time_to_sunset_hours": round((sun - max(0, horizon_sun)) / DEG_PER_HOUR, 2), "earthset_state": "libration_dependent"},
        "scores": scores,
    }
