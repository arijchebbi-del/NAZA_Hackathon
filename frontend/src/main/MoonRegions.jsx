import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { vectorToSelenographic, selenographicToVector } from "./lunarMath";
import { TYPE_STYLE, findRegionAt, regionAngularRadius, regionNormal, effectiveRadiusKm } from "./lunarRegions";

const MOON_RADIUS = 2.4; // doit rester égal à MOON_RADIUS de MainSimulation.jsx
const OVERLAY_RADIUS = MOON_RADIUS + 0.03; // au-dessus du relief (déplacement max ≈ 0.0225)

/* ------------------------------------------------------------------ */
/*  Raycaster : survol + clic sur la sphère lunaire                    */
/* ------------------------------------------------------------------ */
// On lance un THREE.Raycaster depuis la caméra à chaque mouvement de souris, on récupère le point
// d'impact sur la Lune, on le convertit en latitude/longitude, puis on cherche la région correspondante.
export function RegionPicker({ moonRef, onHover, onSelect, onCursor }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    const element = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let hoveredId = null;
    let downAt = null;

    function pick(event) {
      const moon = moonRef.current;
      if (!moon) return null;
      const rect = element.getBoundingClientRect();
      ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(moon, false)[0];
      if (!hit) return null;
      const local = moon.worldToLocal(hit.point.clone()); // robuste même si la Lune est tournée
      const { lat, lon } = vectorToSelenographic(local);
      return { lat, lon, region: findRegionAt(lat, lon)?.region ?? null };
    }

    function setHovered(region) {
      const id = region?.id ?? null;
      if (id !== hoveredId) {
        hoveredId = id;
        onHover(region);
      }
      element.style.cursor = id ? "pointer" : "";
    }

    function onMove(event) {
      if (event.buttons) return; // on ne détecte pas pendant une rotation à la souris
      const result = pick(event);
      onCursor?.(result ? { lat: result.lat, lon: result.lon } : null);
      setHovered(result?.region ?? null);
    }
    function onLeave() {
      onCursor?.(null);
      setHovered(null);
    }
    function onDown(event) {
      downAt = { x: event.clientX, y: event.clientY };
    }
    function onUp(event) {
      if (!downAt) return;
      const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
      downAt = null;
      if (moved > 5) return; // c'était un glisser (OrbitControls), pas un clic
      const result = pick(event);
      onSelect(result?.region ?? null);
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
      element.style.cursor = "";
    };
  }, [gl, camera, moonRef, onHover, onSelect, onCursor]);

  return null;
}

/* ------------------------------------------------------------------ */
/*  Surbrillance d'une région (calotte sphérique + contour) + label    */
/* ------------------------------------------------------------------ */
export function RegionHighlight({ region, moonRef, selected = false }) {
  const style = TYPE_STYLE[region.type] ?? TYPE_STYLE.highland;
  const alpha = regionAngularRadius(region);
  const normal = useMemo(() => {
    const n = regionNormal(region);
    return new THREE.Vector3(n.x, n.y, n.z);
  }, [region]);
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal), [normal]);
  const outline = useMemo(() => {
    // Cercle de rayon angulaire alpha autour du pôle +Y, ensuite orienté vers la région par `quaternion`.
    return Array.from({ length: 97 }, (_, i) => {
      const phi = (i / 96) * Math.PI * 2;
      return new THREE.Vector3(Math.sin(alpha) * Math.cos(phi), Math.cos(alpha), Math.sin(alpha) * Math.sin(phi)).multiplyScalar(OVERLAY_RADIUS + 0.004);
    });
  }, [alpha]);
  const labelPosition = useMemo(() => normal.clone().multiplyScalar(OVERLAY_RADIUS + 0.1).toArray(), [normal]);

  return (
    <>
      <group quaternion={quaternion}>
        <mesh renderOrder={2}>
          <sphereGeometry args={[OVERLAY_RADIUS, 64, 12, 0, Math.PI * 2, 0, alpha]} />
          <meshBasicMaterial color={style.color} transparent opacity={selected ? 0.26 : 0.16} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        <Line points={outline} color={style.color} lineWidth={selected ? 2 : 1.4} transparent opacity={0.95} toneMapped={false} />
      </group>
      <Html position={labelPosition} center distanceFactor={7} zIndexRange={[9, 0]} occlude={moonRef ? [moonRef] : undefined} style={{ pointerEvents: "none" }}>
        <div className={`region-label ${selected ? "region-label-selected" : ""}`} style={{ "--region-color": style.color }}>
          <strong>{region.name}</strong>
          <span>{style.label} · {Math.abs(region.lat).toFixed(1)}°{region.lat >= 0 ? "N" : "S"} {Math.abs(region.lon).toFixed(1)}°{region.lon >= 0 ? "E" : "W"}</span>
        </div>
      </Html>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Petits points repères au centre de chaque région                   */
/* ------------------------------------------------------------------ */
export function RegionPins({ regions, activeId }) {
  return (
    <>
      {regions.map((region) => {
        const p = selenographicToVector(region.lat, region.lon, OVERLAY_RADIUS);
        const style = TYPE_STYLE[region.type] ?? TYPE_STYLE.highland;
        return (
          <mesh key={region.id} position={[p.x, p.y, p.z]} scale={region.id === activeId ? 1.8 : 1}>
            <sphereGeometry args={[0.018, 10, 10]} />
            <meshBasicMaterial color={style.color} toneMapped={false} />
          </mesh>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Panneau DOM : région survolée / sélectionnée + coordonnées curseur */
/* ------------------------------------------------------------------ */
export function RegionPanel({ hovered, selected, cursorRef, onClear }) {
  const region = hovered ?? selected;
  const style = region ? TYPE_STYLE[region.type] ?? TYPE_STYLE.highland : null;
  return (
    <div className="region-panel">
      <div className="region-eyebrow">LUNAR REGION {selected && !hovered ? "· LOCKED" : ""}</div>
      {region ? (
        <>
          <h3 style={{ "--region-color": style.color }}>{region.name}</h3>
          <div className="region-meta">
            {style.label} · {Math.abs(region.lat).toFixed(2)}°{region.lat >= 0 ? "N" : "S"} {Math.abs(region.lon).toFixed(2)}°{region.lon >= 0 ? "E" : "W"} · ⌀ ≈ {Math.round(effectiveRadiusKm(region) * 2).toLocaleString("en-US")} km
          </div>
          <p>{region.description}</p>
          {selected && <button type="button" onClick={onClear}>CLEAR</button>}
        </>
      ) : (
        <p>Hover the Moon to detect a region, click to lock it.</p>
      )}
      <div className="region-cursor" ref={cursorRef}>CURSOR —</div>
    </div>
  );
}
