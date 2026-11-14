import { Suspense, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, Sparkles, useTexture } from "@react-three/drei";
import * as THREE from "three";
import "./main.css";

const LANDING_SITES = [
  { id: "shackleton", name: "Shackleton Rim", lat: -89.7, lon: 0, score: 92 },
  { id: "ridge", name: "Connecting Ridge", lat: -89.6, lon: 41.2, score: 86 },
  { id: "malapert", name: "Malapert Massif", lat: -85.9, lon: 0, score: 78 },
];

function surfacePosition(lat, lon, radius = 2.45) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon);
  return [
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

function Moon() {
  const [color, normal, elevation] = useTexture([
    "/tex/moon_color.jpg",
    "/tex/moon_normal.png",
    "/tex/moon_elevation.jpg",
  ]);
  color.colorSpace = THREE.SRGBColorSpace;
  normal.colorSpace = THREE.NoColorSpace;
  elevation.colorSpace = THREE.NoColorSpace;

  return (
    <mesh castShadow receiveShadow>
      <sphereGeometry args={[2.4, 192, 192]} />
      <meshStandardMaterial
        map={color}
        normalMap={normal}
        normalScale={[0.58, 0.58]}
        bumpMap={elevation}
        bumpScale={0.075}
        displacementMap={elevation}
        displacementScale={0.045}
        roughness={0.97}
        metalness={0}
      />
    </mesh>
  );
}

function Sun({ lightRef }) {
  useFrame(({ clock }) => {
    const angle = clock.elapsedTime * 0.08;
    lightRef.current?.position.set(Math.cos(angle) * 12, 5 + Math.sin(angle * 0.4) * 2, Math.sin(angle) * 12);
  });

  return (
    <mesh position={[11, 6, 8]}>
      <sphereGeometry args={[0.55, 32, 32]} />
      <meshBasicMaterial color="#ffe7a8" />
    </mesh>
  );
}

function Earth() {
  return (
    <group position={[8, 4, -11]}>
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
  const markerRefs = useRef([]);
  return (
    <>
      {LANDING_SITES.map((site, index) => {
        const position = surfacePosition(site.lat, site.lon);
        return (
          <group key={site.id} position={position}>
            <mesh
              ref={(node) => { markerRefs.current[index] = node; }}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(site);
              }}
              onPointerOver={(event) => {
                event.stopPropagation();
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => { document.body.style.cursor = "default"; }}
            >
              <sphereGeometry args={[selected?.id === site.id ? 0.11 : 0.075, 20, 20]} />
              <meshBasicMaterial color={selected?.id === site.id ? "#fff2b0" : "#b5ed9c"} />
            </mesh>
            <mesh scale={selected?.id === site.id ? 2 : 1.5}>
              <sphereGeometry args={[0.075, 16, 16]} />
              <meshBasicMaterial color="#b5ed9c" transparent opacity={0.22} />
            </mesh>
            {selected?.id === site.id && (
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

function SimulationScene({ selected, onSelect }) {
  const sunLight = useRef();
  return (
    <>
      <color attach="background" args={["#000"]} />
      <ambientLight intensity={0.012} color="#b7c8e8" />
      <directionalLight ref={sunLight} castShadow intensity={3.8} color="#fff4d8" shadow-mapSize={[2048, 2048]} />
      <directionalLight position={[8, -2, 6]} intensity={0.06} color="#8fb4ff" />
      <Sparkles count={140} scale={[55, 34, 45]} size={1.4} speed={0.12} opacity={0.5} color="#cfe4ff" />
      <Moon />
      <Earth />
      <Sun lightRef={sunLight} />
      <SiteMarkers selected={selected} onSelect={onSelect} />
      <GuideAstronaut selected={selected} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.06} minDistance={3.2} maxDistance={18} rotateSpeed={0.55} zoomSpeed={0.7} />
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
        <button className="floating-astronaut" type="button" onClick={() => setVisible((current) => !current)} aria-label="Show astronaut mission guidance">
          <span className="astronaut-helmet">◉</span>
          <span className="astronaut-thruster">✦</span>
        </button>
        {visible && <div className="floating-speech">{message}</div>}
      </Html>
    </group>
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
    setMessages((current) => [...current, { role: "user", text: value }, { role: "assistant", text: "Telemetry received. I’ll prepare that mission brief." }]);
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
        <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask about a landing site…" aria-label="Message Commander Nova" />
        <button type="submit" aria-label="Send message">↗</button>
      </form>
    </aside>
  );
}

export default function MainSimulation({ onBack }) {
  const [selected, setSelected] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  return (
    <div className="main-simulation">
      <div className="simulation-canvas">
        <Suspense fallback={<div className="scene-loading">LOADING LUNAR TELEMETRY…</div>}>
          <Canvas shadows camera={{ position: [0, 1.2, 8], fov: 42 }} dpr={[1, 2]}>
            <SimulationScene selected={selected} onSelect={setSelected} />
          </Canvas>
        </Suspense>
      </div>
      <button className="chat-launcher" type="button" onClick={() => setChatOpen(true)} aria-label="Open Commander Nova chat">
        <span className="launcher-astronaut">◉</span>
        <span className="launcher-pulse" />
      </button>
      <AstronautChat open={chatOpen} onClose={() => setChatOpen(false)} />
      <div className="simulation-backdrop" />
    </div>
  );
}
