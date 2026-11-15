import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { vectorToSelenographic, selenographicToVector, siteLighting } from "./lunarMath";
import { TYPE_STYLE, effectiveRadiusKm } from "./lunarRegions";
import { Marker, FREE_POINT_COLOR, ACTIVE_MARKER_COLOR, getMarkerMeshes } from "./markers";

const MOON_RADIUS = 2.4; // doit rester égal à MOON_RADIUS de MainSimulation.jsx
const OVERLAY_RADIUS = MOON_RADIUS + 0.03;

// ★ Réglages de sélection
const OCCLUSION_TOLERANCE = 0.08;   // un marqueur est "devant" la Lune s'il est au plus à 0.08 derrière le point d'impact
const HOVER_LEAVE_DELAY_MS = 90;    // anti-clignotement : on n'efface le survol qu'après 90 ms hors marqueur
const CLICK_MOVE_TOLERANCE_PX = 5;  // au-delà, c'est un glisser (OrbitControls), pas un clic

/* ------------------------------------------------------------------ */
/*  Score + éclairage d'un point libre                                 */
/* ------------------------------------------------------------------ */
function terrainNoise(lat, lon) {
  const x = Math.sin(Math.round(lat * 10) * 12.9898 + Math.round(lon * 10) * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Infos affichées pour un clic sur une zone libre. Score = démo (0-100), pas une certification. */
export function describeFreePoint(frame, { lat, lon }) {
  const light = siteLighting(frame, lat, lon);
  const sun = clamp01((light.sunElevationDeg + 0.27) / 30);
  const earth = clamp01((light.earthElevationDeg + 0.27) / 30);
  const terrain = terrainNoise(lat, lon);
  const score = Math.round(100 * (0.4 * sun + 0.35 * earth + 0.25 * terrain));
  return { lat, lon, ...light, score };
}

const fmtLat = (v, d = 2) => `${Math.abs(v).toFixed(d)}°${v >= 0 ? "N" : "S"}`;
const fmtLon = (v, d = 2) => `${Math.abs(v).toFixed(d)}°${v >= 0 ? "E" : "W"}`;

const toPosition = (lat, lon, radius) => {
  const p = selenographicToVector(lat, lon, radius);
  return [p.x, p.y, p.z];
};

/* ------------------------------------------------------------------ */
/*  Raycaster : marqueurs EN PRIORITÉ, puis sphère lunaire             */
/* ------------------------------------------------------------------ */
export function RegionPicker({ moonRef, onHover, onSelect, onFreePick, onCursor }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    const element = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let hoveredId = null;
    let leaveTimer = null;
    let frameRequest = 0;
    let lastMove = null;
    let downAt = null;

    // ★ PRIORITÉ D'INTERSECTION
    //   1) on lance le rayon contre les marqueurs (leurs vraies sphères : zone de détection = taille visuelle)
    //   2) on lance le rayon contre la Lune
    //   3) un marqueur gagne s'il n'est pas caché derrière la Lune (comparaison des distances)
    //   4) sinon, point libre sur la Lune
    function pick(clientX, clientY) {
      const moon = moonRef.current;
      if (!moon) return null;
      const rect = element.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);

      const moonHit = raycaster.intersectObject(moon, false)[0] ?? null;
      const markerHit = raycaster
        .intersectObjects(getMarkerMeshes(), false)
        .find((hit) => !moonHit || hit.distance <= moonHit.distance + OCCLUSION_TOLERANCE) ?? null;

      const base = moonHit ?? markerHit;
      if (!base) return null;
      const { lat, lon } = vectorToSelenographic(moon.worldToLocal(base.point.clone()));
      return { lat, lon, marker: markerHit ? markerHit.object.userData : null };
    }

    // ★ ANTI-CLIGNOTEMENT : entrer sur un marqueur est immédiat, en sortir est retardé de 90 ms.
    function setHovered(region) {
      const id = region?.id ?? null;
      if (id) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
        if (id !== hoveredId) {
          hoveredId = id;
          onHover(region);
        }
      } else if (hoveredId && !leaveTimer) {
        leaveTimer = setTimeout(() => {
          leaveTimer = null;
          hoveredId = null;
          onHover(null);
        }, HOVER_LEAVE_DELAY_MS);
      }
    }

    // ★ Le survol n'est évalué qu'une fois par frame d'affichage (pas à chaque événement souris).
    function processMove() {
      frameRequest = 0;
      if (!lastMove) return;
      const result = pick(lastMove.x, lastMove.y);
      onCursor?.(result ? { lat: result.lat, lon: result.lon } : null);
      setHovered(result?.marker?.kind === "region" ? result.marker.payload : null);
      element.style.cursor = result?.marker ? "pointer" : result ? "crosshair" : "";
    }

    function onMove(event) {
      if (event.buttons) return;
      lastMove = { x: event.clientX, y: event.clientY };
      if (!frameRequest) frameRequest = requestAnimationFrame(processMove);
    }
    function onLeave() {
      lastMove = null;
      onCursor?.(null);
      setHovered(null);
      element.style.cursor = "";
    }
    function onDown(event) {
      downAt = { x: event.clientX, y: event.clientY };
    }
    function onUp(event) {
      if (!downAt) return;
      const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
      downAt = null;
      if (moved > CLICK_MOVE_TOLERANCE_PX) return;

      const result = pick(event.clientX, event.clientY);
      if (!result) {                                   // clic dans l'espace : tout effacer
        onSelect(null);
        onFreePick(null);
      } else if (result.marker) {                      // ★ un marqueur est visé : JAMAIS de clic libre
        const { kind, payload } = result.marker;
        if (kind === "region") {
          onFreePick(null);
          onSelect(payload);
        } else if (kind === "site") {                  // le site gère son propre onClick (R3F)
          onSelect(null);
          onFreePick(null);
        }                                              // kind === "free" : on ne fait rien
      } else {                                         // zone libre de la Lune
        onSelect(null);
        onFreePick({ lat: result.lat, lon: result.lon });
      }
    }

    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerleave", onLeave);
    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointerup", onUp);
    return () => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointerup", onUp);
      cancelAnimationFrame(frameRequest);
      clearTimeout(leaveTimer);
      element.style.cursor = "";
    };
  }, [gl, camera, moonRef, onHover, onSelect, onFreePick, onCursor]);

  return null;
}

