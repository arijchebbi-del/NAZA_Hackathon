import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, PointerLockControls, Stars, useTexture } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { Site } from "../api";

interface GlobeSceneProps {
  sites: Site[];
  selectedSiteId: string | null;
  selectedDate: string;
  time?: Date | number | string;
  earthTextureUrls?: EarthTextureUrls;
  freeFlight: boolean;
  onSelect: (id: string) => void;
}

interface EarthTextureUrls {
  albedo: string;
  normal: string;
  specular: string;
}

function timeToEpochMs(time: Date | number | string | undefined, selectedDate: string): number {
  const value = time ?? `${selectedDate}T12:00:00.000Z`;
  const epochMs = value instanceof Date
    ? value.getTime()
    : typeof value === "number"
      ? value
      : Date.parse(value);
  if (!Number.isFinite(epochMs)) throw new RangeError("GlobeScene time must be a valid date or timestamp.");
  return epochMs;
}

function sunDirectionAt(epochMs: number): THREE.Vector3 {
  const lunarMonthMs = 29.53059 * 86_400_000;
  const newMoonEpochMs = Date.parse("2000-01-06T18:14:00.000Z");
  const phase = ((epochMs - newMoonEpochMs) / lunarMonthMs) * Math.PI * 2;
  const lunarObliquity = THREE.MathUtils.degToRad(1.54);
  return new THREE.Vector3(
    Math.cos(phase) * Math.cos(lunarObliquity),
    Math.sin(phase) * Math.sin(lunarObliquity),
    Math.sin(phase) * Math.cos(lunarObliquity),
  ).normalize();
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
  const textures = useTexture({
    map: "/tex/moon_color.jpg",
    normalMap: "/tex/moon_normal.png",
    displacementMap: "/tex/moon_elevation.jpg",
  });
  useEffect(() => {
    textures.map.colorSpace = THREE.SRGBColorSpace;
    textures.map.anisotropy = 8;
    textures.normalMap.colorSpace = THREE.NoColorSpace;
    textures.displacementMap.colorSpace = THREE.NoColorSpace;
  }, [textures]);
  useFrame((_, delta) => {
    if (!hovered && !hoveredSiteId && !selectedSiteId) rotationRef.current += delta * 0.008;
    if (root.current) root.current.rotation.y = rotationRef.current;
  });

  return (
    <group ref={root}>
      <mesh
        ref={moon}
        castShadow
        receiveShadow
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[2.45, 256, 256]} />
        <meshStandardMaterial
          map={textures.map}
          normalMap={textures.normalMap}
          normalScale={[0.8, 0.8]}
          displacementMap={textures.displacementMap}
          displacementScale={0.014}
          displacementBias={-0.007}
          roughness={0.97}
          metalness={0}
        />
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

function MappedEarthMaterial({ urls }: { urls: EarthTextureUrls }) {
  const textures = useTexture({
    map: urls.albedo,
    normalMap: urls.normal,
    specularIntensityMap: urls.specular,
  });
  useEffect(() => {
    textures.map.colorSpace = THREE.SRGBColorSpace;
    textures.map.anisotropy = 8;
    textures.normalMap.colorSpace = THREE.NoColorSpace;
    textures.specularIntensityMap.colorSpace = THREE.NoColorSpace;
  }, [textures]);

  return (
    <meshPhysicalMaterial
      map={textures.map}
      normalMap={textures.normalMap}
      specularIntensityMap={textures.specularIntensityMap}
      specularIntensity={0.65}
      roughness={0.82}
      metalness={0}
    />
  );
}

function Earth({ date, textureUrls }: { date: string; textureUrls?: EarthTextureUrls }) {
  const day = Math.floor((Date.parse(`${date}T12:00:00Z`) - Date.parse("2026-01-01T00:00:00Z")) / 86_400_000);
  const libration = Math.sin(day * 0.0366) * THREE.MathUtils.degToRad(7.9);
  const position: [number, number, number] = [
    Math.sin(libration) * 14,
    0.15,
    Math.cos(libration) * 14,
  ];
  return (
    <group position={position}>
      <mesh receiveShadow>
        <sphereGeometry args={[0.48, 64, 64]} />
        {textureUrls
          ? <MappedEarthMaterial urls={textureUrls} />
          : <meshStandardMaterial color="#347ca3" roughness={0.82} metalness={0} />}
      </mesh>
      <mesh scale={1.04}>
        <sphereGeometry args={[0.48, 64, 64]} />
        <meshBasicMaterial color="#82c7ef" transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>
      <Html position={[0.5, 0.18, 0]} distanceFactor={15}>
        <span className="earth-tag">EARTH</span>
      </Html>
    </group>
  );
}

function SunLight({ position }: { position: THREE.Vector3 }) {
  const light = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    if (!light.current) return;
    const shadow = light.current.shadow;
    shadow.mapSize.set(2048, 2048);
    shadow.camera.left = -3.2;
    shadow.camera.right = 3.2;
    shadow.camera.top = 3.2;
    shadow.camera.bottom = -3.2;
    shadow.camera.near = 0.1;
    shadow.camera.far = 50;
    shadow.bias = -0.00005;
    shadow.normalBias = 0.004;
    shadow.camera.updateProjectionMatrix();
  }, []);

  return (
    <directionalLight
      ref={light}
      position={position}
      intensity={4}
      color="#fff4df"
      castShadow
    />
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
      targetFrom: controls.current?.target.clone() ?? new THREE.Vector3(0, -2.45, 0),
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
      minDistance={2.7}
      maxDistance={14}
      enablePan
      target={[0, -2.35, 0]}
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
  const epochMs = timeToEpochMs(props.time, props.selectedDate);
  const sunPosition = useMemo(() => sunDirectionAt(epochMs).multiplyScalar(40), [epochMs]);
  return (
    <Canvas
      className="globe-canvas"
      dpr={[1, 1.6]}
      shadows
      camera={{ position: [0, -5.7, 0], fov: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ camera }) => camera.lookAt(0, -2.35, 0)}
    >
      <color attach="background" args={["#090d10"]} />
      <ambientLight intensity={0.005} />
      <SunLight position={sunPosition} />
      <Stars radius={85} depth={48} count={2400} factor={3} saturation={0.15} fade speed={0.16} />
      <Moon sites={props.sites} selectedSiteId={props.selectedSiteId} onSelect={props.onSelect} rotationRef={rotationRef} />
      <Earth date={props.selectedDate} textureUrls={props.earthTextureUrls} />
      <ExplorerBot position={[-3.4, 0.4, 2.3]} label="PATHFINDER 07" delay={0.2} />
      <ExplorerBot position={[3.2, 2.1, -0.5]} label="SCOUT 02" delay={2.2} />
      <CameraFlight selectedSiteId={props.selectedSiteId} sites={props.sites} rotationRef={rotationRef} />
      <FreeFlight enabled={props.freeFlight} />
    </Canvas>
  );
}
