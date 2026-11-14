import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls, Stars, Html } from "@react-three/drei";

/*
  SpaceExplorer — a floating sphere of fragments you can fly around in.
  Controls: click to capture the mouse, then
    mouse = look · W/A/S/D = move · Space = up · Shift = down · F = boost · Esc = release
  Install: npm i three @react-three/fiber @react-three/drei
  Use:     <SpaceExplorer title="174 sites are floating" siteName="Shackleton Rim" onLand={(n) => console.log(n)} />
*/

const SPHERE_R = 7;
const COLORS = ["#f2f2f5", "#f2f2f5", "#f2f2f5", "#f2f2f5", "#e8708f", "#8fd1c9", "#c9d28a", "#3b4f7c", "#e0885a", "#8a3b4a", "#9b6bb0", "#0e0e12"];

const PLANETS = [
  { x: -78, y: 0.4, r: 0.55, c: "#16161a" },
  { x: -64, y: -0.3, r: 0.25, c: "#8a5cf0" },
  { x: -52, y: 0.2, r: 0.6, c: "#ee5fa7" },
  { x: -40, y: -0.1, r: 0.3, c: "#ee5fa7" },
  { x: -28, y: 0.3, r: 0.4, c: "#4fc3d4" },
  { x: 24, y: -0.2, r: 0.35, c: "#f2f2f5" },
  { x: 32, y: 0.1, r: 0.2, c: "#8fd1c9" },
  { x: 44, y: 0.0, r: 0.8, c: "#b6e36a" },
  { x: 56, y: 0.4, r: 0.4, c: "#ee5fa7" },
  { x: 66, y: -0.2, r: 0.2, c: "#e6e04a" },
  { x: 80, y: 0.5, r: 0.7, c: "#f0922b" },
];

/* ---------- The sphere made of floating fragments ---------- */
function Fragments({ count = 1600 }) {
  const mesh = useRef();
  const group = useRef();

  useEffect(() => {
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = SPHERE_R * (0.55 + 0.45 * Math.random());
      o.position.set(r * s * Math.cos(t), r * u, r * s * Math.sin(t));
      o.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const k = 0.22 + Math.random() * 0.45;
      o.scale.set(k, k * (0.8 + Math.random() * 0.7), k * (0.7 + Math.random() * 0.6));
      o.updateMatrix();
      mesh.current.setMatrixAt(i, o.matrix);
      col.set(COLORS[Math.floor(Math.random() * COLORS.length)]);
      mesh.current.setColorAt(i, col);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.instanceColor.needsUpdate = true;
  }, [count]);

  useFrame((_, dt) => {
    group.current.rotation.y += dt * 0.04;
  });

  return (
    <group ref={group}>
      <instancedMesh ref={mesh} args={[null, null, count]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.35} metalness={0.05} />
      </instancedMesh>
    </group>
  );
}

/* ---------- Small planets lined up on the horizon ---------- */
function Planets() {
  return (
    <>
      {PLANETS.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, 0]}>
          <sphereGeometry args={[p.r, 24, 24]} />
          <meshStandardMaterial color={p.c} roughness={0.4} />
        </mesh>
      ))}
    </>
  );
}

