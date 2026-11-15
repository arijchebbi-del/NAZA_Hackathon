import { Suspense, forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Stars, useAnimations, useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { computeMoonFrame, selenographicToVector, siteLighting, toSceneVectors } from "./lunarMath";
import NebulaSky from "./NebulaSky";
import { RegionHighlight, RegionPanel, RegionPicker, RegionPins } from "./MoonRegions";
import { REGIONS } from "./lunarRegions";
import SatelliteLauncher from "../components/SatelliteLauncher";
import "./main.css";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const MOON_RADIUS = 2.4;
// Directions of the Sun and the Earth are exact (ephemerides); distances and sizes are stylised.
const SUN_DISTANCE = 40;
const SUN_RADIUS = 2.6;
const EARTH_DISTANCE = 12;
const EARTH_RADIUS = 0.8;
const CAMERA_START = [0, -1.5, 8.5];
const MOON_SATURATION = 0.15; // 0 = gris pur, 1 = couleurs de la texture telles quelles
const SHOW_REGION_PINS = true; // petits points au centre de chaque région
const ENABLE_MILKY_WAY = false; // true => needs /public/tex/milkyway_4k.jpg (equirectangular, see notes)

const SPEEDS = [
  { label: "REAL TIME", value: 1 },
  { label: "1 MIN / S", value: 60 },
  { label: "1 H / S", value: 3600 },
  { label: "1 DAY / S", value: 86400 },
  { label: "10 DAYS / S", value: 864000 },
];

const LANDING_SITES = [
  { id: "shackleton", name: "Shackleton Rim", lat: -89.7, lon: 0, score: 92 },
  { id: "ridge", name: "Connecting Ridge", lat: -89.6, lon: 41.2, score: 86 },
  { id: "malapert", name: "Malapert Massif", lat: -85.9, lon: 0, score: 78 },
];

// Same longitude convention as the texture (east = increasing u = -Z), see lunarMath.js.
function surfacePosition(lat, lon, radius = MOON_RADIUS + 0.03) {
  const v = selenographicToVector(lat, lon, radius);
  return [v.x, v.y, v.z];
}

/* ------------------------------------------------------------------ */
/*  Moon                                                               */
/* ------------------------------------------------------------------ */
const Moon = forwardRef(function Moon(_, ref) {
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const [color, normal, elevation] = useTexture([
    "/tex/moon_color.jpg",
    "/tex/moon_normal.png",
    "/tex/moon_elevation.jpg",
  ]);

  useLayoutEffect(() => {
    color.colorSpace = THREE.SRGBColorSpace;
    normal.colorSpace = THREE.NoColorSpace;
    elevation.colorSpace = THREE.NoColorSpace;
    [color, normal, elevation].forEach((texture) => {
      texture.anisotropy = maxAnisotropy;
      texture.needsUpdate = true;
    });
  }, [color, normal, elevation, maxAnisotropy]);

  // No castShadow: a sphere shadowing itself only creates acne at the terminator.
  // The relief comes from the normal map (grazing light) + a light displacement.
  // (three ignores bumpMap when a normalMap is present, so it is dropped.)
  // Garantit une Lune grise : on désature la texture dans le shader (la texture peut être légèrement teintée).
  const onBeforeCompile = useCallback((shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
       float moonLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
       diffuseColor.rgb = mix(vec3(moonLuma), diffuseColor.rgb, ${MOON_SATURATION.toFixed(2)});`,
    );
  }, []);

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[MOON_RADIUS, 256, 256]} />
      <meshStandardMaterial
        onBeforeCompile={onBeforeCompile}
        customProgramCacheKey={() => "moon-gray"}
        map={color}
        normalMap={normal}
        normalScale={[1.15, 1.15]}
        displacementMap={elevation}
        displacementScale={0.045}
        displacementBias={-0.0225}
        color="#b9b9b9"
        roughness={1}
        metalness={0}
      />
    </mesh>
  );
});

/* ------------------------------------------------------------------ */
/*  GLB helpers                                                        */
/* ------------------------------------------------------------------ */
// Both GLBs come from Sketchfab with arbitrary scales (Sun: ±10, Earth: ±0.2 after node transforms).
// We measure them once and rescale to the radius we want, centred on the origin.
function useFittedModel(url, radius) {
  const { scene, animations } = useGLTF(url);
  const fit = useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    return { scale: radius / (Math.max(size.x, size.y, size.z) / 2), offset: center.negate() };
  }, [scene, radius]);
  return { scene, animations, fit };
}

function useGlowTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,244,214,1)");
    g.addColorStop(0.18, "rgba(255,205,120,.55)");
    g.addColorStop(0.5, "rgba(255,150,60,.12)");
    g.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/* ------------------------------------------------------------------ */
/*  Sun (sun.glb) — position is driven by SimulationDriver             */
/* ------------------------------------------------------------------ */
function SunBody({ groupRef, playing }) {
  const { scene, animations, fit } = useFittedModel("/models/sun.glb", SUN_RADIUS);
  const { actions } = useAnimations(animations, scene);
  const glow = useGlowTexture();

  useLayoutEffect(() => {
    scene.traverse((object) => {
      if (!object.isMesh) return;
      const material = object.material;
      material.toneMapped = false; // keep the star blazing white/orange
      if (object.name.startsWith("UnstableStarref")) {
        // Outer shell uses KHR_materials_transmission: it forces an extra full-scene render pass.
        // Replace it by a cheap additive halo.
        material.transmission = 0;
        material.transparent = true;
        material.opacity = 0.55;
        material.blending = THREE.AdditiveBlending;
        material.depthWrite = false;
      } else {
        material.emissiveIntensity = 1.5;
      }
      material.needsUpdate = true;
    });
  }, [scene]);

  useEffect(() => {
    const action = actions["Take 001"] ?? Object.values(actions)[0];
    action?.reset().play();
    return () => action?.stop();
  }, [actions]);

  useFrame(() => {
    const action = actions["Take 001"] ?? Object.values(actions)[0];
    if (action) action.timeScale = playing ? 1 : 0.25; // keep the star alive when paused
  });

  return (
    <group ref={groupRef}>
      <group scale={fit.scale}>
        <primitive object={scene} position={fit.offset} />
      </group>
      <sprite scale={[SUN_RADIUS * 9, SUN_RADIUS * 9, 1]}>
        <spriteMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} opacity={0.9} />
      </sprite>
      <Html distanceFactor={14} position={[0, SUN_RADIUS * 1.5, 0]}>
        <span className="space-label">SUN</span>
      </Html>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Earth (earth.glb)                                                  */
/* ------------------------------------------------------------------ */
function EarthBody({ groupRef, playing }) {
  const { scene, animations, fit } = useFittedModel("/models/earth.glb", EARTH_RADIUS);
  const { actions } = useAnimations(animations, scene);
  const spin = useRef(null);

  useLayoutEffect(() => {
    scene.traverse((object) => {
      if (object.isMesh && object.material) {
        // The emissive map of this model is the city-lights layer: great on the night side,
        // so keep it, just tone it down a bit.
        object.material.emissiveIntensity = 1.2;
        object.material.needsUpdate = true;
      }
    });
  }, [scene]);

  useEffect(() => {
    // The file has two clips targeting the same node ("EarthAction" and "Shader Nodetree"):
    // playing both makes them fight, so only the rotation clip is played.
    spin.current = actions["Earth|EarthAction"] ?? Object.values(actions)[0] ?? null;
    spin.current?.reset().play();
    return () => spin.current?.stop();
  }, [actions]);

  useFrame(() => {
    if (spin.current) spin.current.timeScale = playing ? 1 : 0;
  });

  return (
    <group ref={groupRef}>
      <group scale={fit.scale}>
        <primitive object={scene} position={fit.offset} />
      </group>
      <mesh scale={1.045}>
        <sphereGeometry args={[EARTH_RADIUS, 48, 48]} />
        <meshBasicMaterial color="#6eb5ff" transparent opacity={0.1} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <Html distanceFactor={12} position={[0, EARTH_RADIUS * 1.5, 0]}>
        <span className="space-label">EARTH / LINK HOME</span>
      </Html>
    </group>
  );
}

useGLTF.preload("/models/earth.glb");
useGLTF.preload("/models/sun.glb");

/* ------------------------------------------------------------------ */
/*  Optional Milky Way sky sphere                                      */
/* ------------------------------------------------------------------ */
function MilkyWay() {
  const map = useTexture("/tex/milkyway_4k.jpg");
  useLayoutEffect(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
  }, [map]);
  return (
    <mesh>
      <sphereGeometry args={[500, 64, 32]} />
      <meshBasicMaterial map={map} side={THREE.BackSide} color="#7f8794" toneMapped={false} depthWrite={false} fog={false} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/*  Simulation clock: moves Sun / Earth / lights every frame           */
/* ------------------------------------------------------------------ */
function SimulationDriver({ simulationDate, playing, speed, onTick, sunLight, earthLight, sunBody, earthBody }) {
  const t = useRef(simulationDate.getTime());
  const emitted = useRef(t.current);
  const sinceEmit = useRef(0);

  const apply = useCallback((ms) => {
    const frame = computeMoonFrame(new Date(ms));
    const { sun, earth } = toSceneVectors(frame, { sunDistance: SUN_DISTANCE, earthDistance: EARTH_DISTANCE });
    sunLight.current?.position.set(...sun);
    sunBody.current?.position.set(...sun);
    earthBody.current?.position.set(...earth);
    if (earthLight.current) {
      earthLight.current.position.set(...earth);
      earthLight.current.intensity = 0.02 + 0.1 * frame.earthIlluminatedFraction; // earthshine
    }
  }, [sunLight, earthLight, sunBody, earthBody]);

  // Date changed from the UI (scrub, NOW, ±1 day): jump there.
  useLayoutEffect(() => {
    const ms = simulationDate.getTime();
    if (ms !== emitted.current) {
      t.current = ms;
      emitted.current = ms;
    }
    apply(t.current);
  }, [simulationDate, apply]);

  useFrame((_, delta) => {
    if (!playing) return;
    t.current += Math.min(delta, 0.1) * 1000 * speed;
    apply(t.current);
    sinceEmit.current += delta;
    if (sinceEmit.current > 0.1) {
      sinceEmit.current = 0;
      emitted.current = Math.trunc(t.current);
      onTick(new Date(emitted.current));
    }
  });
  return null;
}

/* ------------------------------------------------------------------ */
/*  Camera focus (Moon stays the default, centred target)              */
/* ------------------------------------------------------------------ */
function CameraFocus({ request, bodies }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls);
  const s = useRef({
    name: "moon", progress: 1,
    startTarget: new THREE.Vector3(), startCamera: new THREE.Vector3(),
    offset: new THREE.Vector3(...CAMERA_START), last: new THREE.Vector3(),
    pos: new THREE.Vector3(), goal: new THREE.Vector3(),
  });

  const positionOf = (name, out) => {
    const object = bodies[name]?.current;
    return object ? out.copy(object.position) : out.set(0, 0, 0);
  };

  useEffect(() => {
    if (!request || !controls) return;
    const state = s.current;
    state.name = request.name;
    state.progress = 0;
    state.startTarget.copy(controls.target);
    state.startCamera.copy(camera.position);
    const toSun = bodies.sun.current.position.clone().normalize();
    if (request.name === "moon") state.offset.set(...CAMERA_START);
    else if (request.name === "earth") state.offset.copy(toSun).multiplyScalar(4.6).add(new THREE.Vector3(0, 0.9, 0));
    else state.offset.copy(toSun).multiplyScalar(-12);
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    if (!controls) return;
    const state = s.current;
    positionOf(state.name, state.pos);
    if (state.progress < 1) {
      state.progress = Math.min(1, state.progress + delta / 1.2);
      const e = 1 - Math.pow(1 - state.progress, 3);
      state.goal.copy(state.pos).add(state.offset);
      controls.target.lerpVectors(state.startTarget, state.pos, e);
      camera.position.lerpVectors(state.startCamera, state.goal, e);
    } else if (state.name !== "moon") {
      camera.position.add(state.pos).sub(state.last); // follow the moving body
      controls.target.copy(state.pos);
    }
    state.last.copy(state.pos);
  });
  return null;
}

/* ------------------------------------------------------------------ */
/*  Landing site markers                                               */
/* ------------------------------------------------------------------ */
function SiteMarkers({ selected, onSelect, frame }) {
  return (
    <>
      {LANDING_SITES.map((site) => {
        const isSelected = selected?.id === site.id;
        const light = siteLighting(frame, site.lat, site.lon);
        return (
          <group key={site.id} position={surfacePosition(site.lat, site.lon)}>
            <mesh
              onClick={(event) => { event.stopPropagation(); onSelect(site); }}
              onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = "pointer"; }}
              onPointerOut={() => { document.body.style.cursor = "default"; }}
            >
              <sphereGeometry args={[isSelected ? 0.11 : 0.075, 20, 20]} />
              <meshBasicMaterial color={isSelected ? "#fff2b0" : "#b5ed9c"} />
            </mesh>
            <mesh scale={isSelected ? 2 : 1.5}>
              <sphereGeometry args={[0.075, 16, 16]} />
              <meshBasicMaterial color="#b5ed9c" transparent opacity={0.22} />
            </mesh>
            {isSelected && (
              <Html distanceFactor={7} position={[0.14, 0.14, 0]}>
                <div className="site-tooltip">
                  <strong>{site.name}</strong>
                  <span>{Math.abs(site.lat).toFixed(1)}° {site.lat < 0 ? "S" : "N"} · {site.lon.toFixed(1)}° E</span>
                  <span>Sun {light.sunElevationDeg.toFixed(1)}° · {light.sunVisible ? "lit" : "shadow"}</span>
                  <span>Earth {light.earthElevationDeg.toFixed(1)}° · {light.earthVisible ? "in sight" : "hidden"}</span>
                  <b>{site.score} / 100</b>
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Scene                                                              */
/* ------------------------------------------------------------------ */
function SimulationScene({ selected, onSelect, frame, simulationDate, playing, speed, onTick, focusRequest, regions }) {
  const sunLight = useRef();
  const earthLight = useRef();
  const sunBody = useRef();
  const earthBody = useRef();
  const moonRef = useRef();
  const bodies = useMemo(() => ({ sun: sunBody, earth: earthBody }), []);
  const { hovered, selected: selectedRegion, onHover, onSelect: onRegionSelect, onCursor } = regions;

  return (
    <>
      <color attach="background" args={["#000"]} />
      {/* Lumières NEUTRES : aucune couleur rose ici. Le rose n'existe que dans <NebulaSky /> (non éclairé). */}
      <ambientLight intensity={0.012} color="#ffffff" />
      <directionalLight ref={sunLight} intensity={4} color="#ffffff" />
      <directionalLight ref={earthLight} intensity={0.06} color="#a8c0ff" />
      <NebulaSky />
      {/* Fixed far starfield: it only rotates with the OrbitControls camera, like the real sky. */}
      <Stars radius={300} depth={90} count={9000} factor={6} saturation={0.12} fade speed={0} />
      {ENABLE_MILKY_WAY && <MilkyWay />}
      <Moon ref={moonRef} />
      {SHOW_REGION_PINS && <RegionPins regions={REGIONS} activeId={(hovered ?? selectedRegion)?.id} />}
      {selectedRegion && <RegionHighlight region={selectedRegion} moonRef={moonRef} selected />}
      {hovered && hovered.id !== selectedRegion?.id && <RegionHighlight region={hovered} moonRef={moonRef} />}
      <RegionPicker moonRef={moonRef} onHover={onHover} onSelect={onRegionSelect} onCursor={onCursor} />
      <SunBody groupRef={sunBody} playing={playing} />
      <EarthBody groupRef={earthBody} playing={playing} />
      <SiteMarkers selected={selected} onSelect={onSelect} frame={frame} />
      <SimulationDriver
        simulationDate={simulationDate} playing={playing} speed={speed} onTick={onTick}
        sunLight={sunLight} earthLight={earthLight} sunBody={sunBody} earthBody={earthBody}
      />
      <OrbitControls makeDefault enableDamping dampingFactor={0.06} enablePan={false} minDistance={3.2} maxDistance={18} rotateSpeed={0.55} zoomSpeed={0.7} />
      <CameraFocus request={focusRequest} bodies={bodies} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Guide astronaut (unchanged, + sun elevation in the message)        */
/* ------------------------------------------------------------------ */
function AstronautModel() {
  const astronaut = useRef();
  const { scene } = useGLTF("/astronaut_by_jungle_jim.glb");

  useFrame(({ clock }) => {
    if (!astronaut.current) return;
    astronaut.current.rotation.y = Math.sin(clock.elapsedTime * 0.45) * 0.45;
    astronaut.current.rotation.z = Math.sin(clock.elapsedTime * 0.32) * 0.08;
  });

  return (
    <group ref={astronaut} rotation={[0.05, -0.3, -0.08]} scale={0.7}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload("/astronaut_by_jungle_jim.glb");

function GuideAstronaut({ selected, frame }) {
  const [visible, setVisible] = useState(false);
  const light = selected ? siteLighting(frame, selected.lat, selected.lon) : null;
  const message = selected
    ? `${selected.name} selected. Score ${selected.score}/100. Sun ${light.sunElevationDeg.toFixed(1)}° above the horizon (${light.sunVisible ? "lit" : "in shadow"}), Earth ${light.earthElevationDeg.toFixed(1)}°.`
    : "Select a glowing landing region and I’ll read its mission signal.";

  return (
    <div className="floating-astronaut-wrap">
      <button className="floating-astronaut" type="button" onClick={() => setVisible((current) => !current)} aria-label="Show astronaut mission guidance">
        <Canvas orthographic camera={{ position: [0, 0, 5], zoom: 82 }} gl={{ alpha: true, antialias: true }}>
          <ambientLight intensity={1.4} />
          <directionalLight position={[2, 3, 4]} intensity={2.2} color="#fff4e8" />
          <AstronautModel />
        </Canvas>
      </button>
      {visible && <div className="floating-speech">{message}</div>}
    </div>
  );
}

function AstronautChat({ open, onClose }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Welcome aboard. I can help compare lunar landing sites." },
  ]);

  function sendMessage(value) {
    const text = value.trim();
    if (!text) return;
    setMessages((current) => [...current, { role: "user", text }, { role: "assistant", text: "Telemetry received. I’ll prepare that mission brief." }]);
    setMessage("");
  }

  function submit(event) {
    event.preventDefault();
    const value = message.trim();
    if (!value) return;
    sendMessage(value);
  }

  if (!open) return null;

  return (
    <aside className="astronaut-chat">
      <div className="chat-header">
        <div className="astronaut-avatar">◉</div>
        <div><span className="chat-kicker">SELENE ASSIST</span><strong>Commander Nova</strong><small>Mission systems online</small></div>
        <button className="chat-close" type="button" onClick={onClose} aria-label="Close chat">×</button>
      </div>
      <div className="chat-messages">
        {messages.map((item, index) => <div key={`${item.role}-${index}`} className={`chat-message ${item.role}`}>{item.text}</div>)}
        {messages.length === 1 && messages[0].role === "assistant" && (
          <div className="chat-suggestions" aria-label="Suggested questions">
            {[
              "Compare Shackleton and Malapert",
              "Why is the Sun so low at the south pole?",
              "Which site has the best Earth visibility?",
            ].map((suggestion) => (
              <button key={suggestion} type="button" className="chat-suggestion" onClick={() => sendMessage(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
      <form className="chat-input" onSubmit={submit}>
        <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask about a landing site, a date, or a comparison…" aria-label="Message Commander Nova" />
        <button type="submit" aria-label="Send message">↗</button>
      </form>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Time control (DOM overlay)                                         */
/* ------------------------------------------------------------------ */
const DAY_MS = 86_400_000;
const fmtDeg = (value, pos, neg) => `${Math.abs(value).toFixed(1)}°${value >= 0 ? pos : neg}`;

function TimeControl({ date, frame, playing, speed, onDate, onPlaying, onSpeed, onFocus }) {
  return (
    <div className="time-control">
      <div className="time-row">
        <span className="time-label">SIMULATION · UTC</span>
        <input
          type="datetime-local"
          value={date.toISOString().slice(0, 16)}
          onChange={(event) => {
            if (!event.target.value) return;
            const next = new Date(`${event.target.value}:00Z`);
            if (!Number.isNaN(next.getTime())) onDate(next);
          }}
          aria-label="Simulation date (UTC)"
        />
      </div>
      <div className="time-row">
        <button type="button" onClick={() => onDate(new Date(date.getTime() - DAY_MS))}>−1 D</button>
        <button type="button" className="time-play" onClick={() => onPlaying(!playing)}>{playing ? "❚❚ PAUSE" : "▶ PLAY"}</button>
        <button type="button" onClick={() => onDate(new Date(date.getTime() + DAY_MS))}>+1 D</button>
        <button type="button" onClick={() => onDate(new Date())}>NOW</button>
        <select value={speed} onChange={(event) => onSpeed(Number(event.target.value))} aria-label="Simulation speed">
          {SPEEDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
      <div className="time-row time-focus">
        <span className="time-label">FOCUS</span>
        <button type="button" onClick={() => onFocus("moon")}>MOON</button>
        <button type="button" onClick={() => onFocus("earth")}>EARTH</button>
        <button type="button" onClick={() => onFocus("sun")}>SUN</button>
      </div>
      <div className="time-readout">
        <span>SUBSOLAR {fmtDeg(frame.subsolar.lat, "N", "S")} {fmtDeg(frame.subsolar.lon, "E", "W")}</span>
        <span>LIBRATION {frame.libration.lon >= 0 ? "+" : "−"}{Math.abs(frame.libration.lon).toFixed(1)}° / {frame.libration.lat >= 0 ? "+" : "−"}{Math.abs(frame.libration.lat).toFixed(1)}°</span>
        <span>EARTH {Math.round(frame.earthDistanceKm).toLocaleString("en-US")} km · {(frame.earthIlluminatedFraction * 100).toFixed(0)}% lit</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function MainSimulation({ onBack }) {
  const [selected, setSelected] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [simulationDate, setSimulationDate] = useState(() => new Date());
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(86400);
  const [focusRequest, setFocusRequest] = useState(null);
  const focusCount = useRef(0);

  // Régions lunaires détectées par le Raycaster
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const cursorRef = useRef(null);
  const handleCursor = useCallback((cursor) => {
    // Mise à jour directe du DOM : évite un re-render React à chaque mouvement de souris.
    if (!cursorRef.current) return;
    cursorRef.current.textContent = cursor
      ? `CURSOR ${Math.abs(cursor.lat).toFixed(2)}°${cursor.lat >= 0 ? "N" : "S"} ${Math.abs(cursor.lon).toFixed(2)}°${cursor.lon >= 0 ? "E" : "W"}`
      : "CURSOR —";
  }, []);
  const regions = useMemo(
    () => ({ hovered: hoveredRegion, selected: selectedRegion, onHover: setHoveredRegion, onSelect: setSelectedRegion, onCursor: handleCursor }),
    [hoveredRegion, selectedRegion, handleCursor],
  );

  // Recomputed at ~10 Hz while playing (the 3D bodies themselves move every frame in SimulationDriver).
  const frame = useMemo(() => computeMoonFrame(simulationDate), [simulationDate]);

  return (
    <div className="main-simulation">
      <div className="simulation-canvas">
        <Suspense fallback={<div className="scene-loading">LOADING LUNAR TELEMETRY…</div>}>
          <Canvas camera={{ position: CAMERA_START, fov: 42, near: 0.1, far: 1200 }} dpr={[1, 2]} gl={{ antialias: true }}>
            <SimulationScene
              selected={selected} onSelect={setSelected} frame={frame}
              simulationDate={simulationDate} playing={playing} speed={speed}
              onTick={setSimulationDate} focusRequest={focusRequest} regions={regions}
            />
          </Canvas>
        </Suspense>
      </div>
      <RegionPanel hovered={hoveredRegion} selected={selectedRegion} cursorRef={cursorRef} onClear={() => setSelectedRegion(null)} />
      <GuideAstronaut selected={selected} frame={frame} />
      <TimeControl
        date={simulationDate} frame={frame} playing={playing} speed={speed}
        onDate={setSimulationDate} onPlaying={setPlaying} onSpeed={setSpeed}
        onFocus={(name) => setFocusRequest({ name, n: (focusCount.current += 1) })}
      />
      <SatelliteLauncher
        open={chatOpen}
        onToggle={() => setChatOpen((current) => !current)}
        streaming={false}
        unread={false}
        error={false}
      />
      <AstronautChat open={chatOpen} onClose={() => setChatOpen(false)} />
      <div className="simulation-backdrop" />
    </div>
  );
}
