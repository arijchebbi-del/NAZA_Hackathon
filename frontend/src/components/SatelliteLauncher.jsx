import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

export const ASSISTANT_HINT_DELAY_MS = 4000;
export const ASSISTANT_HINT_DURATION_MS = 8000;
export const SATELLITE_LABELS = {
  idle: "Ask Selene",
  hover: "Open assistant",
  streaming: "Selene is answering…",
  error: "Assistant unavailable",
};
const HINT_SESSION_KEY = "selene-assistant-hint-shown";

useGLTF.preload("/satellite.glb");

function SatelliteModel({ open, hovered, streaming, unread, error, reducedMotion, pointerX }) {
  const groupRef = useRef();
  const ringsRef = useRef([]);
  const ledRef = useRef();
  const { scene } = useGLTF("/satellite.glb");

  const satellite = useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material = Array.isArray(child.material)
            ? child.material.map((material) => material.clone())
            : child.material.clone();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => {
            if ("metalness" in material) {
              material.metalness = Math.max(material.metalness, 0.7);
              material.roughness = Math.min(material.roughness, 0.42);
            }
            if (/panel|solar/i.test(`${child.name} ${material.name}`) && "emissive" in material) {
              material.emissive.set("#164f83");
              material.emissiveIntensity = 0.45;
            }
          });
        }
      }
    });
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const max = Math.max(size.x, size.y, size.z) || 1;
    const scale = 2 / max;
    clone.scale.setScalar(scale);
    clone.rotation.y = Math.PI * 0.85;
    clone.position.copy(center).multiplyScalar(-scale);
    return clone;
  }, [scene]);

  useEffect(() => () => {
    satellite.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    });
  }, [satellite]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!groupRef.current) return;

    const ledColor = error ? "#ff4b4b" : streaming ? "#8fe9ff" : unread ? "#ffb85c" : "#87d2ff";
    if (ledRef.current && ledRef.current.material) {
      ledRef.current.material.color.set(ledColor);
      ledRef.current.material.emissive.set(ledColor);
    }

    if (reducedMotion) {
      groupRef.current.position.y = 0;
      groupRef.current.rotation.x = 0.32;
      groupRef.current.rotation.z = 0.25;
      groupRef.current.rotation.y = 0.52;
      if (ledRef.current?.material) ledRef.current.material.opacity = 0.9;
      ringsRef.current.forEach((ring) => {
        if (ring?.material) {
          ring.scale.setScalar(1);
          ring.material.opacity = 0.35;
        }
      });
      return;
    }

    groupRef.current.position.y = Math.sin(t * 1.2) * 0.18;
    groupRef.current.rotation.x = 0.32 + Math.sin(t * 1.6) * 0.12;
    groupRef.current.scale.setScalar(THREE.MathUtils.lerp(groupRef.current.scale.x, hovered ? 1.08 : 1, 0.12));
    groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, 0.25 + pointerX.current * 0.2, 0.08);
    groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, open ? 0.95 : 0.52 + pointerX.current * 0.38, 0.08);

    if (streaming && ringsRef.current.length) {
      ringsRef.current.forEach((ring, index) => {
        const phase = (t + index * 0.75) % 1.8;
        if (!ring.material || !ring.material.transparent) return;
        ring.scale.setScalar(0.55 + phase * 1.05);
        ring.material.opacity = Math.max(0.08, 0.6 - phase * 0.28);
      });
    }

    if (ledRef.current && ledRef.current.material) {
      const blink = streaming || unread ? 0.55 + Math.sin(t * (streaming ? 8 : 5)) * 0.45 : error ? 0.9 : 0.55;
      ledRef.current.material.opacity = blink;
    }
  });

  return (
    <group ref={groupRef} rotation={[0.32, 0.52, 0.25]}>
      <primitive object={satellite} />
      <mesh ref={ledRef} position={[0.7, 0.72, 0.45]}>
        <sphereGeometry args={[0.075, 16, 16]} />
        <meshStandardMaterial color="#87d2ff" emissive="#87d2ff" emissiveIntensity={4} transparent opacity={0.8} />
      </mesh>

      {[0, 1, 2].map((index) => (
        <mesh
          key={index}
          ref={(node) => {
            if (node) ringsRef.current[index] = node;
          }}
          rotation={[Math.PI / 2, 0, 0]}
          position={[-0.42, 0.04, 0.12]}
          visible={streaming && !error}
        >
          <torusGeometry args={[0.28 + index * 0.13, 0.018, 12, 48]} />
          <meshBasicMaterial color="#7fe0ff" transparent opacity={0.08} />
        </mesh>
      ))}
    </group>
  );
}

function SatelliteScene({ open, hovered, streaming, unread, error, reducedMotion, pointerX }) {
  return (
    <>
      <ambientLight intensity={1.15} color="#d5e8ff" />
      <directionalLight position={[2.5, 4, 4]} intensity={4.5} color="#fff1d2" />
      <directionalLight position={[-4, 1, -3]} intensity={3.2} color="#7abfff" />
      <pointLight position={[0, -1.5, 2]} intensity={2} distance={8} color={error ? "#ff5c5c" : unread ? "#ffbf68" : "#76d9ff"} />
      <SatelliteModel open={open} hovered={hovered} streaming={streaming} unread={unread} error={error} reducedMotion={reducedMotion} pointerX={pointerX} />
    </>
  );
}