/* ---------- Other explorers (bots), each with a name tag ---------- */
function Bot({ name, radius, speed, phase, height }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    const a = clock.elapsedTime * speed + phase;
    ref.current.position.set(Math.cos(a) * radius, height + Math.sin(a * 2) * 0.6, Math.sin(a) * radius);
    ref.current.rotation.y = -a;
  });
  return (
    <group ref={ref}>
      <mesh>
        <capsuleGeometry args={[0.22, 0.5, 6, 12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      <Html center distanceFactor={14} position={[0, 0.9, 0]} style={{ pointerEvents: "none" }}>
        <div style={styles.tag}>
          <span style={styles.dot} />
          {name}
        </div>
      </Html>
    </group>
  );
}

/* ---------- Free-flight movement (first person) ---------- */
function Flyer({ onNear, speed = 12 }) {
  const { camera } = useThree();
  const keys = useRef({});
  const vel = useRef(new THREE.Vector3());
  const dir = useRef(new THREE.Vector3());
  const fwd = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const near = useRef(false);

  useEffect(() => {
    const down = (e) => (keys.current[e.code] = true);
    const up = (e) => (keys.current[e.code] = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame((_, dt) => {
    const k = keys.current;
    const d = dir.current.set(0, 0, 0);
    camera.getWorldDirection(fwd.current);
    right.current.crossVectors(fwd.current, camera.up).normalize();

    if (k.KeyW || k.ArrowUp) d.add(fwd.current);
    if (k.KeyS || k.ArrowDown) d.sub(fwd.current);
    if (k.KeyD || k.ArrowRight) d.add(right.current);
    if (k.KeyA || k.ArrowLeft) d.sub(right.current);
    if (k.Space) d.y += 1;
    if (k.ShiftLeft || k.ShiftRight) d.y -= 1;

    d.normalize().multiplyScalar(speed * (k.KeyF ? 3 : 1));
    vel.current.lerp(d, 1 - Math.exp(-4 * dt)); // smooth acceleration and drift
    camera.position.addScaledVector(vel.current, dt);

    const isNear = camera.position.length() < SPHERE_R + 9;
    if (isNear !== near.current) {
      near.current = isNear;
      onNear(isNear);
    }
  });
  return null;
}

/* ---------- Page ---------- */
export default function SpaceExplorer({
  title = "174,679 answers are floating",
  siteName = "this planet",
  onLand = () => {},
}) {
  const [locked, setLocked] = useState(false);
  const [near, setNear] = useState(false);
  const bots = useMemo(
    () => [
      { name: "explorer_8232", radius: 12, speed: 0.12, phase: 0, height: 1 },
      { name: "explorer_12251", radius: 17, speed: 0.08, phase: 2, height: 3 },
      { name: "explorer_4410", radius: 10, speed: 0.15, phase: 4, height: -2 },
    ],
    []
  );

  return (
    <div style={styles.root}>
      <Canvas camera={{ position: [0, 0, 24], fov: 55, near: 0.1, far: 400 }} dpr={[1, 2]}>
        <color attach="background" args={["#05060a"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[10, 8, 12]} intensity={2.2} />
        <Stars radius={150} depth={60} count={3500} factor={3} fade />
        <Fragments />
        <Planets />
        {bots.map((b) => (
          <Bot key={b.name} {...b} />
        ))}
        <Flyer onNear={setNear} />
        <PointerLockControls onLock={() => setLocked(true)} onUnlock={() => setLocked(false)} />
      </Canvas>

      {/* HUD */}
      <div style={styles.title}>{title}</div>
      <div style={styles.topLeft}>
        <div>3 explorers nearby</div>
      </div>

      {near && (
        <div style={styles.bottom}>
          <button style={styles.land} onClick={() => onLand(siteName)}>
            land here
          </button>
          <div style={styles.sub}>{siteName}</div>
        </div>
      )}

      {!locked && (
        <div style={styles.hint}>
          Click to fly · mouse to look · WASD to move · Space/Shift up/down · F boost · Esc to release
        </div>
      )}
    </div>
  );
}

const mono = 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';
const styles = {
  root: { position: "relative", width: "100%", height: "100vh", background: "#05060a", fontFamily: mono, color: "#fff", overflow: "hidden" },
  title: { position: "absolute", top: 24, left: 0, right: 0, textAlign: "center", fontSize: 18, pointerEvents: "none" },
  topLeft: { position: "absolute", top: 24, left: 24, fontSize: 15, pointerEvents: "none" },
  bottom: { position: "absolute", bottom: 40, left: 0, right: 0, textAlign: "center" },
  land: { background: "#fff", color: "#000", border: "none", borderRadius: 999, padding: "14px 36px", fontFamily: mono, fontSize: 17, cursor: "pointer" },
  sub: { marginTop: 14, fontSize: 15, opacity: 0.85 },
  hint: { position: "absolute", bottom: 20, left: 0, right: 0, textAlign: "center", fontSize: 13, opacity: 0.7, pointerEvents: "none" },
  tag: { display: "flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 13, color: "#fff", whiteSpace: "nowrap" },
  dot: { width: 8, height: 8, borderRadius: "50%", background: "#fff", display: "inline-block" },
};
