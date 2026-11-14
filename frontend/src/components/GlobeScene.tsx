import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, PointerLockControls, Stars } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { Site } from "../api";

interface GlobeSceneProps {
  sites: Site[];
  selectedSiteId: string | null;
  selectedDate: string;
  freeFlight: boolean;
  onSelect: (id: string) => void;
}

function seededNoise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeLunarTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 384;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable for the procedural lunar texture.");
  const image = context.createImageData(canvas.width, canvas.height);
  const noise = seededNoise(19460217);
  for (let index = 0; index < image.data.length; index += 4) {
    const value = 93 + Math.floor(noise() * 48);
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value + 2;
    image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const craters = seededNoise(913704);
  for (let index = 0; index < 280; index += 1) {
    const x = craters() * canvas.width;
    const y = craters() * canvas.height;
    const radius = 2 + craters() * 20;
    const shade = Math.floor(72 + craters() * 80);
    const gradient = context.createRadialGradient(x, y, radius * 0.1, x, y, radius);
    gradient.addColorStop(0, `rgba(${shade - 22},${shade - 22},${shade - 18},0.48)`);
    gradient.addColorStop(0.7, `rgba(${shade},${shade},${shade + 3},0.3)`);
    gradient.addColorStop(1, "rgba(35,38,42,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "rgba(29,31,34,0.28)";
    context.lineWidth = Math.max(1, radius * 0.08);
    context.beginPath();
    context.arc(x, y, radius * 0.72, 0, Math.PI * 2);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function sitePosition(site: Site, radius: number): THREE.Vector3 {
  const lat = THREE.MathUtils.degToRad(site.lat);
  const lon = THREE.MathUtils.degToRad(site.lon);
  return new THREE.Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.sin(lon),
  ).multiplyScalar(radius);
}

function markerColor(score: number | null): string {
  if (score === null) return "#87939b";
  if (score >= 70) return "#a8ef88";
  if (score >= 40) return "#f5b765";
  return "#ee6f69";
}

function InstancedSiteMarkers({
  sites,
  selectedSiteId,
  hoveredSiteId,
  onSelect,
  onHover,
}: {
  sites: Site[];
  selectedSiteId: string | null;
  hoveredSiteId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.SphereGeometry(0.055, 12, 12), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true }), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    if (!mesh.current) return;
    sites.forEach((site, index) => {
      dummy.position.copy(sitePosition(site, 2.5));
      dummy.scale.setScalar(site.id === selectedSiteId ? 1.45 : 1);
      dummy.updateMatrix();
      mesh.current?.setMatrixAt(index, dummy.matrix);
      mesh.current?.setColorAt(index, new THREE.Color(markerColor(site.score)));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [dummy, selectedSiteId, sites]);
  return (
    <>
      <instancedMesh
        ref={mesh}
        args={[geometry, material, sites.length]}
        onClick={(event) => {
          event.stopPropagation();
          const site = event.instanceId === undefined ? undefined : sites[event.instanceId];
          if (site) onSelect(site.id);
        }}
        onPointerOver={(event) => {
          const site = event.instanceId === undefined ? undefined : sites[event.instanceId];
          if (site) onHover(site.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = "default"; }}
      />
      {sites.filter((site) => site.id === (hoveredSiteId ?? selectedSiteId)).map((site) => (
        <group key={site.id} position={sitePosition(site, 2.7).toArray()}>
          <Html distanceFactor={7}>
            <div className={`scene-tag ${site.id === selectedSiteId ? "scene-tag-active" : ""}`}>
              <span className="scene-tag-dot" style={{ backgroundColor: markerColor(site.score) }} />
              {site.name}<small>{site.score ?? "—"} / 100</small>
            </div>
          </Html>
        </group>
      ))}
    </>
  );
}

function Moon({
  sites,
  selectedSiteId,
  onSelect,
  rotationRef,
}: Pick<GlobeSceneProps, "sites" | "selectedSiteId" | "onSelect"> & { rotationRef: MutableRefObject<number> }) {
  const moon = useRef<THREE.Mesh>(null);
  const root = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null);
  const texture = useMemo(() => makeLunarTexture(), []);
  useFrame((_, delta) => {
    if (!hovered && !hoveredSiteId && !selectedSiteId) rotationRef.current += delta * 0.008;
    if (root.current) root.current.rotation.y = rotationRef.current;
  });
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <group ref={root}>
      <mesh
        ref={moon}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[2.45, 80, 80]} />
        <meshStandardMaterial map={texture} bumpMap={texture} bumpScale={0.075} roughness={1} metalness={0} />
      </mesh>
      {sites.length > 50 ? (
        <InstancedSiteMarkers
          sites={sites}
          selectedSiteId={selectedSiteId}
          hoveredSiteId={hoveredSiteId}
          onSelect={onSelect}
          onHover={setHoveredSiteId}
        />
      ) : sites.map((site) => {
        const color = markerColor(site.score);
        const isSelected = selectedSiteId === site.id;
        return (
          <group key={site.id} position={sitePosition(site, 2.49).toArray()}>
            <mesh
              onClick={(event) => { event.stopPropagation(); onSelect(site.id); }}
              onPointerOver={(event) => {
                event.stopPropagation();
                setHoveredSiteId(site.id);
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => { setHoveredSiteId(null); document.body.style.cursor = "default"; }}
            >
              <sphereGeometry args={[isSelected ? 0.065 : 0.045, 16, 16]} />
              <meshBasicMaterial color={color} />
            </mesh>
            <mesh>
              <sphereGeometry args={[isSelected ? 0.12 : 0.078, 12, 12]} />
              <meshBasicMaterial color={color} transparent opacity={0.24} />
            </mesh>
            {((hoveredSiteId ?? selectedSiteId) === site.id) && (
              <Html position={[0.12, 0.12, 0]} distanceFactor={7} zIndexRange={[8, 0]}>
                <div className={`scene-tag ${isSelected ? "scene-tag-active" : ""}`}>
                  <span className="scene-tag-dot" style={{ backgroundColor: color }} />
                  {site.name}<small>{site.score ?? "—"} / 100</small>
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

function ExplorerBot({ position, label, delay }: { position: [number, number, number]; label: string; delay: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const time = clock.getElapsedTime() + delay;
    ref.current.position.y = position[1] + Math.sin(time * 0.6) * 0.08;
    ref.current.rotation.y = Math.sin(time * 0.2) * 0.18;
  });
  return (
    <group ref={ref} position={position}>
      <mesh>
        <icosahedronGeometry args={[0.13, 1]} />
        <meshStandardMaterial color="#a8d7dc" emissive="#376c71" emissiveIntensity={0.7} roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.13, 0]}>
        <cylinderGeometry args={[0.11, 0.04, 0.12, 6]} />
        <meshStandardMaterial color="#5e7779" />
      </mesh>
      <Html position={[0, 0.25, 0]} distanceFactor={12}>
        <span className="bot-tag">{label}</span>
      </Html>
    </group>
  );
}

function Earth({ date }: { date: string }) {
  const day = Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse("2026-01-01T00:00:00Z")) / 86_400_000);
  const angle = 1.1 + day * 0.0048;
  const position: [number, number, number] = [Math.cos(angle) * 10, 2.3 + Math.sin(angle * 0.65) * 0.35, Math.sin(angle) * 10];
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.48, 36, 36]} />
        <meshStandardMaterial color="#3985b3" emissive="#0b2947" emissiveIntensity={0.55} roughness={0.85} />
      </mesh>
      <mesh scale={1.04}>
        <sphereGeometry args={[0.48, 36, 36]} />
        <meshBasicMaterial color="#82c7ef" transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>
      <Html position={[0.5, 0.18, 0]} distanceFactor={15}>
        <span className="earth-tag">EARTH</span>
      </Html>
    </group>
  );
}

function CameraFlight({ selectedSiteId, sites, rotationRef }: Pick<GlobeSceneProps, "selectedSiteId" | "sites"> & { rotationRef: MutableRefObject<number> }) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const { camera } = useThree();
  const flight = useRef<{ from: THREE.Vector3; to: THREE.Vector3; targetFrom: THREE.Vector3; targetTo: THREE.Vector3; start: number } | null>(null);

  useEffect(() => {
    const site = sites.find((item) => item.id === selectedSiteId);
    if (!site) return;
    const surface = sitePosition(site, 2.45).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationRef.current);
    const direction = surface.clone().normalize();
    const target = direction.clone().multiplyScalar(2.1);
    const nextPosition = direction.clone().multiplyScalar(7.1).add(new THREE.Vector3(0, 0.4, 0));
    flight.current = {
      from: camera.position.clone(),
      to: nextPosition,
      targetFrom: controls.current?.target.clone() ?? new THREE.Vector3(0, -2.05, 0),
      targetTo: target,
      start: performance.now(),
    };
  }, [selectedSiteId, sites, camera, rotationRef]);

  useFrame(() => {
    const active = flight.current;
    if (!active) return;
    const progress = Math.min(1, (performance.now() - active.start) / 1200);
    const eased = 1 - Math.pow(1 - progress, 3);
    camera.position.lerpVectors(active.from, active.to, eased);
    if (controls.current) {
      controls.current.target.lerpVectors(active.targetFrom, active.targetTo, eased);
      controls.current.update();
    } else {
      camera.lookAt(active.targetTo);
    }
    if (progress === 1) flight.current = null;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.07}
      minDistance={3.5}
      maxDistance={13}
      enablePan={false}
      target={[0, -2.05, 0]}
    />
  );
}

