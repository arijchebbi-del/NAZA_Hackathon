import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Sparkles, Stars, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { elevationDeg, getLunarState } from "./lunarMath";
import "./main.css";

const LANDING_SITES = [
  { id: "shackleton", name: "Shackleton Rim", lat: -89.7, lon: 0, score: 92 },
  { id: "ridge", name: "Connecting Ridge", lat: -89.6, lon: 41.2, score: 86 },
  { id: "malapert", name: "Malapert Massif", lat: -85.9, lon: 0, score: 78 },
];

const SUN_DISTANCE = 30;
const EARTH_DISTANCE = 15; // distance visuelle (pas à l'échelle)
const scale = (v, k) => v.map((c) => c * k);

// Même convention que lunarMath.js ET que l'UV de SphereGeometry (lon 0 au centre de la texture) :
// l'est lunaire va vers -Z. (L'ancienne version avait +Z, donc marqueurs en miroir par rapport à la texture.)
function surfacePosition(lat, lon, radius = 2.45) {
  const la = THREE.MathUtils.degToRad(lat);
  const lo = THREE.MathUtils.degToRad(lon);
  return [radius * Math.cos(la) * Math.cos(lo), radius * Math.sin(la), -radius * Math.cos(la) * Math.sin(lo)];
}

/* ---------- Lune : relief rasant (normal + displacement), éclairée par le Soleil réel ---------- */
function Moon() {
  const gl = useThree((s) => s.gl);
  const [color, normal, elevation] = useTexture([
    "/tex/moon_color.jpg",
    "/tex/moon_normal.png",
    "/tex/moon_elevation.jpg",
  ]);
  useMemo(() => {
    const aniso = gl.capabilities.getMaxAnisotropy();
    color.colorSpace = THREE.SRGBColorSpace;
    normal.colorSpace = THREE.NoColorSpace;
    elevation.colorSpace = THREE.NoColorSpace;
    [color, normal, elevation].forEach((t) => { t.anisotropy = aniso; t.needsUpdate = true; });
  }, [gl, color, normal, elevation]);

  return (
    <mesh castShadow receiveShadow>
      <sphereGeometry args={[2.4, 256, 256]} />
      <meshStandardMaterial
        map={color}
        normalMap={normal}
        normalScale={new THREE.Vector2(1.2, 1.2)}
        displacementMap={elevation}
        displacementScale={0.05}
        displacementBias={-0.02}
        roughness={1}
        metalness={0}
      />
    </mesh>
  );
}

function SunBody({ position }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.9, 32, 32]} />
        <meshBasicMaterial color="#fff2c4" toneMapped={false} />
      </mesh>
      <mesh scale={1.8}>
        <sphereGeometry args={[0.9, 24, 24]} />
        <meshBasicMaterial color="#ffd9a0" transparent opacity={0.12} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function EarthBody({ position }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.72, 48, 48]} />
        <meshStandardMaterial color="#285d9f" roughness={0.75} metalness={0.05} emissive="#07182f" emissiveIntensity={0.4} />
      </mesh>
      <mesh scale={1.12}>
        <sphereGeometry args={[0.72, 32, 32]} />
        <meshBasicMaterial color="#6eb5ff" transparent opacity={0.12} side={THREE.BackSide} />
      </mesh>
      <Html distanceFactor={10} position={[0, 1, 0]}>
        <span className="space-label">EARTH / LINK HOME</span>
      </Html>
    </group>
  );
}