/* ------------------------------------------------------------------ */
/*  Pins des régions : couleur selon le TYPE de région                 */
/* ------------------------------------------------------------------ */
export function RegionPins({ regions, activeId }) {
  return (
    <>
      {regions.map((region) => {
        const style = TYPE_STYLE[region.type] ?? TYPE_STYLE.highland;
        return (
          <Marker
            key={region.id}
            kind="region"
            payload={region}
            color={region.id === activeId ? ACTIVE_MARKER_COLOR : style.color} // ★ couleur par type (blanc si actif)
            position={toPosition(region.lat, region.lon, OVERLAY_RADIUS)}
          />
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Label d'une région survolée / sélectionnée                         */
/* ------------------------------------------------------------------ */
export function RegionLabel({ region, moonRef, selected = false }) {
  const style = TYPE_STYLE[region.type] ?? TYPE_STYLE.highland;
  const labelPosition = useMemo(() => toPosition(region.lat, region.lon, OVERLAY_RADIUS + 0.1), [region]);
  return (
    <Html position={labelPosition} center distanceFactor={7} zIndexRange={[9, 0]} occlude={moonRef ? [moonRef] : undefined} style={{ pointerEvents: "none" }}>
      <div className={`region-label ${selected ? "region-label-selected" : ""}`} style={{ "--region-color": style.color }}>
        <strong>{region.name}</strong>
        <span>{style.label} · {fmtLat(region.lat, 1)} {fmtLon(region.lon, 1)}</span>
      </div>
    </Html>
  );
}

/* ------------------------------------------------------------------ */
/*  Point du clic libre : cyan, réservé à ces points                   */
/* ------------------------------------------------------------------ */
export function FreePointMarker({ info, moonRef }) {
  const position = useMemo(() => toPosition(info.lat, info.lon, OVERLAY_RADIUS), [info.lat, info.lon]);
  const labelPosition = useMemo(() => toPosition(info.lat, info.lon, OVERLAY_RADIUS + 0.1), [info.lat, info.lon]);

  return (
    <>
      <Marker kind="free" color={FREE_POINT_COLOR} position={position} />
      <Html position={labelPosition} center distanceFactor={7} zIndexRange={[9, 0]} occlude={moonRef ? [moonRef] : undefined} style={{ pointerEvents: "none" }}>
        <div className="site-tooltip">
          <strong>Custom point</strong>
          <span>{fmtLat(info.lat)} · {fmtLon(info.lon)}</span>
          <span>Sun {info.sunElevationDeg.toFixed(1)}° · {info.sunVisible ? "lit" : "shadow"}</span>
          <span>Earth {info.earthElevationDeg.toFixed(1)}° · {info.earthVisible ? "in sight" : "hidden"}</span>
          <b>{info.score} / 100</b>
        </div>
      </Html>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Panneau DOM                                                        */
/* ------------------------------------------------------------------ */
export function RegionPanel({ hovered, selected, free, cursorRef, onClear }) {
  const region = hovered ?? selected;
  const style = region ? TYPE_STYLE[region.type] ?? TYPE_STYLE.highland : null;
  const showFree = !region && free;
  return (
    <div className="region-panel">
      <div className="region-eyebrow">
        {showFree ? "CUSTOM POINT · LOCKED" : `LUNAR REGION ${selected && !hovered ? "· LOCKED" : ""}`}
      </div>
      {region ? (
        <>
          <h3 style={{ "--region-color": style.color }}>{region.name}</h3>
          <div className="region-meta">
            {style.label} · {fmtLat(region.lat)} {fmtLon(region.lon)} · ⌀ ≈ {Math.round(effectiveRadiusKm(region) * 2).toLocaleString("en-US")} km
          </div>
          <p>{region.description}</p>
          {selected && <button type="button" onClick={onClear}>CLEAR</button>}
        </>
      ) : showFree ? (
        <>
          <h3 style={{ "--region-color": FREE_POINT_COLOR }}>Custom point</h3>
          <div className="region-meta">{fmtLat(free.lat)} {fmtLon(free.lon)}</div>
          <p>
            Sun {free.sunElevationDeg.toFixed(1)}° ({free.sunVisible ? "lit" : "in shadow"}) · Earth {free.earthElevationDeg.toFixed(1)}° ({free.earthVisible ? "in sight" : "hidden"})
          </p>
          <div className="region-score">DEMO SCORE <b>{free.score} / 100</b></div>
          <button type="button" onClick={onClear}>CLEAR</button>
        </>
      ) : (
        <p>Hover a marker to see its region, click anywhere on the Moon to inspect a point.</p>
      )}
      <div className="region-cursor" ref={cursorRef}>CURSOR —</div>
    </div>
  );
}
