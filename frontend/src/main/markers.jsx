import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/*  UNIQUE définition du marqueur lunaire                              */
/*  Même géométrie (taille + forme) pour TOUS ; seule la couleur varie */
/* ------------------------------------------------------------------ */
export const MARKER_RADIUS = 0.035;            // rayon unique (unités de scène)
export const FREE_POINT_COLOR = "#5fd4ff";     // cyan : réservé aux points du clic libre
export const ACTIVE_MARKER_COLOR = "#ffffff";  // région survolée / sélectionnée
export const DEFAULT_MARKER_COLOR = FREE_POINT_COLOR;

// ★ UNE seule géométrie partagée par tous les marqueurs.
const MARKER_GEOMETRY = new THREE.SphereGeometry(MARKER_RADIUS, 16, 16);

// ★ Un matériau par couleur (mis en cache) : pas de duplication, pas de fuite mémoire.
const MATERIALS = new Map();
export function getMarkerMaterial(color) {
  let material = MATERIALS.get(color);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    MATERIALS.set(color, material);
  }
  return material;
}

/** Crée le Mesh d'un marqueur. Le 1er paramètre est la couleur. */
export function createMarkerMesh(color = DEFAULT_MARKER_COLOR) {
  const mesh = new THREE.Mesh(MARKER_GEOMETRY, getMarkerMaterial(color));
  mesh.renderOrder = 3;
  return mesh;
}

/* ------------------------------------------------------------------ */
/*  Registre : liste des marqueurs actuellement affichés, pour que le  */
/*  Raycaster puisse les viser EN PRIORITÉ (avant la sphère lunaire).  */
/* ------------------------------------------------------------------ */
const MARKERS = new Set();
export function registerMarker(mesh) {
  MARKERS.add(mesh);
  return () => MARKERS.delete(mesh);
}
export function getMarkerMeshes() {
  return Array.from(MARKERS);
}

/**
 * <Marker position color kind payload /> (accepte onClick, etc.)
 *  - kind    : "region" | "site" | "free" (lu par le Raycaster via mesh.userData)
 *  - payload : l'objet associé (la région, le site...)
 */
export function Marker({ position = [0, 0, 0], color = DEFAULT_MARKER_COLOR, kind = "marker", payload = null, ...events }) {
  const mesh = useMemo(() => createMarkerMesh(color), []); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    mesh.material = getMarkerMaterial(color);
  }, [mesh, color]);
  useEffect(() => {
    mesh.userData = { kind, payload };
    return registerMarker(mesh);
  }, [mesh, kind, payload]);
  return <primitive object={mesh} position={position} {...events} />;
}