function SiteMarkers({ selected, onSelect }) {
  return (
    <>
      {LANDING_SITES.map((site) => {
        const position = surfacePosition(site.lat, site.lon);
        const active = selected?.id === site.id;
        return (
          <group key={site.id} position={position}>
            <mesh
              onClick={(event) => { event.stopPropagation(); onSelect(site); }}
              onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = "pointer"; }}
              onPointerOut={() => { document.body.style.cursor = "default"; }}
            >
              <sphereGeometry args={[active ? 0.11 : 0.075, 20, 20]} />
              <meshBasicMaterial color={active ? "#fff2b0" : "#b5ed9c"} />
            </mesh>
            <mesh scale={active ? 2 : 1.5}>
              <sphereGeometry args={[0.075, 16, 16]} />
              <meshBasicMaterial color="#b5ed9c" transparent opacity={0.22} />
            </mesh>
            {active && (
              <Html distanceFactor={7} position={[0.14, 0.14, 0]}>
                <div className="site-tooltip">
                  <strong>{site.name}</strong>
                  <span>{Math.abs(site.lat).toFixed(1)}° S · {site.lon.toFixed(1)}° E</span>
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

function GuideAstronaut({ selected }) {
  const [visible, setVisible] = useState(false);
  const message = selected
    ? `${selected.name} selected. Score ${selected.score}/100. I recommend checking its sunlight window next.`
    : "Select a glowing landing region and I’ll read its mission signal.";
  return (
    <group position={[-3.9, 2.2, -1.5]}>
      <Html distanceFactor={7} center>
        <button className="floating-astronaut" type="button" onClick={() => setVisible((c) => !c)} aria-label="Show astronaut mission guidance">
          <span className="astronaut-helmet">◉</span>
          <span className="astronaut-thruster">✦</span>
        </button>
        {visible && <div className="floating-speech">{message}</div>}
      </Html>
    </group>
  );
}

function SimulationScene({ selected, onSelect, lunar }) {
  const sunPos = useMemo(() => scale(lunar.sunDir, SUN_DISTANCE), [lunar]);
  const earthPos = useMemo(() => scale(lunar.earthDir, EARTH_DISTANCE), [lunar]);
  return (
    <>
      <color attach="background" args={["#000"]} />
      <ambientLight intensity={0.012} color="#b7c8e8" />
      {/* Soleil réel : lumière rasante aux pôles, ombres des reliefs */}
      <directionalLight
        position={sunPos}
        intensity={4.5}
        color="#fff4d8"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-3.2}
        shadow-camera-right={3.2}
        shadow-camera-top={3.2}
        shadow-camera-bottom={-3.2}
        shadow-camera-near={10}
        shadow-camera-far={60}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {/* Earthshine très faible, dans la vraie direction de la Terre */}
      <directionalLight position={earthPos} intensity={0.05} color="#8fb4ff" />

      {/* Fond : étoiles très lointaines → réagit au parallaxe d'OrbitControls */}
      <Stars radius={300} depth={80} count={9000} factor={6} saturation={0.1} fade speed={0} />
      <Sparkles count={140} scale={[55, 34, 45]} size={1.4} speed={0.12} opacity={0.5} color="#cfe4ff" />

      <Moon />
      <SunBody position={sunPos} />
      <EarthBody position={earthPos} />
      <SiteMarkers selected={selected} onSelect={onSelect} />
      <GuideAstronaut selected={selected} />

      {/* Lune en (0,0,0) = cible des contrôles → toujours centrée */}
      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        enableDamping
        dampingFactor={0.06}
        minDistance={3.2}
        maxDistance={18}
        rotateSpeed={0.55}
        zoomSpeed={0.7}
        enablePan={false}
      />
    </>
  );
}

/* ---------- Contrôle temporel ---------- */
const panel = {
  position: "absolute", left: 28, bottom: 24, zIndex: 3, display: "flex", flexDirection: "column", gap: 8,
  padding: "12px 14px", border: "1px solid var(--line)", background: "rgba(0,0,0,.6)", backdropFilter: "blur(12px)",
  font: "10px var(--mono)", color: "var(--dim)", letterSpacing: ".08em",
};
const btn = { border: "1px solid var(--line)", background: "rgba(243,239,232,.08)", color: "var(--ink)", font: "10px var(--mono)", padding: "5px 8px", cursor: "pointer" };

function TimePanel({ date, setDate, playing, setPlaying, speed, setSpeed, lunar, selected }) {
  const shift = (h) => setDate((d) => new Date(d.getTime() + h * 3600e3));
  const sunEl = selected ? elevationDeg(selected.lat, selected.lon, lunar.sunDir) : null;
  const earthEl = selected ? elevationDeg(selected.lat, selected.lon, lunar.earthDir) : null;
  return (
    <div style={panel}>
      <span>SIMULATION DATE (UTC)</span>
      <input
        type="datetime-local"
        value={date.toISOString().slice(0, 16)}
        onChange={(e) => { const d = new Date(`${e.target.value}Z`); if (!Number.isNaN(d.getTime())) setDate(d); }}
        style={{ ...btn, colorScheme: "dark" }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button style={btn} onClick={() => shift(-24)}>−1 d</button>
        <button style={btn} onClick={() => shift(24)}>+1 d</button>
        <button style={btn} onClick={() => setDate(new Date())}>NOW</button>
        <button style={btn} onClick={() => setPlaying((p) => !p)}>{playing ? "PAUSE" : "PLAY"}</button>
        <select style={btn} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          {[1, 6, 24, 72].map((h) => <option key={h} value={h}>{h} h/s</option>)}
        </select>
      </div>
      <span>SUB-SOLAR {lunar.subSolar.lat.toFixed(1)}° / {lunar.subSolar.lon.toFixed(1)}°</span>
      <span>LIBRATION {lunar.libration.lon.toFixed(1)}° / {lunar.libration.lat.toFixed(1)}° · EARTH {Math.round(lunar.earthDistKm).toLocaleString("en-US")} km</span>
      {selected && <span>{selected.name.toUpperCase()} · SUN {sunEl.toFixed(1)}° · EARTH {earthEl.toFixed(1)}°</span>}
    </div>
  );
}

function AstronautChat({ open, onClose }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Welcome aboard. I can help compare lunar landing sites." },
  ]);
  function submit(event) {
    event.preventDefault();
    const value = message.trim();
    if (!value) return;
    setMessages((c) => [...c, { role: "user", text: value }, { role: "assistant", text: "Telemetry received. I’ll prepare that mission brief." }]);
    setMessage("");
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
      </div>
      <form className="chat-input" onSubmit={submit}>
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ask about a landing site…" aria-label="Message Commander Nova" />
        <button type="submit" aria-label="Send message">↗</button>
      </form>
    </aside>
  );
}

export default function MainSimulation({ onBack }) {
  const [selected, setSelected] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [simulationDate, setSimulationDate] = useState(() => new Date());
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(6); // heures simulées par seconde réelle

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => setSimulationDate((d) => new Date(d.getTime() + speed * 360e3)), 100);
    return () => clearInterval(id);
  }, [playing, speed]);

  const lunar = useMemo(() => getLunarState(simulationDate), [simulationDate]);

  return (
    <div className="main-simulation">
      <div className="simulation-canvas">
        <Suspense fallback={<div className="scene-loading">LOADING LUNAR TELEMETRY…</div>}>
          <Canvas shadows camera={{ position: [6.5, -4.2, 3.5], fov: 42, near: 0.1, far: 1000 }} dpr={[1, 2]}>
            <SimulationScene selected={selected} onSelect={setSelected} lunar={lunar} />
          </Canvas>
        </Suspense>
      </div>
      <TimePanel
        date={simulationDate} setDate={setSimulationDate} playing={playing} setPlaying={setPlaying}
        speed={speed} setSpeed={setSpeed} lunar={lunar} selected={selected}
      />
      <button className="chat-launcher" type="button" onClick={() => setChatOpen(true)} aria-label="Open Commander Nova chat">
        <span className="launcher-astronaut">◉</span>
        <span className="launcher-pulse" />
      </button>
      <AstronautChat open={chatOpen} onClose={() => setChatOpen(false)} />
      <div className="simulation-backdrop" />
    </div>
  );
}