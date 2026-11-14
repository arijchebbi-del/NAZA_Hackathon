import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Skydome : grande sphère vue de l'intérieur, avec un ShaderMaterial.
// Il ne reçoit AUCUNE lumière de la scène (ShaderMaterial = pas d'éclairage), donc la nébuleuse rose
// reste dans le fond et ne peut pas teinter la Lune.
// Les couleurs sont écrites directement en valeurs d'affichage (sRGB) : le shader n'applique aucune conversion.

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vDir;
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uCenter;   // direction du ciel où la nébuleuse est la plus dense
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uBright;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.02 + vec3(7.1, 3.3, 1.7);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    vec3 p = d * 2.2 + vec3(0.0, 0.0, uTime * 0.01);
    vec3 q = vec3(fbm(p), fbm(p + vec3(5.2, 1.3, 2.8)), fbm(p + vec3(1.7, 9.2, 4.1)));
    float n = fbm(p * 1.3 + q * 1.6);

    // masque à grande échelle : la nébuleuse occupe une zone du ciel, le reste reste noir
    float mask = smoothstep(0.1, 0.9, dot(d, normalize(uCenter)) * 0.5 + 0.5);
    float cloud = smoothstep(0.36, 0.82, n) * mask;
    float filament = smoothstep(0.55, 0.92, fbm(p * 3.0 + q * 2.0)) * mask;

    vec3 col = mix(uDeep, uMid, smoothstep(0.3, 0.9, n));
    col = mix(col, uBright, filament * 0.8);
    vec3 base = vec3(0.004, 0.003, 0.010);
    gl_FragColor = vec4(base + col * (cloud * 0.55 + filament * 0.35) * uIntensity, 1.0);
  }
`;

export default function NebulaSky({ radius = 500, intensity = 1 }) {
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uIntensity: { value: intensity },
    uCenter: { value: new THREE.Vector3(-0.55, 0.25, -0.8) },
    uDeep: { value: new THREE.Vector3(0.23, 0.08, 0.31) },   // violet profond
    uMid: { value: new THREE.Vector3(0.69, 0.16, 0.48) },    // magenta
    uBright: { value: new THREE.Vector3(1.0, 0.56, 0.78) },  // rose clair
  }), [intensity]);

  useFrame((_, delta) => { uniforms.uTime.value += delta; });

  return (
    <mesh renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[radius, 48, 32]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        side={THREE.BackSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