function FreeFlight({ enabled }: { enabled: boolean }) {
  const { camera } = useThree();
  const pressed = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled) return;
    const down = (event: KeyboardEvent) => pressed.current.add(event.code);
    const up = (event: KeyboardEvent) => pressed.current.delete(event.code);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      pressed.current.clear();
    };
  }, [enabled]);
  useFrame((_, delta) => {
    if (!enabled) return;
    const keys = pressed.current;
    const speed = (keys.has("KeyF") ? 8 : 3.2) * delta;
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    if (keys.has("KeyW")) camera.position.addScaledVector(direction, speed);
    if (keys.has("KeyS")) camera.position.addScaledVector(direction, -speed);
    const right = new THREE.Vector3().crossVectors(direction, camera.up).normalize();
    if (keys.has("KeyD")) camera.position.addScaledVector(right, speed);
    if (keys.has("KeyA")) camera.position.addScaledVector(right, -speed);
    if (keys.has("Space")) camera.position.y += speed;
    if (keys.has("ShiftLeft") || keys.has("ShiftRight")) camera.position.y -= speed;
  });
  return enabled ? <PointerLockControls /> : null;
}

export default function GlobeScene(props: GlobeSceneProps) {
  const rotationRef = useRef(0);
  return (
    <Canvas
      className="globe-canvas"
      dpr={[1, 1.6]}
      camera={{ position: [0, -2.2, 8.2], fov: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ camera }) => camera.lookAt(0, -2.05, 0)}
    >
      <color attach="background" args={["#090d10"]} />
      <ambientLight intensity={0.22} />
      <directionalLight position={[-6, 3, 5]} intensity={3.2} color="#ffe7bd" />
      <Stars radius={85} depth={48} count={2400} factor={3} saturation={0.15} fade speed={0.16} />
      <Moon sites={props.sites} selectedSiteId={props.selectedSiteId} onSelect={props.onSelect} rotationRef={rotationRef} />
      <Earth date={props.selectedDate} />
      <ExplorerBot position={[-3.4, 0.4, 2.3]} label="PATHFINDER 07" delay={0.2} />
      <ExplorerBot position={[3.2, 2.1, -0.5]} label="SCOUT 02" delay={2.2} />
      <CameraFlight selectedSiteId={props.selectedSiteId} sites={props.sites} rotationRef={rotationRef} />
      <FreeFlight enabled={props.freeFlight} />
    </Canvas>
  );
}
