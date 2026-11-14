// src/main/lunarMath.js
import * as Astronomy from "astronomy-engine";

const DEG = Math.PI / 180;
const EPS = 23.4392911 * DEG; // obliquité J2000
const AU_KM = 149597870.7;

// Si la Terre apparaît "miroir" (libération en longitude inversée), passe à -1.
export const LIBRATION_LON_SIGN = 1;

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z);
const unit = (a) => { const l = len(a); return { x: a.x / l, y: a.y / l, z: a.z / l }; };
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

// Équatorial J2000 -> écliptique J2000
const toEcliptic = (v) => ({
  x: v.x,
  y: v.y * Math.cos(EPS) + v.z * Math.sin(EPS),
  z: -v.y * Math.sin(EPS) + v.z * Math.cos(EPS),
});

/**
 * État Soleil/Terre vu depuis la Lune à une date donnée.
 * Repère scène (Three) : +X = longitude 0 / latitude 0, +Y = nord lunaire, +Z = ouest (est = -Z).
 * Cohérent avec surfacePosition() de MainSimulation.jsx et avec l'UV d'une SphereGeometry
 * dont la texture équirectangulaire a la longitude 0 au centre.
 */
export function getLunarState(input) {
  const date = input instanceof Date ? input : new Date(input);

  const moonGeo = toEcliptic(Astronomy.GeoMoon(date));                    // Terre -> Lune (UA)
  const sunGeo = toEcliptic(Astronomy.GeoVector("Sun", date, true));      // Terre -> Soleil (UA)
  const earthFromMoon = { x: -moonGeo.x, y: -moonGeo.y, z: -moonGeo.z };
  const sunFromMoon = sub(sunGeo, moonGeo);

  // Orientation de la Lune : pôle ≈ nord écliptique (écart réel ~1,5°),
  // méridien 0 déduit du point sub-terrestre (elon) donné par la libration.
  const lib = Astronomy.Libration(date);
  const lonEarth = Math.atan2(earthFromMoon.y, earthFromMoon.x);
  const x0 = lonEarth - LIBRATION_LON_SIGN * lib.elon * DEG;
  const bx = { x: Math.cos(x0), y: Math.sin(x0), z: 0 };   // vers lon 0
  const by = { x: -Math.sin(x0), y: Math.cos(x0), z: 0 };  // vers l'est

  const toBody = (v) => {
    const u = unit(v);
    return { x: dot(u, bx), y: dot(u, by), z: u.z };
  };
  const toScene = (b) => [b.x, b.z, -b.y];
  const subpoint = (b) => ({ lat: Math.asin(b.z) / DEG, lon: Math.atan2(b.y, b.x) / DEG });

  const sunB = toBody(sunFromMoon);
  const earthB = toBody(earthFromMoon);

  return {
    sunDir: toScene(sunB),        // vecteur unitaire Lune -> Soleil (scène)
    earthDir: toScene(earthB),    // vecteur unitaire Lune -> Terre (scène)
    subSolar: subpoint(sunB),     // point sub-solaire (deg)
    subEarth: subpoint(earthB),   // point sub-terrestre (deg)
    earthDistKm: len(moonGeo) * AU_KM,
    sunDistAU: len(sunFromMoon),
    libration: { lon: lib.elon, lat: lib.elat },
  };
}

/** Vecteur unitaire (scène) d'un site lat/lon en degrés. */
export function siteVector(lat, lon) {
  const la = lat * DEG, lo = lon * DEG;
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)];
}

/** Élévation (deg) d'une direction (Soleil/Terre) au-dessus de l'horizon sphérique du site. Sans relief. */
export function elevationDeg(siteLat, siteLon, dir) {
  const s = siteVector(siteLat, siteLon);
  const d = s[0] * dir[0] + s[1] * dir[1] + s[2] * dir[2];
  return Math.asin(Math.max(-1, Math.min(1, d))) / DEG;
}