export default function SatelliteLauncher({ open = false, onToggle = () => {}, streaming = false, unread = false, error = false }) {
  const [hovered, setHovered] = useState(false);
  const [hasWebGL, setHasWebGL] = useState(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isPageHidden, setIsPageHidden] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const launcherRef = useRef(null);
  const pointerX = useRef(0);
  const interactedRef = useRef(false);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    const loseContext = gl?.getExtension("WEBGL_lose_context");
    loseContext?.loseContext();
    setHasWebGL(Boolean(gl));

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyReducedMotion = () => setReducedMotion(media.matches);
    applyReducedMotion();
    media.addEventListener?.("change", applyReducedMotion);

    const handleVisibility = () => setIsPageHidden(document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    handleVisibility();

    return () => {
      media.removeEventListener?.("change", applyReducedMotion);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setHasOpened(true);
    setShowHint(false);
  }, [open]);

  useEffect(() => {
    let hideTimer;
    let alreadyShown = false;
    try {
      alreadyShown = Boolean(sessionStorage.getItem(HINT_SESSION_KEY));
    } catch {
      alreadyShown = false;
    }
    if (alreadyShown) return undefined;

    const showTimer = window.setTimeout(() => {
      if (interactedRef.current) return;
      setShowHint(true);
      try {
        sessionStorage.setItem(HINT_SESSION_KEY, "true");
      } catch {
        // The hint still works when storage is disabled; it simply won't persist.
      }
      hideTimer = window.setTimeout(() => setShowHint(false), ASSISTANT_HINT_DURATION_MS);
    }, ASSISTANT_HINT_DELAY_MS);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  const dismissHint = useCallback(() => {
    interactedRef.current = true;
    setShowHint(false);
    try {
      sessionStorage.setItem(HINT_SESSION_KEY, "true");
    } catch {
      // Dismissal is still honored for this component instance.
    }
  }, []);

  const handlePointerMove = useCallback((event) => {
    if (!launcherRef.current) return;
    const bounds = launcherRef.current.getBoundingClientRect();
    pointerX.current = THREE.MathUtils.clamp(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -1, 1);
  }, []);

  const toggleAssistant = useCallback(() => {
    dismissHint();
    onToggle();
  }, [dismissHint, onToggle]);

  const label = error
    ? SATELLITE_LABELS.error
    : streaming
      ? SATELLITE_LABELS.streaming
      : hovered
        ? SATELLITE_LABELS.hover
        : SATELLITE_LABELS.idle;

  if (hasWebGL !== true) {
    return (
      <div className="satellite-launcher-wrap">
        <button className={`chat-launcher satellite-fallback-launcher ${open ? "is-open" : ""}`} type="button" onClick={toggleAssistant} aria-label="Open assistant" aria-expanded={open}>
          <span className="launcher-astronaut">◉</span>
          {!open && <span className="launcher-pulse" />}
          <span className="satellite-fallback-label">Ask Selene</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`satellite-launcher-wrap ${open ? "is-open" : ""}`}>
      {!open && !hasOpened && <span className={`satellite-halo ${reducedMotion ? "is-static" : ""}`} aria-hidden="true"><i /><i /></span>}
      <button
        ref={launcherRef}
        className={`satellite-launcher ${open ? "is-open" : ""} ${hovered ? "is-hovered" : ""} ${streaming ? "is-streaming" : ""} ${unread ? "is-unread" : ""} ${error ? "is-error" : ""}`}
        type="button"
        onClick={toggleAssistant}
        onMouseEnter={() => { setHovered(true); dismissHint(); }}
        onMouseLeave={() => setHovered(false)}
        onMouseMove={handlePointerMove}
        onFocus={() => { setHovered(true); dismissHint(); }}
        onBlur={() => setHovered(false)}
        aria-label="Open assistant"
        aria-expanded={open}
      >
        <Canvas
          className="satellite-canvas"
          camera={{ position: [0, 0, 5], fov: 32 }}
          dpr={[1, Math.min(window.devicePixelRatio || 1, 2)]}
          gl={{ antialias: true, alpha: true }}
          frameloop={isPageHidden ? "never" : "always"}
          aria-hidden="true"
        >
          <SatelliteScene open={open} hovered={hovered} streaming={streaming} unread={unread} error={error} reducedMotion={reducedMotion} pointerX={pointerX} />
        </Canvas>
        <span className="satellite-label">
          <svg className="satellite-chat-icon" viewBox="0 0 16 13" aria-hidden="true">
            <path d="M2 1.5h12v8H7l-3.5 2v-2H2z" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
          </svg>
          <span>{error ? label : streaming ? label : hovered ? label : SATELLITE_LABELS.idle}</span>
          {unread && !open && <b className="satellite-unread-badge">1</b>}
        </span>
      </button>
      {showHint && (
        <aside className={`satellite-hint ${reducedMotion ? "is-static" : ""}`} role="status">
          <span>Need help choosing a landing site? Ask me.</span>
          <button type="button" className="satellite-hint-close" onClick={dismissHint} aria-label="Dismiss assistant hint">×</button>
        </aside>
      )}
    </div>
  );
}
