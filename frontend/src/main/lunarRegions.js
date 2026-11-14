// lunarRegions.js — catalogue de régions lunaires + détection (lat/lon -> région).
//
// POUR AJOUTER UNE RÉGION : ajoutez simplement un objet dans REGIONS ci-dessous.
//   id          identifiant unique (kebab-case)
//   name        nom affiché dans le label
//   type        "mare" | "crater" | "basin" | "highland" | "landing" | "polar"   (voir TYPE_STYLE)
//   lat, lon    centre en degrés. lat: + Nord / − Sud.  lon: + Est / − Ouest  (convention IAU)
//   radiusKm    rayon approximatif de la zone (la zone détectable est un disque sur la sphère)
//   description texte court affiché dans le panneau
// Aucune autre modification n'est nécessaire : survol, clic, surbrillance et pin se mettent à jour seuls.

import { MOON_RADIUS_KM, selenographicToVector } from "./lunarMath";

// Les petites régions (cratères, sites Apollo) seraient impossibles à survoler à la souris :
// leur zone détectable et leur surbrillance ne descendent jamais sous ce rayon.
export const MIN_REGION_KM = 90;

export const TYPE_STYLE = {
  mare: { label: "Mare", color: "#7fb4ff" },
  crater: { label: "Crater", color: "#ffcf70" },
  basin: { label: "Basin", color: "#b9a7ff" },
  highland: { label: "Highland", color: "#e8e8e8" },
  landing: { label: "Landing site", color: "#9cf0a0" },
  polar: { label: "Polar region", color: "#6fe3e3" },
};

export const REGIONS = [
  // --- Maria ---
  { id: "mare-tranquillitatis", name: "Mare Tranquillitatis", type: "mare", lat: 8.5, lon: 31.4, radiusKm: 400, description: "Sea of Tranquility. Basaltic plain where Apollo 11 landed in 1969." },
  { id: "mare-imbrium", name: "Mare Imbrium", type: "mare", lat: 32.8, lon: -15.6, radiusKm: 600, description: "Sea of Showers. Huge impact basin filled with basalt, bordered by the Apennine mountains." },
  { id: "mare-serenitatis", name: "Mare Serenitatis", type: "mare", lat: 28.0, lon: 17.5, radiusKm: 350, description: "Sea of Serenity. Dark circular mare next to the Apollo 17 landing zone." },
  { id: "mare-crisium", name: "Mare Crisium", type: "mare", lat: 17.0, lon: 59.1, radiusKm: 230, description: "Sea of Crises. An isolated, nearly closed basin close to the eastern limb." },
  { id: "mare-fecunditatis", name: "Mare Fecunditatis", type: "mare", lat: -7.8, lon: 51.3, radiusKm: 450, description: "Sea of Fertility. Where the Luna 16 probe returned samples." },
  { id: "mare-nubium", name: "Mare Nubium", type: "mare", lat: -21.3, lon: -16.6, radiusKm: 350, description: "Sea of Clouds, in the southern near side." },
  { id: "mare-humorum", name: "Mare Humorum", type: "mare", lat: -24.4, lon: -38.6, radiusKm: 210, description: "Sea of Moisture. Small, well-defined circular mare." },
  { id: "mare-frigoris", name: "Mare Frigoris", type: "mare", lat: 56.0, lon: 1.4, radiusKm: 700, description: "Sea of Cold. Long narrow mare in the north." },
  { id: "oceanus-procellarum", name: "Oceanus Procellarum", type: "mare", lat: 18.4, lon: -57.4, radiusKm: 1000, description: "Ocean of Storms. The largest lunar mare, on the western near side." },

  // --- Craters ---
  { id: "tycho", name: "Tycho", type: "crater", lat: -43.3, lon: -11.4, radiusKm: 43, description: "Young, bright crater with a prominent ray system." },
  { id: "copernicus", name: "Copernicus", type: "crater", lat: 9.6, lon: -20.1, radiusKm: 48, description: "Terraced crater, a reference for the Copernican geologic period." },
  { id: "aristarchus", name: "Aristarchus", type: "crater", lat: 23.7, lon: -47.4, radiusKm: 20, description: "One of the brightest craters on the Moon." },
  { id: "clavius", name: "Clavius", type: "crater", lat: -58.8, lon: -14.4, radiusKm: 115, description: "Huge old crater in the southern highlands." },

  // --- Landing sites ---
  { id: "apollo-11", name: "Tranquility Base (Apollo 11)", type: "landing", lat: 0.67, lon: 23.47, radiusKm: 20, description: "First crewed landing, July 20, 1969." },
  { id: "apollo-17", name: "Taurus-Littrow (Apollo 17)", type: "landing", lat: 20.19, lon: 30.77, radiusKm: 20, description: "Last crewed landing of the Apollo program, December 1972." },

  // --- Basin / south pole ---
  { id: "south-pole-aitken", name: "South Pole–Aitken basin", type: "basin", lat: -53.0, lon: -169.0, radiusKm: 1250, description: "Largest and oldest impact basin on the Moon, on the far side." },
  { id: "shackleton", name: "Shackleton crater", type: "polar", lat: -89.9, lon: 0.0, radiusKm: 21, description: "Permanently shadowed crater at the south pole, with illuminated rim ridges." },
  { id: "malapert", name: "Malapert Massif", type: "highland", lat: -85.9, lon: 0.0, radiusKm: 60, description: "Mountain near the south pole with a near-constant view of Earth." },
  { id: "cabeus", name: "Cabeus", type: "polar", lat: -84.9, lon: -35.5, radiusKm: 50, description: "Permanently shadowed crater where LCROSS found water ice (2009)." },
];

export function effectiveRadiusKm(region) {
  return Math.max(region.radiusKm, MIN_REGION_KM);
}

/** Rayon angulaire (radians) de la zone d'une région. */
export function regionAngularRadius(region) {
  return effectiveRadiusKm(region) / MOON_RADIUS_KM;
}

/** Vecteur unitaire (repère de la scène) du centre d'une région. */
export function regionNormal(region) {
  return selenographicToVector(region.lat, region.lon, 1);
}

/**
 * Région sous un point (lat°, lon°) de la surface.
 * Si plusieurs zones se recouvrent (un cratère dans une mer), on garde celle dont le point est
 * le plus proche du centre par rapport à son rayon : le plus petit/précis gagne près de son centre.
 */
export function findRegionAt(latDeg, lonDeg, regions = REGIONS) {
  const p = selenographicToVector(latDeg, lonDeg, 1);
  let best = null;
  for (const region of regions) {
    const c = regionNormal(region);
    const angle = Math.acos(Math.max(-1, Math.min(1, p.x * c.x + p.y * c.y + p.z * c.z)));
    const limit = regionAngularRadius(region);
    if (angle > limit) continue;
    const score = angle / limit;
    if (!best || score < best.score) best = { region, score, distanceKm: angle * MOON_RADIUS_KM };
  }
  return best;
}
