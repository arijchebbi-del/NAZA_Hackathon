// lunarMath.js — Sun / Earth directions in the Moon-fixed (selenographic) frame.
//
// Dependency: npm i astronomy-engine   (VSOP87 + ELP/MPP02-class accuracy, ~arcminute level)
//
// Scene frame used by MainSimulation (same as the Moon texture mapping in three.js SphereGeometry):
//   +Y  = lunar north pole
//   +X  = point at lat 0°, lon 0° (the mean sub-Earth point)
//   -Z  = direction of increasing (east) longitude
// so a point (lat, lon) is  (cos lat · cos lon,  sin lat,  -cos lat · sin lon).
//
// The Moon stays fixed in the scene; the Sun and the Earth move around it:
//   * Earth: sub-Earth point = optical + physical libration (Astronomy.Libration) -> small wobble around +X.
//   * Sun: true direction Moon -> Sun, expressed in the same body-fixed axes -> day/night, grazing polar light.

import * as Astronomy from "astronomy-engine";

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

const vec = (o) => ({ x: o.x, y: o.y, z: o.z });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const length = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (a) => mul(a, 1 / (length(a) || 1));

export const MOON_RADIUS_KM = 1737.4;

/** Selenographic (lat°, lon° east-positive) -> scene vector. */
export function selenographicToVector(latDeg, lonDeg, radius = 1) {
  const lat = latDeg * D2R;
  const lon = lonDeg * D2R;
  return {
    x: radius * Math.cos(lat) * Math.cos(lon),
    y: radius * Math.sin(lat),
    z: -radius * Math.cos(lat) * Math.sin(lon),
  };
}

/** Scene vector -> { lat°, lon° (−180..180, east-positive) }. */
export function vectorToSelenographic(v) {
  const n = norm(v);
  return { lat: Math.asin(Math.max(-1, Math.min(1, n.y))) * R2D, lon: Math.atan2(-n.z, n.x) * R2D };
}

// Lunar north pole in the J2000 equatorial frame (EQJ).
function lunarNorthPole(time) {
  try {
    return norm(vec(Astronomy.RotationAxis(Astronomy.Body.Moon, time).north));
  } catch {
    // IAU mean pole as a fallback: RA 269.9949°, Dec 66.5392°.
    const ra = 269.9949 * D2R;
    const dec = 66.5392 * D2R;
    return { x: Math.cos(dec) * Math.cos(ra), y: Math.cos(dec) * Math.sin(ra), z: Math.sin(dec) };
  }
}

/**
 * Everything the 3D scene needs for a given instant.
 * @param {Date} date  any JS Date (UTC instant)
 */
export function computeMoonFrame(date) {
  const time = Astronomy.MakeTime(date);
  const lib = Astronomy.Libration(time);

  const moonGeo = vec(Astronomy.GeoMoon(time)); // Earth -> Moon, EQJ, AU
  const sunGeo = vec(Astronomy.GeoVector(Astronomy.Body.Sun, time, true)); // Earth -> Sun, EQJ, AU
  const sunFromMoon = sub(sunGeo, moonGeo);
  const earthDirEqj = norm(mul(moonGeo, -1)); // Moon -> Earth

  // Build the Moon-fixed axes (in EQJ): Y = north pole, X = prime meridian, Z = X × Y.
  // We know the sub-Earth point is at (elat, elon) in that frame, so rotate the Earth direction by -elon about Y.
  const yb = lunarNorthPole(time);
  const u = norm(sub(earthDirEqj, mul(yb, dot(earthDirEqj, yb)))); // Earth direction projected on the equator plane
  const c = Math.cos(lib.elon * D2R);
  const s = Math.sin(lib.elon * D2R);
  const xb = norm(sub(mul(u, c), mul(cross(yb, u), s)));
  const zb = cross(xb, yb);
  const toBody = (v) => ({ x: dot(v, xb), y: dot(v, yb), z: dot(v, zb) });

  const sunDir = norm(toBody(sunFromMoon));
  const earthDir = norm(toBody(earthDirEqj));

  return {
    date,
    sunDir,
    earthDir,
    subsolar: vectorToSelenographic(sunDir), // where the Sun is at the zenith
    subEarth: vectorToSelenographic(earthDir), // ≈ (libration lat, libration lon)
    libration: { lat: lib.elat, lon: lib.elon },
    earthDistanceKm: lib.dist_km,
    earthAngularDiameterDeg: lib.diam_deg,
    sunDistanceAu: length(sunFromMoon),
    // Earth phase seen from the Moon: 0 = new Earth (full Moon), 1 = full Earth (new Moon).
    earthIlluminatedFraction: (1 - dot(sunDir, earthDir)) / 2,
  };
}

/**
 * Smooth, geometric sun / Earth elevation at a site (no local terrain, no refraction).
 * Sun is "up" once its upper limb (~0.27°) clears the mathematical horizon.
 */
export function siteLighting(frame, latDeg, lonDeg) {
  const n = selenographicToVector(latDeg, lonDeg, 1);
  const sunElevationDeg = Math.asin(Math.max(-1, Math.min(1, dot(n, frame.sunDir)))) * R2D;
  const earthElevationDeg = Math.asin(Math.max(-1, Math.min(1, dot(n, frame.earthDir)))) * R2D;
  return {
    sunElevationDeg,
    earthElevationDeg,
    sunVisible: sunElevationDeg > -0.27,
    earthVisible: earthElevationDeg > -0.27,
  };
}

/** Stylised placement: exact directions, artificial distances (a true-scale scene would be unusable). */
export function toSceneVectors(frame, { sunDistance = 40, earthDistance = 12 } = {}) {
  const p = (v, d) => [v.x * d, v.y * d, v.z * d];
  return { sun: p(frame.sunDir, sunDistance), earth: p(frame.earthDir, earthDistance) };
}
